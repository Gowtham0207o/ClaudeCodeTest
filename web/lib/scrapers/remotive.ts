import type { ScrapeQuery, SourceResult } from "./types";
import {
  cleanTags,
  extractExperience,
  fetchJson,
  primaryKeyword,
  stripHtml,
} from "./util";

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  job_type?: string;
  url: string;
  publication_date?: string;
  tags?: string[];
  description?: string;
}

/** Remotive — real, free API with a `search` param. */
export async function scrapeRemotive(query: ScrapeQuery): Promise<SourceResult> {
  const perSource = query.perSource ?? 25;
  const search = encodeURIComponent(primaryKeyword(query.keywords));
  try {
    const data = await fetchJson<{ jobs?: RemotiveJob[] }>(
      `https://remotive.com/api/remote-jobs?search=${search}&limit=${perSource}`,
    );
    const jobs = (data.jobs ?? []).slice(0, perSource).map((j) => ({
      title: j.title.trim(),
      company: (j.company_name ?? "Unknown").trim(),
      location: j.candidate_required_location?.trim() || "Remote",
      requiredSkills: cleanTags(j.tags ?? []),
      requiredExperience: extractExperience(stripHtml(j.description)),
      jobUrl: j.url,
      postedDate: j.publication_date || new Date().toISOString(),
      source: "remotive" as const,
      externalId: `remotive-${j.id}`,
    }));

    return { source: "remotive", ok: true, fetched: jobs.length, jobs };
  } catch (err) {
    return {
      source: "remotive",
      ok: false,
      fetched: 0,
      jobs: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
