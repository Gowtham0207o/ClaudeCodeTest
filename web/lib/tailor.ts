import "server-only";
import { generateJson, hasOpenAI } from "./openai";
import type { Job, Profile, MatchResult, TailoredResume } from "./types";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    highlightedBullets: { type: "array", items: { type: "string" } },
    coverNote: { type: "string" },
    emphasizedSkills: { type: "array", items: { type: "string" } },
    injectedKeywords: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  },
  required: [
    "headline",
    "summary",
    "highlightedBullets",
    "coverNote",
    "emphasizedSkills",
    "injectedKeywords",
    "rationale",
  ],
} as const;

/** Optional JD context that sharpens tailoring + keyword injection (R4). */
export interface JdContext {
  descriptionText: string;
  keywords: string[];
  missingSkills: string[];
}

export interface TailorOutput {
  tailored: TailoredResume;
  usedAI: boolean;
}

/** Rewrite the candidate's resume to fit a specific job using OpenAI GPT. */
export async function tailorResume(
  job: Job,
  profile: Profile,
  match: MatchResult,
  jd?: JdContext,
): Promise<TailorOutput> {
  if (!hasOpenAI()) return { tailored: fallback(job, profile, match), usedAI: false };

  try {
    const parsed = await generateJson<TailoredResume>({
      schemaName: "tailored_resume",
      schema: SCHEMA as unknown as Record<string, unknown>,
      user: buildPrompt(job, profile, match, jd),
    });
    return { tailored: parsed, usedAI: true };
  } catch (err) {
    // Don't fail the pipeline if the AI call errors — fall back to the
    // deterministic tailor — but surface *why* so it's diagnosable instead
    // of silently degrading (bad key, rate limit, schema rejection, etc.).
    console.error("[tailor] GPT tailoring failed, using fallback:", err);
    return { tailored: fallback(job, profile, match), usedAI: false };
  }
}

function buildPrompt(job: Job, profile: Profile, match: MatchResult, jd?: JdContext): string {
  const exp = profile.experience
    .map(
      (r) =>
        `- ${r.role} @ ${r.company} (${r.period})\n  ${r.bullets.join("\n  ")}`,
    )
    .join("\n");

  const jdBlock = jd
    ? `\n# Job description (excerpt)\n${jd.descriptionText.slice(0, 2500)}\n\n# JD keywords (most-emphasized first)\n${jd.keywords.join(", ") || "—"}\n# Skills the JD wants that the candidate doesn't list\n${jd.missingSkills.join(", ") || "none"}\n`
    : "";

  return `You are an expert technical resume writer. Tailor this candidate's resume for the specific job below. Emphasize genuinely relevant experience; never invent skills the candidate lacks.

# Candidate
Name: ${profile.fullName}
Current title: ${profile.title}
Years experience: ${profile.yearsExperience}
Skills: ${profile.skills.join(", ")}
Summary: ${profile.summary}
Experience:
${exp}

# Target job
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "—"}
Required experience: ${job.requiredExperience ?? "—"}
Required skills: ${(job.requiredSkills ?? []).join(", ") || "—"}

# Match analysis (deterministic)
Confidence: ${match.confidence}%
Matched skills: ${match.matchedSkills.join(", ") || "none"}
Missing skills: ${match.missingSkills.join(", ") || "none"}
${jdBlock}
# Task
Return JSON tailoring the resume for THIS job:
- headline: a punchy title aligning the candidate to the role
- summary: 2-3 sentence professional summary rewritten for this job
- highlightedBullets: 3-5 resume bullets (impact + metrics) reordered/reworded to foreground matched skills, naturally weaving in the JD's keywords where the candidate genuinely has the experience
- coverNote: a concise 3-4 sentence application note to the hiring team
- emphasizedSkills: the candidate skills most worth foregrounding for this role
- injectedKeywords: JD keywords/skills the candidate does NOT explicitly list but has DEFENSIBLE, genuine transferable exposure to (e.g. a React dev claiming "SPA architecture"). Only include keywords you could honestly justify in an interview — never fabricate core competencies the candidate lacks. Return [] if none qualify.
- rationale: one sentence on why this candidate fits (or where the gap is)`;
}

function fallback(job: Job, profile: Profile, match: MatchResult): TailoredResume {
  const skills = match.matchedSkills.length ? match.matchedSkills : profile.skills.slice(0, 5);
  const top = profile.experience[0];
  return {
    headline: `${profile.title} — aligned for ${job.title}`,
    summary: `${profile.fullName} is a ${profile.title} with ${profile.yearsExperience}+ years shipping production software. Strengths in ${skills.slice(0, 4).join(", ")} map directly to ${job.company}'s ${job.title} role.`,
    highlightedBullets: [
      top ? `${top.bullets[0] ?? `Delivered impact at ${top.company}`}` : `Delivered measurable impact across engineering teams.`,
      `Applied ${skills.slice(0, 3).join(", ")} to ship reliable, scalable systems.`,
      `Owned features end-to-end from design through production and on-call.`,
    ],
    coverNote: `Hi ${job.company} team — I'm excited about the ${job.title} role. My background as a ${profile.title} lines up well with your needs, especially ${skills.slice(0, 3).join(", ")}. I'd love to bring that to your team.`,
    emphasizedSkills: skills.slice(0, 6),
    // Deterministic fallback never fabricates — keyword injection is AI-curated only.
    injectedKeywords: [],
    rationale:
      match.confidence >= 70
        ? `Strong fit: ${match.matchedSkills.length} required skills already in the candidate's stack.`
        : `Partial fit: emphasize transferable strengths (${skills.slice(0, 2).join(", ")}).`,
  };
}
