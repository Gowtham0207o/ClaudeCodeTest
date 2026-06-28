import { logger, schedules } from "@trigger.dev/sdk/v3";

/**
 * JobSync daily scheduler (R6).
 *
 * Trigger.dev is now a *thin scheduler*: all scrape/match/tailor/LaTeX/apply
 * logic lives in the Next.js app (`web/lib/*`). This task just fires the daily
 * autonomous run by calling the app's batch endpoint, which kicks the run in
 * the background and returns a runId immediately.
 *
 * Required env (Trigger.dev project):
 *   JOBSYNC_BASE_URL — the deployed web app origin, e.g. https://jobsync.example.com
 *   CRON_SECRET      — shared secret guarding /api/cron/daily-batch
 */
export const dailyApply = schedules.task({
  id: "daily-apply",
  cron: "0 6 * * *", // daily at 06:00
  maxDuration: 120,
  run: async () => {
    const base = process.env.JOBSYNC_BASE_URL;
    const secret = process.env.CRON_SECRET;
    if (!base || !secret) {
      throw new Error("Set JOBSYNC_BASE_URL and CRON_SECRET in the Trigger.dev project env.");
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/daily-batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };

    logger.info("Kicked JobSync daily batch", { status: res.status, runId: data.runId });
    if (!res.ok) {
      throw new Error(`daily-batch returned ${res.status}: ${data.error ?? "unknown error"}`);
    }
    return { success: true, runId: data.runId, at: new Date().toISOString() };
  },
});
