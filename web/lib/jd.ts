import "server-only";
import * as cheerio from "cheerio";
import type { ApplyType, Job } from "./types";

/**
 * Job-description enrichment (R4 step 1: "Fetch the JD").
 *
 * Pulls the full description text for a job, figures out which apply mechanism
 * the posting uses (so the right Playwright adapter runs), and extracts the
 * skill keywords the JD emphasizes — the raw material the LaTeX engine injects.
 */

export interface JdEnrichment {
  descriptionText: string;
  applyType: ApplyType;
  applyUrl: string;
  keywords: string[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Map an apply/job URL to the adapter that can submit it. */
export function detectApplyType(url?: string): ApplyType {
  if (!url) return "unknown";
  const u = url.toLowerCase();
  if (u.includes("greenhouse.io")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("myworkdayjobs.com") || u.includes("workday")) return "workday";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("indeed.")) return "indeed";
  return "external";
}

/** A curated vocabulary of skills/keywords worth detecting in a JD. */
const TECH_KEYWORDS = [
  // Languages
  "TypeScript", "JavaScript", "Python", "Go", "Golang", "Rust", "Java", "Kotlin",
  "Swift", "Ruby", "PHP", "C++", "C#", "Scala", "Elixir", "SQL",
  // Frontend
  "React", "Next.js", "Vue", "Angular", "Svelte", "Redux", "Tailwind",
  "HTML", "CSS", "Sass", "Webpack", "Vite", "React Native",
  // Backend / APIs
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring",
  "Rails", "GraphQL", "REST", "gRPC", "WebSocket", "Microservices",
  // Data
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "DynamoDB",
  "Kafka", "RabbitMQ", "Snowflake", "BigQuery", "Spark", "Airflow", "ETL",
  // Cloud / infra
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "Ansible",
  "CI/CD", "Jenkins", "GitHub Actions", "Serverless", "Lambda", "Firebase",
  "Vercel", "Nginx", "Linux",
  // AI / ML
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "LLM",
  "NLP", "Pandas", "NumPy", "OpenAI", "LangChain",
  // Practices
  "Agile", "Scrum", "TDD", "Unit Testing", "Jest", "Cypress", "Playwright",
  "Git", "Observability", "Monitoring",
];

/**
 * Extract the skill keywords a JD emphasizes. Case-insensitive substring scan
 * against the curated vocabulary, ranked by frequency (most-mentioned first).
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits: { kw: string; count: number }[] = [];
  for (const kw of TECH_KEYWORDS) {
    // Word-ish boundary so "Java" doesn't match inside "JavaScript".
    const needle = kw.toLowerCase();
    const re = new RegExp(
      `(?<![a-z0-9+#.])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9+#])`,
      "g",
    );
    const count = (lower.match(re) ?? []).length;
    if (count > 0) hits.push({ kw, count });
  }
  return hits.sort((a, b) => b.count - a.count).map((h) => h.kw);
}

/** Strip an HTML document down to readable description text. */
function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, svg").remove();
  // Prefer obvious description containers; fall back to the body.
  const candidate =
    $('[class*="description" i]').first().text() ||
    $('[class*="job" i][class*="content" i]').first().text() ||
    $("main").first().text() ||
    $("body").text();
  return candidate.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Fetch + enrich a job's description. Network-best-effort: if the fetch fails
 * (bot wall, timeout), we fall back to whatever text the job already carries so
 * the pipeline never blocks on a flaky source.
 */
export async function enrichJob(job: Job): Promise<JdEnrichment> {
  const applyUrl = job.applyUrl || job.jobUrl || "";
  const applyType = job.applyType ?? detectApplyType(applyUrl);

  // Already have the text (some scrapers include it) — skip the fetch.
  if (job.descriptionText && job.descriptionText.length > 200) {
    return {
      descriptionText: job.descriptionText,
      applyType,
      applyUrl,
      keywords: extractKeywords(job.descriptionText),
    };
  }

  let descriptionText = job.descriptionText ?? "";
  if (job.jobUrl) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(job.jobUrl, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        const html = await res.text();
        const text = htmlToText(html);
        if (text.length > descriptionText.length) descriptionText = text;
      }
    } catch (err) {
      console.warn(`[jd] fetch failed for ${job.jobUrl}:`, (err as Error).message);
    }
  }

  // Last resort so downstream always has *something* to work with.
  if (!descriptionText) {
    descriptionText = [
      job.title,
      job.company,
      job.requiredExperience,
      (job.requiredSkills ?? []).join(", "),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    descriptionText,
    applyType,
    applyUrl,
    keywords: extractKeywords(descriptionText),
  };
}
