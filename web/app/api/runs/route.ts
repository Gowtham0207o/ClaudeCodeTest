import { db } from "@/lib/firebase-admin";
import { kickBatch } from "@/lib/batch";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/runs — most recent runs (for the automation dashboard). */
export async function GET() {
  try {
    const snap = await db().collection("runs").limit(50).get();
    const runs: Run[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Run, "id">) }));
    runs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
    return Response.json({ runs });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/runs — manually kick a run from the dashboard "Run now" button.
 * Body: { dryRun?: boolean, quota?: number }. Returns the runId immediately.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      quota?: number;
      supervised?: boolean;
    };
    const { runId } = await kickBatch({
      trigger: "manual",
      dryRun: body.dryRun,
      quotaOverride: body.quota,
      supervised: !!body.supervised,
    });
    return Response.json({ ok: true, runId });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
