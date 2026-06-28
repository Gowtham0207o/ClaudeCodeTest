// Shared domain types for the JobSync autonomous application pipeline.

export type JobSource =
  // Live, free, queryable sources (real scraping).
  | "remoteok"
  | "remotive"
  | "arbeitnow"
  | "jobicy"
  | "themuse"
  // A job applied to directly by URL (the "apply by link" flow), not scraped.
  | "manual"
  // Legacy sources kept only so old seeded/stored docs still render.
  | "angellist"
  | "indeed"
  | "glassdoor"
  | "linkedin"
  | "instahyre";

/** Which apply mechanism a job uses — decides the Playwright adapter. */
export type ApplyType =
  | "greenhouse"
  | "lever"
  | "workday"
  | "linkedin"
  | "indeed"
  | "external"
  | "unknown";

export interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  requiredExperience?: string;
  requiredSkills?: string[];
  jobUrl?: string;
  postedDate?: string;
  source: JobSource;
  fetchedAt?: string;
  externalId?: string;
  // Full job-description text, fetched lazily by lib/jd.ts before tailoring.
  descriptionText?: string;
  // The real "apply" destination + which adapter handles it.
  applyUrl?: string;
  applyType?: ApplyType;
  // Set once the batch engine has run this job through the pipeline, so daily
  // runs don't reprocess the same posting.
  processedAt?: string;
}

export interface Profile {
  fullName: string;
  title: string;
  email: string;
  location: string;
  yearsExperience: number;
  skills: string[];
  // Free-form resume the tailoring engine rewrites against each job.
  summary: string;
  experience: ProfileRole[];
  preferences: {
    remoteOnly: boolean;
    minConfidence: number; // auto-apply threshold (0-100)
    locations: string[];
  };
  // Canonical answers reused to auto-fill every application form (R5/D5).
  applyAnswers: ApplyAnswers;
  // Autonomous-run configuration (R6).
  automation: AutomationConfig;
  // Path to the user's LaTeX résumé template (defaults to the bundled one).
  resumeTemplatePath?: string;
}

/**
 * Pre-saved answers the apply engine fills into job-board / ATS forms.
 * Captured once in /settings, reused across every submission.
 */
export interface ApplyAnswers {
  phone: string;
  currentLocation: string;
  // Work authorization.
  workAuthorized: boolean; // authorized in the target market
  needsSponsorship: boolean;
  // Logistics.
  noticePeriodDays: number;
  willingToRelocate: boolean;
  remotePreference: "remote" | "hybrid" | "onsite" | "any";
  expectedSalary: string; // free-form, e.g. "₹28 LPA" / "$140k"
  currentSalary: string;
  // Links.
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  websiteUrl: string;
  // EEO / demographic (optional, "decline" by default).
  gender: string;
  ethnicity: string;
  veteranStatus: string;
  disabilityStatus: string;
  // Default cover note when a form requires one and no tailored note exists.
  coverLetterDefault: string;
  // Free-form keyword→answer map for screener questions
  // (e.g. "years of react" → "4"). Matched case-insensitively by substring.
  customAnswers: Record<string, string>;
}

/** Controls the daily autonomous batch run. */
export interface AutomationConfig {
  // Master kill-switch. false = dry-run (fill forms, capture screenshots, do NOT submit).
  live: boolean;
  // Max real submissions per daily run (R6 target: 50).
  dailyQuota: number;
  // Which job sources the engine may apply to.
  sources: JobSource[];
  // Cap per source per run, to spread volume and dodge rate limits.
  maxPerSource: number;
  // How many applies run concurrently.
  concurrency: number;
  // Human-like delay between submissions (ms).
  throttleMinMs: number;
  throttleMaxMs: number;
}

export interface ProfileRole {
  company: string;
  role: string;
  period: string;
  bullets: string[];
}

export interface MatchBreakdown {
  label: string;
  score: number; // 0-100 for this dimension
  weight: number; // contribution weight
  detail: string;
}

export interface MatchResult {
  confidence: number; // 0-100 overall
  matchedSkills: string[];
  missingSkills: string[];
  breakdown: MatchBreakdown[];
  verdict: "auto-apply" | "review" | "skip";
}

export interface TailoredResume {
  headline: string;
  summary: string;
  highlightedBullets: string[];
  coverNote: string;
  emphasizedSkills: string[];
  rationale: string;
  // JD keywords the candidate lacked but that were surfaced into the résumé
  // (transferable framing — never fabricated hard skills).
  injectedKeywords?: string[];
}

/** Output of the LaTeX résumé engine for one job. */
export interface ResumeArtifact {
  pdfUrl: string; // servable URL or path to the compiled per-job PDF
  pdfPath: string; // absolute path on the host (for Playwright file upload)
  injectedKeywords: string[];
  compiledWith: "tectonic" | "hosted" | "stub";
}

export type ApplicationStatus =
  | "draft"
  | "matched"
  | "tailoring"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "skipped";

export interface FollowUp {
  at: string;
  channel: "email" | "linkedin";
  note: string;
  done: boolean;
}

export interface Application {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  source: JobSource;
  status: ApplicationStatus;
  confidence: number;
  match?: MatchResult;
  tailored?: TailoredResume;
  appliedAt?: string;
  createdAt: string;
  followUps: FollowUp[];
  // Which daily run produced this application (R6 traceability).
  runId?: string;
  // How it was submitted: the adapter name, or "dry-run".
  submitMethod?: string;
  // Confirmation id returned by the board, if any.
  confirmation?: string;
  // Per-job tailored résumé PDF.
  resumePdfUrl?: string;
  // Screenshot of the final/submitted form (proof + debugging).
  screenshotUrl?: string;
  // Populated when apply failed (so failures are observable, not silent).
  error?: string;
  // ── Manual-application extras (Tailor Résumé / Apply by Link) ──
  // Free-form notes the user keeps while tracking the application.
  notes?: string;
  // The pasted job description this résumé was tailored against.
  jobDescription?: string;
  // Keywords woven into the tailored résumé.
  keywords?: string[];
  // Where the user is applying (manual apps may be created before a real submit).
  manual?: boolean;
  // Last time the user edited this application.
  updatedAt?: string;
}

// ── Autonomous run log (R6) ────────────────────────────────────────────────
export type RunStatus = "running" | "done" | "error" | "stopped";

export interface RunEvent {
  at: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  jobId?: string;
  stage?: PipelineStageId;
}

export interface RunCounts {
  scanned: number;
  matched: number;
  tailored: number;
  applied: number;
  heldForReview: number;
  skipped: number;
  failed: number;
}

export interface Run {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  live: boolean; // false = dry-run
  quota: number;
  counts: RunCounts;
  events: RunEvent[];
  trigger: "cron" | "manual";
}

// Live pipeline event stream — one job marching through the stages.
export type PipelineStageId =
  | "scrape"
  | "match"
  | "tailor"
  | "apply"
  | "track";

export type StageStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface PipelineEvent {
  stage: PipelineStageId;
  status: StageStatus;
  message: string;
  data?: unknown;
  at: string;
}
