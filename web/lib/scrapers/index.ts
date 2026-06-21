import type { ScrapeQuery, ScrapedJob, SourceResult } from "./types";
import { looksRemote } from "./util";
import { scrapeRemoteOk } from "./remoteok";
import { scrapeRemotive } from "./remotive";
import { scrapeArbeitnow } from "./arbeitnow";
import { scrapeJobicy } from "./jobicy";
import { scrapeTheMuse } from "./themuse";
import { scrapeLinkedInComposio } from "./linkedin-composio";

export type { ScrapeQuery, ScrapedJob, SourceResult } from "./types";

const SCRAPERS = [
  scrapeRemoteOk,
  scrapeRemotive,
  scrapeArbeitnow,
  scrapeJobicy,
  scrapeTheMuse,
  scrapeLinkedInComposio,
];

export interface ScrapeRunResult {
  jobs: ScrapedJob[];
  sources: SourceResult[];
}

/** Filter jobs by role relevance and experience requirement. */
function isRelevantRole(title: string): boolean {
  const lower = title.toLowerCase();
  // Only accept: Software/Web/Full-Stack/Backend/Frontend Developer/Engineer roles
  const accept = /\b(software|web|full.?stack|backend|frontend)\b.*(developer|engineer)\b/i;
  const reject = /\b(sales|marketing|hr|nurse|lpn|care|manager|accountant|design|support|assistant|intern|graduate|architect|devops|platform|infrastructure|qa|tester)\b/i;
  return accept.test(lower) && !reject.test(lower);
}

/** Run every source in parallel, then apply preferences + dedupe. */
export async function runScrapers(query: ScrapeQuery): Promise<ScrapeRunResult> {
  const sources = await Promise.all(SCRAPERS.map((s) => s(query)));

  // Flatten, apply role/location filter, then dedupe.
  const seen = new Set<string>();
  const jobs: ScrapedJob[] = [];

  for (const result of sources) {
    for (const job of result.jobs) {
      // Filter by role relevance (software developer, engineer, architect only)
      if (!isRelevantRole(job.title)) continue;

      if (query.remoteOnly && !looksRemote(job.location)) continue;

      // Dedupe by externalId first, then by title+company.
      const key =
        job.externalId?.toLowerCase() ||
        `${job.title}|${job.company}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(job);
    }
  }

  return { jobs, sources };
}

/** Turn a user profile into the search query that drives every scraper. */
export function buildQuery(profile: {
  title: string;
  skills: string[];
  preferences: { remoteOnly: boolean; locations: string[] };
}): ScrapeQuery {
  const keywords = [
    profile.title,
    ...profile.skills.slice(0, 6),
  ]
    .map((k) => k.trim())
    .filter(Boolean);

  return {
    keywords,
    location: profile.preferences.locations[0],
    remoteOnly: profile.preferences.remoteOnly,
    perSource: 25,
  };
}
