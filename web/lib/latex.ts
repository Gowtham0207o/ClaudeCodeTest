import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { MatchResult, Profile, ResumeArtifact, TailoredResume } from "./types";

const execFileAsync = promisify(execFile);

/**
 * LaTeX résumé engine (R4: "inject the missing skills into my résumé using the
 * pre-provided LaTeX", then compile a per-job PDF).
 *
 * Pipeline: load template → fill %%MARKERS%% with the tailored, JD-aligned
 * content (LaTeX-escaped) → compile to PDF with Tectonic. If Tectonic isn't on
 * the host it degrades gracefully (hosted compiler, then a .tex-only stub) so
 * the apply pipeline never hard-fails on a missing binary.
 */

// Computed lazily (not at module scope) so the bundler doesn't statically
// trace the whole project from a top-level process.cwd() filesystem op.
const defaultTemplate = () => {
  // In Next.js, __dirname is not available, so we use process.cwd()
  // The app runs from the project root, so web/resume/template.tex needs proper path
  const cwd = process.cwd();
  const templatePath = path.join(cwd, "web", "resume", "template.tex");
  // Fallback: also check without "web/" prefix in case app runs from web directory
  return existsSync(templatePath) ? templatePath : path.join(cwd, "resume", "template.tex");
};
const runtimeDir = () => path.join(process.cwd(), ".runtime", "resumes");

/** Escape the characters that are special in LaTeX. Backslash must go first. */
export function escapeLatex(input: string): string {
  return (input ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const k = it.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it.trim());
  }
  return out;
}

interface BuildInput {
  jobId: string;
  profile: Profile;
  tailored: TailoredResume;
  match: MatchResult;
  /** Keywords extracted from the JD (most-emphasized first). */
  jdKeywords: string[];
}

/** Build the marker→content map for the template. */
function buildReplacements(input: BuildInput): Record<string, string> {
  const { profile, tailored, jdKeywords } = input;
  const a = profile.applyAnswers;

  // Skills line: JD-matched skills first (ATS keyword alignment), then the
  // tailor's emphasis, then the rest — deduped. We never fabricate: only the
  // candidate's real skills plus the tailor's curated transferable keywords.
  const matchedJd = jdKeywords.filter((k) =>
    profile.skills.some((s) => s.toLowerCase() === k.toLowerCase()),
  );
  const injected = uniq([...(tailored.injectedKeywords ?? []), ...matchedJd]);
  const skills = uniq([
    ...tailored.emphasizedSkills,
    ...matchedJd,
    ...injected,
    ...profile.skills,
  ]);

  const contactParts = [
    profile.email,
    profile.location,
    a.linkedinUrl,
    a.githubUrl,
    a.portfolioUrl || a.websiteUrl,
  ].filter(Boolean);

  const bullets = tailored.highlightedBullets
    .map((b) => `  \\item ${escapeLatex(b)}`)
    .join("\n");

  const experience = profile.experience
    .map((r) => {
      const head = `\\textbf{${escapeLatex(r.role)}} — ${escapeLatex(r.company)} \\hfill ${escapeLatex(r.period)}`;
      const items = r.bullets
        .map((b) => `  \\item ${escapeLatex(b)}`)
        .join("\n");
      return `${head}\n\\begin{itemize}\n${items}\n\\end{itemize}`;
    })
    .join("\n\n");

  return {
    "%%NAME%%": escapeLatex(profile.fullName),
    "%%HEADLINE%%": escapeLatex(tailored.headline),
    "%%CONTACT%%": contactParts.map(escapeLatex).join(" \\textbullet{} "),
    "%%SUMMARY%%": escapeLatex(tailored.summary),
    "%%SKILLS%%": escapeLatex(skills.join(", ")),
    "%%BULLETS%%": bullets,
    "%%EXPERIENCE%%": experience,
  };
}

function render(template: string, replacements: Record<string, string>): string {
  let out = template;
  for (const [marker, value] of Object.entries(replacements)) {
    out = out.split(marker).join(value);
  }
  return out;
}

/** Compile a .tex file to PDF with Tectonic. Throws if the binary is absent. */
async function compileWithTectonic(texPath: string, outDir: string): Promise<void> {
  // TECTONIC_PATH lets the host point at a local binary without touching PATH.
  const bin = process.env.TECTONIC_PATH || "tectonic";
  await execFileAsync(
    bin,
    [
      texPath,
      "--outdir",
      outDir,
      "--chatter",
      "minimal",
      "--keep-logs",
      "--format",
      "pdf", // Explicitly request PDF output (not XDV)
    ],
    { timeout: 120_000 },
  );
}

/** Optional hosted fallback so a host without Tectonic can still produce a PDF. */
async function compileHosted(tex: string, pdfPath: string): Promise<boolean> {
  try {
    const res = await fetch("https://latexonline.cc/compile?command=pdflatex", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text: tex }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== "%PDF") return false;
    await writeFile(pdfPath, buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Produce a tailored, JD-aligned résumé PDF for one job.
 * Returns a servable URL (via /api/resume/pdf/<file>) and the absolute path
 * (so the Playwright apply adapters can attach the file).
 */
/** Load the user's résumé template (their .tex), falling back to the bundled one. */
export async function readBaseTemplate(profile: Profile): Promise<string> {
  const fallbackTemplate = defaultTemplate();
  const templatePath = profile.resumeTemplatePath || fallbackTemplate;

  // Try the specified path first, then fallback
  if (existsSync(templatePath)) {
    return readFile(templatePath, "utf8");
  }

  // Try fallback if different from templatePath
  if (templatePath !== fallbackTemplate && existsSync(fallbackTemplate)) {
    return readFile(fallbackTemplate, "utf8");
  }

  // If still not found, throw helpful error
  throw new Error(
    `Resume template not found at ${templatePath} or fallback ${fallbackTemplate}. ` +
    `Please ensure web/resume/template.tex exists.`
  );
}

/**
 * Write a .tex and compile it to PDF: Tectonic first, optional hosted fallback,
 * then a .tex-only stub. Shared by the marker template path and the AI
 * full-rewrite path.
 */
export async function emitAndCompile(
  jobId: string,
  tex: string,
  injectedKeywords: string[],
  opts: { allowHosted?: boolean } = {},
): Promise<ResumeArtifact> {
  const dir = runtimeDir();
  await mkdir(dir, { recursive: true });
  const base = `${jobId}-${Date.now().toString(36)}`;
  const texPath = path.join(dir, `${base}.tex`);
  const pdfPath = path.join(dir, `${base}.pdf`);
  await writeFile(texPath, tex, "utf8");

  // 1) Tectonic (preferred, self-contained, local).
  try {
    await compileWithTectonic(texPath, dir);
    // Check for PDF (primary) or XDV (fallback format)
    if (existsSync(pdfPath)) {
      return { pdfUrl: pdfUrl(base), pdfPath, injectedKeywords, compiledWith: "tectonic" };
    }
    // Fallback: XDV format (XeTeX output, which modern viewers can open)
    const xdvPath = path.join(dir, `${base}.xdv`);
    if (existsSync(xdvPath)) {
      console.warn("[latex] compiled to XDV instead of PDF (using as-is)");
      return {
        pdfUrl: `/api/files/resumes/${base}.xdv`,
        pdfPath: xdvPath,
        injectedKeywords,
        compiledWith: "tectonic",
      };
    }
  } catch (err) {
    console.warn("[latex] tectonic unavailable/failed:", (err as Error).message);
  }

  // 2) Hosted compiler fallback (off by default — uploads the résumé text).
  if (opts.allowHosted && (await compileHosted(tex, pdfPath))) {
    return { pdfUrl: pdfUrl(base), pdfPath, injectedKeywords, compiledWith: "hosted" };
  }

  // 3) Stub: the .tex is on disk, no PDF (observable downstream).
  console.warn("[latex] no LaTeX compiler available — emitted .tex only (stub).");
  return { pdfUrl: "", pdfPath: texPath, injectedKeywords, compiledWith: "stub" };
}

export async function buildResume(input: BuildInput): Promise<ResumeArtifact> {
  const template = await readBaseTemplate(input.profile);

  const replacements = buildReplacements(input);

  // Inject the JD's keywords the résumé doesn't already mention into its
  // "Others" skills line (the %%EXTRA_SKILLS%% marker). Deduped against the
  // template with WORD-BOUNDARY matching so a short keyword like "Go" isn't
  // wrongly treated as present because it's a substring of "Gowtham".
  const inTemplate = (k: string) => {
    const esc = k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9+#.])${esc}([^a-z0-9+#.]|$)`, "i").test(template);
  };
  const addable = uniq([
    ...input.jdKeywords,
    ...(input.tailored.injectedKeywords ?? []),
  ]).filter((k) => k && !inTemplate(k));
  replacements["%%EXTRA_SKILLS%%"] = addable.length
    ? `, ${addable.map(escapeLatex).join(", ")}`
    : "";

  const tex = render(template, replacements);
  return emitAndCompile(input.jobId, tex, addable, { allowHosted: true });
}

function pdfUrl(base: string): string {
  return `/api/files/resumes/${base}.pdf`;
}
