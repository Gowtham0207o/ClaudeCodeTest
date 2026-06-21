import "server-only";
import { generateJson, hasOpenAI } from "./openai";
import type { Profile, ProfileRole } from "./types";
import { extractSkills } from "./scrapers/util";

/** Extract plain text from an uploaded resume (PDF, DOCX, or plain text). */
export async function extractText(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  const name = filename.toLowerCase();

  if (mimetype === "application/pdf" || name.endsWith(".pdf")) {
    // pdf-parse is a CommonJS module; use createRequire to load it
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const pdfParse = require("pdf-parse");
    const out = await pdfParse(buffer);
    return out.text;
  }

  if (
    name.endsWith(".docx") ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ buffer });
    return out.value;
  }

  // .txt / .md / unknown → treat as UTF-8 text.
  return buffer.toString("utf8");
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fullName: { type: "string" },
    title: { type: "string" },
    email: { type: "string" },
    location: { type: "string" },
    yearsExperience: { type: "number" },
    summary: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          period: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["company", "role", "period", "bullets"],
      },
    },
  },
  required: [
    "fullName",
    "title",
    "email",
    "location",
    "yearsExperience",
    "summary",
    "skills",
    "experience",
  ],
} as const;

export interface ResumeExtraction {
  profile: Partial<Profile>;
  usedAI: boolean;
}

/** Turn raw resume text into structured profile fields. Uses OpenAI GPT when an
 *  API key is set, otherwise a deterministic heuristic fallback. */
export async function extractProfile(text: string): Promise<ResumeExtraction> {
  const clean = text.replace(/\s+\n/g, "\n").trim().slice(0, 24000);

  if (hasOpenAI()) {
    try {
      const parsed = await generateJson<Partial<Profile>>({
        schemaName: "resume_profile",
        schema: SCHEMA as unknown as Record<string, unknown>,
        user: `Extract a structured profile from this resume. Use the candidate's most senior/current role as "title". Estimate "yearsExperience" as a whole number from the work history. List concrete technical "skills" only. Keep "summary" to 2-3 sentences. Never invent facts that aren't in the resume.\n\n# Resume\n${clean}`,
      });
      return { profile: sanitize(parsed), usedAI: true };
    } catch (err) {
      console.error("[resume-extract] GPT extraction failed, using fallback:", err);
    }
  }

  return { profile: heuristic(clean), usedAI: false };
}

function sanitize(p: Partial<Profile>): Partial<Profile> {
  return {
    ...p,
    skills: Array.isArray(p.skills) ? p.skills.map((s) => String(s).trim()).filter(Boolean) : [],
    experience: Array.isArray(p.experience)
      ? (p.experience as ProfileRole[]).map((r) => ({
          company: String(r.company ?? ""),
          role: String(r.role ?? ""),
          period: String(r.period ?? ""),
          bullets: Array.isArray(r.bullets) ? r.bullets.map(String) : [],
        }))
      : [],
  };
}

/** No-API-key fallback: best-effort regex/keyword extraction. */
function heuristic(text: string): Partial<Profile> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const fullName = lines[0] && lines[0].length < 50 ? lines[0] : "";
  const years = text.match(/(\d+)\s*\+?\s*years?/i);
  const titleLine = lines.find((l) =>
    /(engineer|developer|designer|manager|analyst|scientist|architect|lead)/i.test(l),
  );

  return {
    fullName,
    title: titleLine?.slice(0, 60) ?? "",
    email,
    yearsExperience: years ? parseInt(years[1], 10) : 0,
    skills: extractSkills(text, 20),
    summary: lines.slice(1, 4).join(" ").slice(0, 400),
    experience: [],
  };
}
