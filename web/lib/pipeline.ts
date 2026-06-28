import "server-only";
import { db, clean } from "./firebase-admin";
import { getProfile } from "./profile";
import { matchJob } from "./match";
import { tailorResume } from "./tailor";
import { enrichJob } from "./jd";
import { buildResume } from "./latex";
import { submitApplication } from "./apply";
import type {
  Application,
  Job,
  PipelineEvent,
  PipelineStageId,
  StageStatus,
} from "./types";

function ev(
  stage: PipelineStageId,
  status: StageStatus,
  message: string,
  data?: unknown,
): PipelineEvent {
  return { stage, status, message, data, at: new Date().toISOString() };
}

async function loadJob(jobId: string): Promise<Job | null> {
  const snap = await db().collection("jobs").doc(jobId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Job, "id">) };
}

/**
 * The end-to-end vertical slice for ONE job:
 *   scrape → match → tailor → apply → track
 * Yields a PipelineEvent per transition so the UI can render it live.
 */
export async function* runPipeline(
  jobId: string,
  opts: { supervised?: boolean; signal?: AbortSignal } = {},
): AsyncGenerator<PipelineEvent> {
  const stopped = () => !!opts.signal?.aborted;

  // 1. SCRAPE — pull the job from the store.
  yield ev("scrape", "running", "Loading job from the store…");
  const job = await loadJob(jobId);
  if (!job) {
    yield ev("scrape", "error", `Job ${jobId} not found.`);
    return;
  }
  const profile = await getProfile();
  yield ev("scrape", "done", `Loaded “${job.title}” @ ${job.company}.`, { job });
  if (stopped()) {
    yield ev("match", "error", "Stopped by you.");
    return;
  }

  // 2. MATCH — score against the profile.
  yield ev("match", "running", "Scoring against your profile…");
  const match = matchJob(job, profile);
  yield ev(
    "match",
    "done",
    `Confidence ${match.confidence}% — verdict: ${match.verdict}.`,
    { match },
  );

  const appRef = db().collection("applications").doc();
  const base: Application = {
    id: appRef.id,
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    source: job.source,
    status: "matched",
    confidence: match.confidence,
    match,
    createdAt: new Date().toISOString(),
    followUps: [],
  };

  if (match.verdict === "skip") {
    yield ev("tailor", "skipped", "Below review threshold — skipping tailor.");
    yield ev("apply", "skipped", "Not applying to a low-confidence match.");
    await appRef.set(clean({ ...base, status: "skipped" }));
    yield ev("track", "done", "Logged as skipped.", { application: { ...base, status: "skipped" } });
    return;
  }

  if (stopped()) {
    yield ev("tailor", "error", "Stopped by you.");
    return;
  }

  // 3. TAILOR — fetch the JD, rewrite the resume, compile a per-job PDF.
  yield ev("tailor", "running", "Fetching the JD & extracting keywords…");
  const jd = await enrichJob(job);
  const tailorJd = {
    descriptionText: jd.descriptionText,
    keywords: jd.keywords,
    missingSkills: match.missingSkills,
  };
  const { tailored, usedAI } = await tailorResume(job, profile, match, tailorJd);
  yield ev(
    "tailor",
    "running",
    usedAI ? "Resume tailored by GPT — compiling LaTeX PDF…" : "Resume tailored (deterministic) — compiling LaTeX PDF…",
    { tailored, usedAI, jdKeywords: jd.keywords },
  );
  const resume = await buildResume({ jobId: job.id, profile, tailored, match, jdKeywords: jd.keywords });
  base.tailored = tailored;
  base.resumePdfUrl = resume.pdfUrl;
  yield ev(
    "tailor",
    "done",
    resume.compiledWith === "stub"
      ? "Tailored — no LaTeX compiler on host, emitted .tex only (install Tectonic for PDFs)."
      : `Tailored résumé PDF compiled (${resume.compiledWith}). Injected: ${resume.injectedKeywords.join(", ") || "none"}.`,
    { tailored, resume },
  );

  if (stopped()) {
    yield ev("apply", "error", "Stopped by you.");
    return;
  }

  // 4. APPLY — only auto-submit when confidence clears the auto-apply gate.
  if (match.verdict === "auto-apply") {
    yield ev(
      "apply",
      "running",
      opts.supervised
        ? "Opening a visible browser — applying in front of you…"
        : "Submitting your application…",
    );
    const result = await submitApplication(job, tailored, {
      profile,
      resumePath: resume.pdfPath,
      coverNote: tailored.coverNote,
      applyType: jd.applyType,
      applyUrl: jd.applyUrl,
      live: profile.automation.live,
      supervised: opts.supervised,
      signal: opts.signal,
    });
    base.status = result.submitted ? "applied" : "matched";
    base.appliedAt = result.appliedAt;
    base.submitMethod = result.method;
    base.confirmation = result.confirmation;
    base.screenshotUrl = result.screenshotUrl;
    base.error = result.error;
    yield ev(
      "apply",
      result.submitted ? "done" : "skipped",
      result.submitted
        ? `Applied via ${result.method} — confirmation ${result.confirmation}.`
        : `Dry-run (${result.method}): form prepared, not submitted (automation.live=false).`,
      { result },
    );
  } else {
    base.status = "matched";
    base.tailored = tailored;
    yield ev(
      "apply",
      "skipped",
      `Held for review (confidence ${match.confidence}% < auto-apply ${profile.preferences.minConfidence}%).`,
    );
  }

  if (stopped()) {
    yield ev("track", "error", "Stopped by you.");
    return;
  }

  // 5. TRACK — persist + schedule a follow-up.
  yield ev("track", "running", "Recording application & scheduling follow-up…");
  if (base.status === "applied") {
    const followAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
    base.followUps = [
      { at: followAt, channel: "email", note: `Follow up with ${job.company}`, done: false },
    ];
  }
  await appRef.set(clean(base));
  yield ev("track", "done", base.status === "applied" ? "Tracked + follow-up scheduled." : "Saved to review queue.", {
    application: base,
  });
}
