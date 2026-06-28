import { kickBatch } from "@/lib/batch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Bearer token or ?key= must match CRON_SECRET. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  return auth === `Bearer ${secret}` || key === secret;
}

/**
 * POST/GET /api/cron/daily-batch — the scheduler entrypoint. Kicks the daily
 * autonomous run in the background and returns its runId immediately so the
 * caller (Trigger.dev) never waits for the (minutes-long) batch to finish.
 * Optional query: ?quota=N, ?dryRun=1.
 */
async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized — set CRON_SECRET and pass it." }, { status: 401 });
  }
  const url = new URL(req.url);
  const quota = url.searchParams.get("quota");
  const dryRun = url.searchParams.get("dryRun") === "1";

  const { runId } = await kickBatch({
    trigger: "cron",
    quotaOverride: quota ? Number(quota) : undefined,
    dryRun,
  });
  return Response.json({ ok: true, runId });
}

export const GET = handle;
export const POST = handle;
