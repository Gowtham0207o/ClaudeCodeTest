import "server-only";
import { db, clean } from "./firebase-admin";
import { getProfile } from "./profile";
import { extractKeywords } from "./jd";
import { matchJob } from "./match";
import { buildResume, readBaseTemplate, emitAndCompile } from "./latex";
import { generateJson, hasOpenAI } from "./openai";
import type { Application, Job, TailoredResume } from "./types";

/**
 * Resume Tailor (R4, manual variant).
 *
 * Paste a job description → pull its skill keywords → inject the ones the
 * résumé doesn't already mention into the LaTeX résumé's "Others" line → compile
 * a per-JD PDF. Uses OpenAI to extract a comprehensive keyword set when a key is
 * configured, falling back to the deterministic vocabulary scanner.
 */

export interface TailorFromJdInput {
  jobDescription: string;
  jobTitle?: string;
  company?: string;
}

export interface TailorFromJdResult {
  pdfUrl: string;
  compiledWith: "tectonic" | "hosted" | "stub";
  /** All keywords detected in the JD. */
  keywords: string[];
  /** The subset actually woven in / added (not already present). */
  addedKeywords: string[];
  /** "deep" = AI rewrote the whole résumé; "skills-only" = appended to Others. */
  mode: "deep" | "skills-only";
  /** The tracked manual-application record created for this tailoring. */
  applicationId: string;
}

function uniqCI(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const v = it.trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Split a LaTeX template into its preamble (incl. \begin{document}) and body. */
function splitTemplate(tpl: string): { preamble: string; body: string } | null {
  const open = "\\begin{document}";
  const i = tpl.indexOf(open);
  const j = tpl.lastIndexOf("\\end{document}");
  if (i === -1 || j === -1 || j < i) return null;
  return { preamble: tpl.slice(0, i + open.length), body: tpl.slice(i + open.length, j) };
}

const TAILOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    latexBody: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
  },
  required: ["latexBody", "keywords"],
} as const;

/**
 * ONE GPT call that BOTH extracts the JD's keywords AND rewrites the résumé body
 * weaving them in naturally across every section — truthfully (keeps real
 * companies/dates/metrics). Combining avoids a second call + sending the JD
 * twice. Returns null if AI is unavailable or the call fails.
 */
async function deepTailor(
  body: string,
  jd: string,
): Promise<{ latexBody: string; keywords: string[] } | null> {
  if (!hasOpenAI()) return null;
  try {
    const out = await generateJson<{ latexBody: string; keywords: string[] }>({
      schemaName: "tailored_resume",
      schema: TAILOR_SCHEMA as unknown as Record<string, unknown>,
      // The model must echo back the ENTIRE rewritten LaTeX body (~5KB) plus the
      // expanded system-design rationale, so it needs generous output headroom —
      // 3000 truncated the response, producing invalid JSON and silently falling
      // back to skills-only mode.
      maxTokens: 8000,
      system:
        "You are an expert technical résumé writer and LaTeX author. You tailor résumés TRUTHFULLY: you reframe and emphasize the candidate's real experience using the target job's vocabulary, but you NEVER invent employers, titles, dates, degrees, or fabricated metrics, and you only weave in a skill where it is genuinely defensible from the existing content.",
      user: `Tailor my résumé to the target job in ONE pass.

STEP 1 — From the job description, list the concrete technical skills/tools/languages/frameworks/platforms it requires (put them in "keywords"; short terms only, no phrases, no soft skills, deduplicated).
STEP 2 — Rewrite my résumé BODY (LaTeX) weaving those keywords in naturally:
  a) OTHERS LINE: Add new JD keywords (not already in Languages/Backend/Frontend lines) to the \\textbf{Others} line. If Others already has content, append after a comma.
  b) EXPERIENCE & PROJECTS: For every bullet that mentions a technology or architectural choice, add a brief system-design rationale — WHY that choice was made (e.g. "opted for Kafka over REST polling for durability and back-pressure handling", "PostgreSQL chosen for ACID guarantees on financial transactions"). Keep rationale inline, not as a separate bullet.
  c) IMPACT: Lead every bullet with a strong action verb and close with a metric or outcome. Reframe existing bullets to foreground the skills the JD emphasizes.
  d) Never keyword-stuff — every mention must read as genuine usage, not a list.

HARD RULES (truthfulness — do not break these)
- Keep EVERY real company, role/title, date, location, education entry, achievement and hyperlink EXACTLY as given.
- Never invent jobs, fake numbers/metrics, or skills with no basis. Only surface skills plausibly defensible from the existing content. Reframe; don't fabricate.
- Reuse the SAME LaTeX macros/structure already present (\\section, \\resumeSubheading, \\resumeItem, \\resumeItemListStart/End, \\resumeProjectHeading, etc.). Keep it compilable.
- "latexBody" = ONLY what goes between \\begin{document} and \\end{document} (no preamble, no \\documentclass, no document tags).

TARGET JOB DESCRIPTION:
${jd.slice(0, 3500)}

CURRENT RÉSUMÉ BODY (LaTeX):
${body}`,
    });
    let latex = (out.latexBody || "").trim();
    if (!latex) return null;
    // Defensive: strip anything that leaked past the instructions.
    latex = latex
      .replace(/[\s\S]*\\begin\{document\}/, "")
      .replace(/\\end\{document\}[\s\S]*/, "")
      .replace(/^\s*```(?:latex|tex)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    if (!latex) return null;
    const keywords = uniqCI(
      (out.keywords ?? [])
        .map((s) => String(s).trim())
        .filter((s) => s && s.length <= 32 && s.split(/\s+/).length <= 4),
    );
    return { latexBody: latex, keywords };
  } catch (err) {
    console.error("[resume-tailor] deep tailoring failed:", err);
    return null;
  }
}

/** Keywords not already present in `text` (word-boundary, case-insensitive). */
function newKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter((k) => {
    const esc = k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(^|[^a-z0-9+#.])${esc}([^a-z0-9+#.]|$)`, "i").test(text);
  });
}

export async function tailorResumeFromJd(
  input: TailorFromJdInput,
): Promise<TailorFromJdResult> {
  const jd = (input.jobDescription ?? "").trim();
  if (jd.length < 30) throw new Error("Paste a fuller job description (at least a few sentences).");

  const profile = await getProfile();
  const jobId = `tailor-${Date.now().toString(36)}`;
  const template = await readBaseTemplate(profile);
  const split = splitTemplate(template);

  type Core = Pick<TailorFromJdResult, "pdfUrl" | "compiledWith" | "keywords" | "addedKeywords" | "mode">;
  let core: Core | null = null;

  // ── Deep mode: ONE GPT call extracts keywords AND rewrites the whole body. ──
  if (split) {
    const cleanBody = split.body.replace(/%%EXTRA_SKILLS%%/g, "");
    const deep = await deepTailor(cleanBody, jd);
    if (deep) {
      const tex = `${split.preamble}\n${deep.latexBody}\n\\end{document}\n`;
      const woven = newKeywords(cleanBody, deep.keywords);
      const artifact = await emitAndCompile(jobId, tex, woven, { allowHosted: false });
      if (artifact.compiledWith !== "stub") {
        core = {
          pdfUrl: artifact.pdfUrl,
          compiledWith: artifact.compiledWith,
          keywords: deep.keywords,
          addedKeywords: woven,
          mode: "deep",
        };
      }
      // else: AI body didn't compile — fall through to the safe, GPT-free path.
    }
  }

  // ── Fallback: deterministic, NO GPT — vocabulary keywords into "Others". ──
  if (!core) {
    const keywords = extractKeywords(jd);
    const fJob: Job = {
      id: jobId,
      title: input.jobTitle?.trim() || "Tailored Résumé",
      company: input.company?.trim() || "—",
      source: "manual",
      descriptionText: jd,
      requiredSkills: keywords.slice(0, 20),
    };
    const fMatch = matchJob(fJob, profile);
    const tailored: TailoredResume = {
      headline: "", summary: "", highlightedBullets: [], coverNote: "",
      emphasizedSkills: [], rationale: "", injectedKeywords: [],
    };
    const resume = await buildResume({ jobId, profile, tailored, match: fMatch, jdKeywords: keywords });
    core = {
      pdfUrl: resume.pdfUrl,
      compiledWith: resume.compiledWith,
      keywords,
      addedKeywords: resume.injectedKeywords,
      mode: "skills-only",
    };
  }

  // ── Persist as a tracked manual application (draft) for future reference. ──
  const job: Job = {
    id: jobId,
    title: input.jobTitle?.trim() || "Tailored Résumé",
    company: input.company?.trim() || "—",
    source: "manual",
    descriptionText: jd,
    requiredSkills: core.keywords.slice(0, 20),
  };
  const match = matchJob(job, profile);
  const now = new Date().toISOString();
  const applicationId = db().collection("applications").doc().id;
  const app: Application = {
    id: applicationId,
    jobId,
    jobTitle: job.title,
    company: job.company,
    source: "manual",
    status: "draft",
    confidence: match.confidence,
    match,
    createdAt: now,
    updatedAt: now,
    followUps: [],
    manual: true,
    resumePdfUrl: core.pdfUrl,
    jobDescription: jd,
    keywords: core.keywords,
    notes: "",
  };
  await db().collection("applications").doc(applicationId).set(clean(app));

  return { ...core, applicationId };
}
