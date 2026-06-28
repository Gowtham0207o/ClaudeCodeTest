/** Shared helpers for the source scrapers. */

const SKILL_DICTIONARY = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust", "Ruby",
  "PHP", "Swift", "Kotlin", "Scala", "Elixir",
  "React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt", "Remix",
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Rails", "Spring",
  "GraphQL", "REST", "tRPC",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Firebase", "Supabase", "DynamoDB", "SQL",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD",
  "HTML", "CSS", "Tailwind", "Sass",
  "PyTorch", "TensorFlow", "Machine Learning", "LLM", "Pandas",
];

/** Pull recognizable skills out of free text (used when a source has no tags). */
export function extractSkills(text: string, max = 8): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const skill of SKILL_DICTIONARY) {
    // Word-ish boundary so "Go" doesn't match "Google".
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text)) {
      found.add(skill);
      if (found.size >= max) break;
    }
  }
  return [...found];
}

/** Normalize a list of source-provided tags into clean skill labels. */
export function cleanTags(tags: (string | undefined | null)[], max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (!t) continue;
    const v = String(t).trim();
    const key = v.toLowerCase();
    if (!v || v.length > 30 || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** Best-effort experience label from a job description. */
export function extractExperience(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d+)\s*\+?\s*(?:years?|yrs?|yoe)/i);
  if (m) return `${m[1]}+ years`;
  const lvl = text.match(/\b(junior|mid[- ]?level|senior|lead|principal|staff|entry[- ]?level)\b/i);
  if (lvl) return lvl[1].replace(/\s+/g, "-").toLowerCase();
  return undefined;
}

/** Does the haystack contain ANY of the keywords as a whole word/phrase?
 *  Word-boundary matching avoids false positives (e.g. "node" inside
 *  "reaction" or a stray mention buried in a long description). */
export function matchesAnyKeyword(haystack: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const h = haystack.toLowerCase();
  return keywords.some((k) => {
    if (!k) return false;
    const kw = k.toLowerCase().trim();
    // Symbols (c++, c#, node.js) don't play well with \b — fall back to substring.
    if (/[^a-z0-9 ]/.test(kw)) return h.includes(kw);
    return new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`).test(h);
  });
}

/** Is this location remote-friendly? */
export function looksRemote(location: string | undefined): boolean {
  if (!location) return true;
  return /remote|anywhere|worldwide|global|distributed/i.test(location);
}

/** Strip HTML tags to plain text (descriptions often arrive as HTML). */
export function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** fetch JSON with a timeout, a browser-ish UA, and clear errors. */
export async function fetchJson<T = unknown>(
  url: string,
  { timeoutMs = 12000 }: { timeoutMs?: number } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** The primary keyword (role) a source's own search param should use. */
export function primaryKeyword(keywords: string[]): string {
  return keywords[0] ?? "software engineer";
}
