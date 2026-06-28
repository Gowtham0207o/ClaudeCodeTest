import type { Job } from "../types";

/** A scraped job before it gets a Firestore document id. */
export type ScrapedJob = Omit<Job, "id">;

/** What every scraper is driven by — derived from the user's resume/profile. */
export interface ScrapeQuery {
  /** Search terms, most important first (role titles + key skills). */
  keywords: string[];
  /** Free-form location preference, e.g. "India", "Remote". */
  location?: string;
  /** If true, only keep remote-friendly roles. */
  remoteOnly: boolean;
  /** Max jobs to keep per source (default 25). */
  perSource?: number;
}

/** Per-source outcome so the UI can show exactly what each source returned. */
export interface SourceResult {
  source: string;
  ok: boolean;
  fetched: number;
  error?: string;
  jobs: ScrapedJob[];
}

export type Scraper = (query: ScrapeQuery) => Promise<SourceResult>;
