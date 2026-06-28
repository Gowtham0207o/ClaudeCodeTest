import "server-only";
import { db, clean } from "./firebase-admin";
import { getProfile } from "./profile";
import { matchJob } from "./match";
import { extractKeywords } from "./jd";
import { tailorResume } from "./tailor";
import { buildResume } from "./latex";
import {
  fetchGreenhouseForm,
  isGreenhouseUrl,
  type FormField,
} from "./ats/greenhouse";
import { fillGreenhouse } from "./apply/greenhouse-fill";
import type { Application, Job, Profile } from "./types";

/**
 * "Apply by URL" (R5, human-in-the-loop variant).
 *
 *  inspectUrl(url)  → parse the form + suggest answers for the user to review.
 *  applyUrl({...})  → tailor a résumé for the role, fill the reviewed answers,
 *                     and submit (or dry-run) via Playwright; track the result.
 */

const SUPPORTED = "Only Greenhouse job links are supported right now (e.g. job-boards.greenhouse.io/<company>/jobs/<id>).";

export interface InspectedField extends FormField {
  /** Pre-filled suggestion (an option *label* for selects). */
  suggested: string;
  /** True when the engine handles this automatically (e.g. résumé upload). */
  auto: boolean;
}

export interface InspectResult {
  ats: "greenhouse";
  url: string;
  company: string;
  title: string;
  fields: InspectedField[];
}

export async function inspectUrl(url: string): Promise<InspectResult> {
  if (!isGreenhouseUrl(url)) throw new Error(SUPPORTED);
  const [form, profile] = await Promise.all([fetchGreenhouseForm(url), getProfile()]);
  const fields: InspectedField[] = form.fields.map((f) => {
    // Greenhouse offers résumé/cover both as a file upload AND a "type it in"
    // textarea, both marked required. We satisfy them via the uploaded PDF, so
    // treat both as auto-handled rather than asking the user to fill them.
    const auto = f.type === "file" || /^(resume|cover_letter)_text$/.test(f.key);
    return { ...f, auto, suggested: auto ? "" : suggestAnswer(f, profile) };
  });
  return { ats: form.ats, url, company: form.company, title: form.title, fields };
}

export interface ApplyUrlInput {
  url: string;
  /** Reviewed answers keyed by field.key (option label for selects). */
  answers: Record<string, string>;
  live: boolean;
  /** Open a visible browser and do the fill in front of the user (default true). */
  supervised?: boolean;
}

export interface ApplyUrlResult {
  submitted: boolean;
  method: string;
  confirmation?: string;
  screenshotUrl?: string;
  resumePdfUrl?: string;
  applicationId: string;
  unfilledRequired: string[];
  phoneCountry?: string;
  error?: string;
}

export async function applyUrl(input: ApplyUrlInput): Promise<ApplyUrlResult> {
  const { url, answers, live } = input;
  const supervised = input.supervised !== false;
  if (!isGreenhouseUrl(url)) throw new Error(SUPPORTED);

  const profile = await getProfile();
  const form = await fetchGreenhouseForm(url);
  const keywords = extractKeywords(form.descriptionText);

  // Synthetic job for tailoring + tracking.
  const jobId = db().collection("jobs").doc().id;
  const job: Job = {
    id: jobId,
    title: form.title || "Job",
    company: form.company || "Company",
    source: "manual",
    jobUrl: url,
    applyUrl: url,
    applyType: "greenhouse",
    descriptionText: form.descriptionText,
    requiredSkills: keywords.slice(0, 12),
  };

  const match = matchJob(job, profile);
  const { tailored } = await tailorResume(job, profile, match, {
    descriptionText: form.descriptionText,
    keywords,
    missingSkills: match.missingSkills,
  });
  const resume = await buildResume({ jobId, profile, tailored, match, jdKeywords: keywords });

  const result = await fillGreenhouse({
    url,
    form,
    profile,
    answers,
    resumePath: resume.pdfPath,
    coverNote: tailored.coverNote,
    live,
    supervised,
  });

  const app: Application = {
    id: db().collection("applications").doc().id,
    jobId,
    jobTitle: job.title,
    company: job.company,
    source: "manual",
    status: result.submitted ? "applied" : "matched",
    confidence: match.confidence,
    match,
    tailored,
    appliedAt: result.submitted ? result.appliedAt : undefined,
    createdAt: new Date().toISOString(),
    followUps: result.submitted
      ? [{ at: new Date(Date.now() + 4 * 864e5).toISOString(), channel: "email", note: `Follow up with ${job.company}`, done: false }]
      : [],
    submitMethod: result.method,
    confirmation: result.confirmation,
    resumePdfUrl: resume.pdfUrl,
    screenshotUrl: result.screenshotUrl,
    error: result.error,
  };
  await db().collection("applications").doc(app.id).set(clean(app));

  return {
    submitted: result.submitted,
    method: result.method,
    confirmation: result.confirmation,
    screenshotUrl: result.screenshotUrl,
    resumePdfUrl: resume.pdfUrl,
    applicationId: app.id,
    unfilledRequired: result.unfilledRequired,
    phoneCountry: result.phoneCountry,
    error: result.error,
  };
}

// ── Answer suggestions ──────────────────────────────────────────────────────

/** Choose the option whose label best matches one of the wanted phrases. */
function pickOption(f: FormField, wants: string[]): string {
  const opts = f.options ?? [];
  for (const w of wants) {
    const hit = opts.find((o) => o.label.toLowerCase().includes(w.toLowerCase()));
    if (hit) return hit.label;
  }
  return "";
}

/** Best-effort pre-fill for a field from the saved profile/apply answers. */
function suggestAnswer(f: FormField, p: Profile): string {
  const a = p.applyAnswers;
  const [first, ...rest] = p.fullName.split(" ");
  const label = f.label.toLowerCase();

  // User-defined screener answers win (substring match on the question label).
  for (const [k, v] of Object.entries(a.customAnswers ?? {})) {
    if (k && label.includes(k.toLowerCase())) {
      return f.options?.length ? pickOption(f, [v]) || v : v;
    }
  }

  switch (f.key) {
    case "first_name":
      return first ?? "";
    case "last_name":
      return rest.join(" ");
    case "email":
      return p.email;
    case "phone":
      return a.phone;
    case "candidate_location":
      return a.currentLocation || p.location;
  }

  if (f.type === "select" || f.type === "multiselect") {
    if (/gender|disab|veteran|race|ethnic|self-identif|self identif/.test(label)) {
      return pickOption(f, ["decline", "don't wish", "do not wish", "prefer not", "not to answer", "not wish"]);
    }
    if (label.includes("previously worked")) return pickOption(f, ["no"]);
    if (label.includes("reside") || label.includes("permanent residence")) return pickOption(f, ["no"]);
    if (label.includes("right to") && label.includes("work")) return pickOption(f, ["no"]);
    if (label.includes("sponsor")) return pickOption(f, a.needsSponsorship ? ["yes"] : ["no"]);
    if (label.includes("authoriz")) return pickOption(f, a.workAuthorized ? ["yes"] : ["no"]);
    if (label.includes("how did you find") || label.includes("hear about") || label.includes("source"))
      return pickOption(f, ["linkedin", "job search", "company website", "other"]);
    return ""; // leave the rest for the user to pick
  }

  // Free-text questions.
  if (label.includes("linkedin")) return a.linkedinUrl;
  if (label.includes("github")) return a.githubUrl;
  if (label.includes("portfolio") || label.includes("website")) return a.portfolioUrl || a.websiteUrl;
  if (label.includes("salary") || label.includes("compensation") || label.includes("expectation") || label.includes("base"))
    return a.expectedSalary;
  if (label.includes("notice")) return String(a.noticePeriodDays);
  if (label.startsWith("why ") || label.includes("why ") || label.includes("cover"))
    return a.coverLetterDefault;

  return "";
}
