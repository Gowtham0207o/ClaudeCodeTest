import { runBatch } from "@/lib/batch";

/** Admin manual batch trigger — for testing without waiting for cron. */
export async function POST(req: Request) {
  try {
    const { dryRun = true, quota } = (await req.json()) as { dryRun?: boolean; quota?: number };

    const run = await runBatch({
      trigger: "manual",
      dryRun: dryRun ?? true,
      quotaOverride: quota,
    });

    return Response.json(
      {
        status: "ok",
        runId: run.id,
        live: run.live,
        quota: run.quota,
        trigger: run.trigger,
        message: `Batch ${dryRun ? "dry-run" : "LIVE"} triggered. Check /api/admin/run/${run.id} for progress.`,
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
