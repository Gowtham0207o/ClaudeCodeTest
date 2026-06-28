import type { ScrapeQuery, SourceResult } from "./types";
import {
  cleanTags,
  extractExperience,
  extractSkills,
  fetchJson,
  matchesAnyKeyword,
  stripHtml,
} from "./util";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number; // unix seconds
}

/** Arbeitnow — free job-board API. No search param, so we filter locally. */
export async function scrapeArbeitnow(query: ScrapeQuery): Promise<SourceResult> {
  const perSource = query.perSource ?? 25;
  try {
    const data = await fetchJson<{ data?: ArbeitnowJob[] }>(
      "https://www.arbeitnow.com/api/job-board-api",
    );
    const jobs = (data.data ?? [])
      .filter((j) =>
        matchesAnyKeyword(
          `${j.title} ${j.company_name} ${(j.tags ?? []).join(" ")}`,
          query.keywords,
        ),
      )
      .slice(0, perSource)
      .map((j) => {
        const skills = cleanTags(j.tags ?? []);
        return {
          title: j.title.trim(),
          company: (j.company_name ?? "Unknown").trim(),
          location: j.remote ? "Remote" : j.location?.trim() || "—",
          requiredSkills: skills.length ? skills : extractSkills(stripHtml(j.description)),
          requiredExperience: extractExperience(stripHtml(j.description)),
          jobUrl: j.url,
          postedDate: j.created_at
            ? new Date(j.created_at * 1000).toISOString()
            : new Date().toISOString(),
          source: "arbeitnow" as const,
          externalId: `arbeitnow-${j.slug}`,
        };
      });

    return { source: "arbeitnow", ok: true, fetched: jobs.length, jobs };
  } catch (err) {
    return {
      source: "arbeitnow",
      ok: false,
      fetched: 0,
      jobs: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
