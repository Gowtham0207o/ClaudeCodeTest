import { db } from "@/lib/firebase-admin";
import { getProfile } from "@/lib/profile";
import { matchJob } from "@/lib/match";
import type { Application, Job } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [jobsSnap, appsSnap, profile] = await Promise.all([
      db().collection("jobs").limit(500).get(),
      db().collection("applications").limit(500).get(),
      getProfile(),
    ]);

    const jobs: Job[] = jobsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }));
    const apps: Application[] = appsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Application, "id">) }));

    const bySource: Record<string, number> = {};
    let autoApplyReady = 0;
    let reviewable = 0;
    for (const job of jobs) {
      bySource[job.source] = (bySource[job.source] ?? 0) + 1;
      const m = matchJob(job, profile);
      if (m.verdict === "auto-apply") autoApplyReady++;
      else if (m.verdict === "review") reviewable++;
    }

    const statusCounts: Record<string, number> = {};
    for (const a of apps) statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;

    const applied = statusCounts["applied"] ?? 0;
    const interview = statusCounts["interview"] ?? 0;
    const responseRate = applied ? Math.round((interview / applied) * 100) : 0;

    const recent = [...apps]
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 6);

    return Response.json({
      totals: {
        jobs: jobs.length,
        applications: apps.length,
        applied,
        autoApplyReady,
        reviewable,
        responseRate,
      },
      bySource,
      statusCounts,
      recent,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
