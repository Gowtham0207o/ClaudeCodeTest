import type { ScrapeQuery, SourceResult } from "./types";
import {
  cleanTags,
  extractExperience,
  fetchJson,
  looksRemote,
  matchesAnyKeyword,
  stripHtml,
} from "./util";

interface RemoteOkRow {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  tags?: string[];
  url?: string;
  date?: string;
  description?: string;
  legal?: string; // present only on the first metadata row
}

/** RemoteOK — free public JSON feed. No search param, so we filter locally. */
export async function scrapeRemoteOk(query: ScrapeQuery): Promise<SourceResult> {
  const perSource = query.perSource ?? 25;
  try {
    const rows = await fetchJson<RemoteOkRow[]>("https://remoteok.com/api");
    const jobs = (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.id && !r.legal && r.position)
      // RemoteOK SEO-stuffs every job's `tags`, so matching tags lets noise
      // through. Match the title (+company) only for precision.
      .filter((r) => matchesAnyKeyword(`${r.position} ${r.company}`, query.keywords))
      .slice(0, perSource)
      .map((r) => ({
        title: r.position!.trim(),
        company: (r.company ?? "Unknown").trim(),
        location: r.location?.trim() || "Remote",
        requiredSkills: cleanTags(r.tags ?? []),
        requiredExperience: extractExperience(stripHtml(r.description)),
        jobUrl: r.url || `https://remoteok.com/remote-jobs/${r.slug ?? r.id}`,
        postedDate: r.date || new Date().toISOString(),
        source: "remoteok" as const,
        externalId: `remoteok-${r.id}`,
      }));

    return { source: "remoteok", ok: true, fetched: jobs.length, jobs };
  } catch (err) {
    return {
      source: "remoteok",
      ok: false,
      fetched: 0,
      jobs: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
