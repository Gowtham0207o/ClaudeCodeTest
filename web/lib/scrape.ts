import "server-only";
import { db, clean } from "./firebase-admin";
import { getProfile } from "./profile";
import { runScrapers, buildQuery, type SourceResult } from "./scrapers";

export interface ScrapeProgress {
  type: "start" | "source" | "saving" | "done" | "error";
  message: string;
  data?: unknown;
  at: string;
}

const now = () => new Date().toISOString();

/**
 * Scrape every live source using the user's profile, dedupe against what's
 * already in Firestore, and persist the new jobs. Yields progress events so
 * the "Scrape Now" button can render a live log.
 */
export async function* scrapeAndStore(): AsyncGenerator<ScrapeProgress> {
  const profile = await getProfile();
  const query = buildQuery(profile);

  yield {
    type: "start",
    message: `Searching ${query.keywords.slice(0, 4).join(", ")}${query.remoteOnly ? " · remote only" : ""}…`,
    data: { keywords: query.keywords },
    at: now(),
  };

  const { jobs, sources } = await runScrapers(query);

  for (const s of sources) {
    yield {
      type: "source",
      message: s.ok
        ? `${s.source}: ${s.fetched} job${s.fetched === 1 ? "" : "s"}`
        : `${s.source}: failed — ${s.error}`,
      data: s satisfies SourceResult,
      at: now(),
    };
  }

  yield {
    type: "saving",
    message: `Found ${jobs.length} unique jobs. Checking against the store…`,
    at: now(),
  };

  // Dedupe against jobs already saved (by externalId).
  const existing = await db().collection("jobs").select("externalId").get();
  const known = new Set(
    existing.docs.map((d) => (d.data().externalId as string)?.toLowerCase()).filter(Boolean),
  );

  let saved = 0;
  let duplicates = 0;
  let batch = db().batch();
  let pending = 0;

  for (const job of jobs) {
    const key = job.externalId?.toLowerCase();
    if (key && known.has(key)) {
      duplicates++;
      continue;
    }
    if (key) known.add(key);

    const ref = db().collection("jobs").doc();
    batch.set(ref, clean({ ...job, fetchedAt: now() }));
    saved++;
    pending++;

    // Firestore batches cap at 500 writes.
    if (pending >= 450) {
      await batch.commit();
      batch = db().batch();
      pending = 0;
    }
  }

  if (pending > 0) await batch.commit();

  const total = (await db().collection("jobs").count().get()).data().count;

  yield {
    type: "done",
    message: `Saved ${saved} new job${saved === 1 ? "" : "s"} (${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped). ${total} total in store.`,
    data: { saved, duplicates, totalJobs: total, perSource: sources.map((s) => ({ source: s.source, fetched: s.fetched, ok: s.ok })) },
    at: now(),
  };
}
