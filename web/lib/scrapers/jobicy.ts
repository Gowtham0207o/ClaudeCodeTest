import type { ScrapeQuery, SourceResult } from "./types";
import {
  cleanTags,
  extractExperience,
  extractSkills,
  fetchJson,
  primaryKeyword,
  stripHtml,
} from "./util";

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo?: string;
  jobLevel?: string;
  jobType?: string[];
  pubDate?: string;
  jobDescription?: string;
  jobIndustry?: string[];
}

/** Jobicy — free remote-jobs API with a `tag` search param. */
export async function scrapeJobicy(query: ScrapeQuery): Promise<SourceResult> {
  const perSource = query.perSource ?? 25;
  const tag = encodeURIComponent(primaryKeyword(query.keywords));
  try {
    const data = await fetchJson<{ jobs?: JobicyJob[] }>(
      `https://jobicy.com/api/v2/remote-jobs?count=${perSource}&tag=${tag}`,
    );
    const jobs = (data.jobs ?? []).slice(0, perSource).map((j) => {
      const desc = stripHtml(j.jobDescription);
      const skills = cleanTags(j.jobIndustry ?? []);
      return {
        title: j.jobTitle.trim(),
        company: (j.companyName ?? "Unknown").trim(),
        location: j.jobGeo?.trim() || "Remote",
        requiredSkills: skills.length ? skills : extractSkills(desc),
        requiredExperience: j.jobLevel?.trim() || extractExperience(desc),
        jobUrl: j.url,
        postedDate: j.pubDate || new Date().toISOString(),
        source: "jobicy" as const,
        externalId: `jobicy-${j.id}`,
      };
    });

    return { source: "jobicy", ok: true, fetched: jobs.length, jobs };
  } catch (err) {
    return {
      source: "jobicy",
      ok: false,
      fetched: 0,
      jobs: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
