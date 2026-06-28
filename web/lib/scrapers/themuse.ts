import type { ScrapeQuery, SourceResult } from "./types";
import {
  extractExperience,
  extractSkills,
  fetchJson,
  matchesAnyKeyword,
  stripHtml,
} from "./util";

interface MuseJob {
  id: number;
  name: string;
  contents?: string;
  company?: { name?: string };
  locations?: { name?: string }[];
  levels?: { name?: string }[];
  publication_date?: string;
  refs?: { landing_page?: string };
}

/** The Muse — free public jobs API. Filtered locally by keyword. */
export async function scrapeTheMuse(query: ScrapeQuery): Promise<SourceResult> {
  const perSource = query.perSource ?? 25;
  try {
    // Pull the first couple of pages (each ~20 jobs) then keyword-filter.
    const pages = await Promise.all(
      [0, 1].map((p) =>
        fetchJson<{ results?: MuseJob[] }>(
          `https://www.themuse.com/api/public/jobs?page=${p}`,
        ).catch(() => ({ results: [] as MuseJob[] })),
      ),
    );
    const all = pages.flatMap((p) => p.results ?? []);

    const jobs = all
      .filter((j) =>
        matchesAnyKeyword(`${j.name} ${stripHtml(j.contents)}`, query.keywords),
      )
      .slice(0, perSource)
      .map((j) => {
        const desc = stripHtml(j.contents);
        return {
          title: j.name.trim(),
          company: (j.company?.name ?? "Unknown").trim(),
          location: j.locations?.[0]?.name?.trim() || "—",
          requiredSkills: extractSkills(desc),
          requiredExperience: j.levels?.[0]?.name || extractExperience(desc),
          jobUrl: j.refs?.landing_page,
          postedDate: j.publication_date || new Date().toISOString(),
          source: "themuse" as const,
          externalId: `themuse-${j.id}`,
        };
      });

    return { source: "themuse", ok: true, fetched: jobs.length, jobs };
  } catch (err) {
    return {
      source: "themuse",
      ok: false,
      fetched: 0,
      jobs: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
