import { db } from "@/lib/firebase-admin";
import { getProfile } from "@/lib/profile";
import { matchJob } from "@/lib/match";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [snap, profile] = await Promise.all([
      db().collection("jobs").limit(150).get(),
      getProfile(),
    ]);

    const jobs: Job[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }));

    const scored = jobs
      .map((job) => ({ job, match: matchJob(job, profile) }))
      .sort((a, b) => b.match.confidence - a.match.confidence);

    return Response.json({ jobs: scored, total: jobs.length });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load jobs", jobs: [], total: 0 },
      { status: 500 },
    );
  }
}
