import type { Job, Profile, MatchResult, MatchBreakdown } from "./types";

/** Canonical key for comparing two skill strings (e.g. "Node.js" ≈ "node.js"). */
const skillKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]/g, "");

/**
 * Split free text into lowercase word tokens. Keeps `+ # .` so "c++", "c#" and
 * "node.js" survive as single tokens. NOTE: tokenize on the *raw* string — the
 * old code space-stripped first, which collapsed a whole title into one
 * unmatchable blob and made role-relevance always score ~0.
 */
function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []).filter((t) => t.length > 1);
}

/**
 * Role-family tokens every software/engineering title the scraper admits will
 * share. Used as a fallback so a clearly-relevant dev role (e.g. "Sr Software
 * Engineer, Frontend") never scores 0 on title relevance just because the
 * candidate's title string happens not to contain that exact word.
 */
const ROLE_TOKENS = new Set([
  "engineer", "engineering", "developer", "development", "software",
  "web", "frontend", "front", "backend", "back", "fullstack", "full", "stack",
  "programmer", "sde", "swe", "coder",
]);

/**
 * Compact tech-skill vocabulary so we can recover the real skills a posting
 * emphasizes from its title / tags / experience text even when a source gives
 * us no clean skill tags (or only a useless industry label like
 * "Software Engineering").
 */
const SKILL_VOCAB = [
  "JavaScript", "TypeScript", "Python", "Go", "Golang", "Rust", "Java", "Kotlin",
  "Swift", "Ruby", "PHP", "C++", "C#", "Scala", "Elixir", "SQL",
  "React", "Next.js", "Vue", "Angular", "Svelte", "Redux", "Tailwind", "React Native",
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Rails",
  "GraphQL", "REST", "gRPC",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "DynamoDB",
  "Firebase", "Supabase",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD",
  "Serverless", "Lambda", "Vercel", "Linux", "Kafka",
  "HTML", "CSS", "Sass",
  "TensorFlow", "PyTorch", "Machine Learning", "LLM",
];

/** Recognizable tech skills mentioned anywhere in `text` (dictionary-bounded). */
function detectSkills(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const skill of SKILL_VOCAB) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word-ish boundary so "Go" doesn't match "Google" and "Java" doesn't
    // match inside "JavaScript".
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text)) {
      found.push(skill);
    }
  }
  return found;
}

function parseRequiredYears(text?: string): number | null {
  if (!text) return null;
  const m = text.match(/(\d+)\s*\+?\s*(?:years?|yrs?|yoe)/i);
  if (m) return parseInt(m[1], 10);
  if (/senior|lead|principal|staff/i.test(text)) return 5;
  if (/junior|entry|graduate|intern/i.test(text)) return 1;
  if (/mid/i.test(text)) return 3;
  return null;
}

/**
 * Deterministic profile↔job confidence score. This is the gate that decides
 * whether the autonomous pipeline tailors + applies, or skips a job.
 */
export function matchJob(job: Job, profile: Profile): MatchResult {
  const profileSkillKeys = new Set(profile.skills.map(skillKey));

  // ── Effective job skill set ──────────────────────────────────────────────
  // Pull real, recognizable skills from every text signal the job carries.
  // This rescues postings whose only "requiredSkills" entry is a generic
  // industry tag (which used to score 0/1 = 0 on the 50%-weight dimension).
  const jobText = [
    job.title,
    (job.requiredSkills ?? []).join(" "),
    job.requiredExperience ?? "",
    job.descriptionText ?? "",
  ]
    .filter(Boolean)
    .join("  ");

  const jobSkillMap = new Map<string, string>();
  for (const s of job.requiredSkills ?? []) {
    const key = skillKey(s);
    // Keep a listed skill only if it's something we recognize (candidate has it
    // or it's in the vocab) — drop noise like "Software Engineering".
    if (profileSkillKeys.has(key) || SKILL_VOCAB.some((v) => skillKey(v) === key)) {
      jobSkillMap.set(key, s);
    }
  }
  for (const s of detectSkills(jobText)) jobSkillMap.set(skillKey(s), s);

  const jobSkills = [...jobSkillMap.values()];
  const matchedSkills = jobSkills.filter((s) => profileSkillKeys.has(skillKey(s)));
  const missingSkills = jobSkills.filter((s) => !profileSkillKeys.has(skillKey(s)));

  // 1. Skill overlap — the heaviest signal. Neutral-positive (60) when the job
  //    surfaces no recognizable skills, rather than a punishing 0.
  const skillScore = jobSkills.length
    ? Math.round((matchedSkills.length / jobSkills.length) * 100)
    : 60;

  // 2. Title relevance — proper word tokenization + a dev-role-family fallback.
  const titleTokens = tokenize(job.title).filter((t) => t.length > 2);
  const profileVocab = new Set<string>([
    ...tokenize(profile.title),
    ...profile.skills.flatMap((s) => tokenize(s)),
  ]);
  const titleHits = titleTokens.filter(
    (t) => profileVocab.has(t) || ROLE_TOKENS.has(t),
  );
  const titleScore = titleTokens.length
    ? Math.min(100, Math.round((titleHits.length / Math.min(titleTokens.length, 4)) * 100))
    : 50;

  // 3. Experience fit.
  const requiredYears = parseRequiredYears(job.requiredExperience);
  let expScore = 70;
  let expDetail = "Experience not specified — neutral.";
  if (requiredYears != null) {
    const delta = profile.yearsExperience - requiredYears;
    if (delta >= 0) {
      expScore = Math.min(100, 80 + delta * 4);
      expDetail = `Needs ~${requiredYears}y, you have ${profile.yearsExperience}y.`;
    } else {
      expScore = Math.max(15, 80 + delta * 18);
      expDetail = `Needs ~${requiredYears}y, you have ${profile.yearsExperience}y (gap).`;
    }
  }

  // 4. Location / remote fit.
  const loc = skillKey(job.location ?? "");
  const isRemote = /remote|anywhere|worldwide/.test(loc) || !loc;
  let locScore: number;
  let locDetail: string;
  if (profile.preferences.remoteOnly) {
    locScore = isRemote ? 100 : 20;
    locDetail = isRemote ? "Remote — matches preference." : "On-site — you prefer remote.";
  } else {
    const prefHit = profile.preferences.locations.some((l) => loc.includes(skillKey(l)));
    locScore = isRemote || prefHit ? 95 : 65;
    locDetail = isRemote ? "Remote-friendly." : prefHit ? "In a preferred location." : "Location acceptable.";
  }

  const breakdown: MatchBreakdown[] = [
    {
      label: "Skill overlap",
      score: skillScore,
      weight: 0.5,
      detail: jobSkills.length
        ? `${matchedSkills.length}/${jobSkills.length} JD skills matched${matchedSkills.length ? ` (${matchedSkills.slice(0, 5).join(", ")})` : ""}.`
        : "No specific skills listed — neutral.",
    },
    { label: "Role relevance", score: titleScore, weight: 0.2, detail: `“${job.title}” vs your profile.` },
    { label: "Experience fit", score: expScore, weight: 0.18, detail: expDetail },
    { label: "Location fit", score: locScore, weight: 0.12, detail: locDetail },
  ];

  const confidence = Math.round(
    breakdown.reduce((sum, b) => sum + b.score * b.weight, 0),
  );

  const threshold = profile.preferences.minConfidence;
  const verdict: MatchResult["verdict"] =
    confidence >= threshold ? "auto-apply" : confidence >= 50 ? "review" : "skip";

  return { confidence, matchedSkills, missingSkills, breakdown, verdict };
}
