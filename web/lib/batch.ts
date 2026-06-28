import "server-only";
import { db, clean } from "./firebase-admin";
import { getProfile } from "./profile";
import { scrapeAndStore } from "./scrape";
import { matchJob } from "./match";
import { enrichJob } from "./jd";
import { tailorResume } from "./tailor";
import { buildResume } from "./latex";
import { submitApplication } from "./apply";
import { startRun, event, finishRun } from "./runlog";
import type { Application, Job, JobSource, Profile, Run } from "./types";

/**
 * The autonomous daily engine (R6).
 *
 *   scrape → load unprocessed jobs → match (>60% gate) → for each up to the
 *   daily quota: fetch JD → tailor → compile LaTeX PDF → apply → track.
 *
 * Enforces a per-run quota, a per-source cap, and a human-like throttle. All
 * progress streams into a Firestore `runs` doc via lib/runlog. Safe by default:
 * honours profile.automation.live (false = dry-run, no real submissions).
 */

export interface BatchOptions {
  trigger: "cron" | "manual";
  quotaOverride?: number;
  /** Force dry-run regardless of profile.automation.live. */
  dryRun?: boolean;
  /**
   * Open a VISIBLE browser per apply and do it in front of the user, one at a
   * time (forces concurrency 1). Manual trigger only — never the cron.
   */
  supervised?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));

interface RunContext {
  run: Run;
  profile: Profile;
  live: boolean;
  quota: number;
  supervised: boolean;
}

/** Create the run doc up front so callers get an id immediately. */
async function prepareRun(opts: BatchOptions): Promise<RunContext> {
  const profile = await getProfile();
  const auto = profile.automation;
  const live = opts.dryRun ? false : auto.live;
  const quota = opts.quotaOverride ?? auto.dailyQuota;
  const supervised = !!opts.supervised;
  const run = await startRun({ live, quota, trigger: opts.trigger });
  await event(
    run,
    "info",
    `Run started — ${live ? "LIVE submissions" : "DRY-RUN (no submit)"}, quota ${quota}${supervised ? ", supervised (visible browser)" : ""}.`,
  );
  return { run, profile, live, quota, supervised };
}

/** Synchronous full run — awaits completion (used by Trigger.dev / tests). */
export async function runBatch(opts: BatchOptions): Promise<Run> {
  const ctx = await prepareRun(opts);
  await executeRun(ctx);
  return ctx.run;
}

/**
 * Fire-and-forget: start the run in the background and return its id at once,
 * so the cron HTTP request returns immediately instead of waiting ~minutes.
 */
export async function kickBatch(opts: BatchOptions): Promise<{ runId: string }> {
  const ctx = await prepareRun(opts);
  void executeRun(ctx).catch(async (err) => {
    await event(ctx.run, "error", `Run crashed: ${(err as Error).message}`);
    await finishRun(ctx.run, "error");
  });
  return { runId: ctx.run.id };
}

async function executeRun(ctx: RunContext): Promise<void> {
  const { run, profile, live, quota, supervised } = ctx;
  const auto = profile.automation;

  try {
    // 1) Refresh the job store.
    await event(run, "info", "Scraping live sources…");
    for await (const ev of scrapeAndStore()) {
      if (ev.type === "done") await event(run, "success", ev.message);
      else if (ev.type === "error") await event(run, "warn", ev.message);
    }

    // 2) Load unprocessed candidate jobs from the allowed sources.
    const candidates = await loadCandidates(auto.sources, 500);
    await event(run, "info", `${candidates.length} unprocessed jobs to evaluate.`);

    // 3) Match + bucket.
    const autoApply: { job: Job; app: Application }[] = [];
    const perSource: Record<string, number> = {};

    for (const job of candidates) {
      const match = matchJob(job, profile);
      const app = baseApplication(job, match.confidence, run.id);
      app.match = match;

      if (match.verdict === "skip") {
        app.status = "skipped";
        await saveApp(app);
        await markProcessed(job.id);
        await event(run, "info", `Skip — ${job.title} @ ${job.company} (${match.confidence}%).`, { scanned: 1, skipped: 1 }, { jobId: job.id, stage: "match" });
        continue;
      }

      if (match.verdict === "review") {
        app.status = "matched";
        await saveApp(app);
        await markProcessed(job.id);
        await event(run, "info", `Held for review — ${job.title} (${match.confidence}%).`, { scanned: 1, matched: 1, heldForReview: 1 }, { jobId: job.id, stage: "match" });
        continue;
      }

      // auto-apply (confidence ≥ minConfidence, i.e. the >60% gate)
      const cap = auto.maxPerSource;
      if ((perSource[job.source] ?? 0) >= cap) {
        await event(run, "info", `Source cap hit for ${job.source} (${cap}) — deferring ${job.title}.`, { scanned: 1 });
        continue;
      }
      perSource[job.source] = (perSource[job.source] ?? 0) + 1;
      autoApply.push({ job, app });
      await event(run, "success", `Matched ${match.confidence}% — queued ${job.title} @ ${job.company}.`, { scanned: 1, matched: 1 }, { jobId: job.id, stage: "match" });

      if (autoApply.length >= quota) break;
    }

    await event(run, "info", `${autoApply.length} jobs queued for apply (quota ${quota}).`);

    // 4) Process the queue with bounded concurrency + throttle. Supervised runs
    //    force concurrency 1 so windows open one at a time, in front of the user.
    const concurrency = supervised ? 1 : Math.max(1, auto.concurrency);
    for (let i = 0; i < autoApply.length; i += concurrency) {
      const chunk = autoApply.slice(i, i + concurrency);
      await Promise.all(chunk.map(({ job, app }) => processOne(run, profile, job, app, live, supervised)));
      if (i + concurrency < autoApply.length) {
        await sleep(rand(auto.throttleMinMs, auto.throttleMaxMs));
      }
    }

    await finishRun(run, "done");
    await event(run, "success", `Run complete — applied ${run.counts.applied}, held ${run.counts.heldForReview}, skipped ${run.counts.skipped}, failed ${run.counts.failed}.`);
  } catch (err) {
    await event(run, "error", `Run aborted: ${(err as Error).message}`);
    await finishRun(run, "error");
  }
}

/** One job through fetch-JD → tailor → LaTeX → apply → track. */
async function processOne(run: Run, profile: Profile, job: Job, app: Application, live: boolean, supervised: boolean): Promise<void> {
  try {
    const jd = await enrichJob(job);
    const match = app.match!;
    const { tailored } = await tailorResume(job, profile, match, {
      descriptionText: jd.descriptionText,
      keywords: jd.keywords,
      missingSkills: match.missingSkills,
    });
    const resume = await buildResume({ jobId: job.id, profile, tailored, match, jdKeywords: jd.keywords });
    app.tailored = tailored;
    app.resumePdfUrl = resume.pdfUrl;
    await event(run, "info", `Tailored résumé for ${job.title} (${resume.compiledWith}).`, { tailored: 1 }, { jobId: job.id, stage: "tailor" });

    const result = await submitApplication(job, tailored, {
      profile,
      resumePath: resume.pdfPath,
      coverNote: tailored.coverNote,
      applyType: jd.applyType,
      applyUrl: jd.applyUrl,
      live,
      supervised,
    });

    app.submitMethod = result.method;
    app.confirmation = result.confirmation;
    app.screenshotUrl = result.screenshotUrl;
    app.appliedAt = result.appliedAt;
    app.error = result.error;

    if (result.error) {
      app.status = "matched";
      await saveApp(app);
      await markProcessed(job.id);
      await event(run, "error", `Apply failed — ${job.title}: ${result.error}`, { failed: 1 }, { jobId: job.id, stage: "apply" });
      return;
    }

    if (result.submitted) {
      app.status = "applied";
      app.followUps = [
        { at: new Date(Date.now() + 4 * 864e5).toISOString(), channel: "email", note: `Follow up with ${job.company}`, done: false },
      ];
      await saveApp(app);
      await markProcessed(job.id);
      await event(run, "success", `Applied to ${job.title} @ ${job.company} via ${result.method}.`, { applied: 1 }, { jobId: job.id, stage: "apply" });
    } else {
      // Dry-run (or no submit button): form prepared, nothing sent.
      app.status = "matched";
      await saveApp(app);
      await markProcessed(job.id);
      await event(run, "info", `Dry-run prepared — ${job.title} (${result.method}).`, {}, { jobId: job.id, stage: "apply" });
    }
  } catch (err) {
    app.status = "matched";
    app.error = (err as Error).message;
    await saveApp(app);
    await markProcessed(job.id);
    await event(run, "error", `Error on ${job.title}: ${(err as Error).message}`, { failed: 1 }, { jobId: job.id, stage: "apply" });
  }
}

async function loadCandidates(sources: JobSource[], limit: number): Promise<Job[]> {
  const snap = await db().collection("jobs").limit(limit).get();
  const allow = new Set(sources);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }))
    .filter((j) => !j.processedAt && allow.has(j.source));
}

function baseApplication(job: Job, confidence: number, runId: string): Application {
  return {
    id: db().collection("applications").doc().id,
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    source: job.source,
    status: "matched",
    confidence,
    createdAt: new Date().toISOString(),
    followUps: [],
    runId,
  };
}

async function saveApp(app: Application): Promise<void> {
  await db().collection("applications").doc(app.id).set(clean(app));
}

async function markProcessed(jobId: string): Promise<void> {
  await db().collection("jobs").doc(jobId).set({ processedAt: new Date().toISOString() }, { merge: true });
}
