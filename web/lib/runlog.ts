import "server-only";
import { db, clean } from "./firebase-admin";
import type { Run, RunCounts, RunEvent, RunStatus } from "./types";

/**
 * Run-log persistence for the autonomous batch (R6). Each daily run is one
 * Firestore `runs` doc that the /automation dashboard streams live. Events are
 * capped so a long run never bloats the document.
 */

const MAX_EVENTS = 300;

const zeroCounts = (): RunCounts => ({
  scanned: 0,
  matched: 0,
  tailored: 0,
  applied: 0,
  heldForReview: 0,
  skipped: 0,
  failed: 0,
});

export async function startRun(opts: {
  live: boolean;
  quota: number;
  trigger: "cron" | "manual";
}): Promise<Run> {
  const ref = db().collection("runs").doc();
  const run: Run = {
    id: ref.id,
    startedAt: new Date().toISOString(),
    status: "running",
    live: opts.live,
    quota: opts.quota,
    counts: zeroCounts(),
    events: [],
    trigger: opts.trigger,
  };
  await ref.set(run);
  return run;
}

/** Append an event (and optional count deltas), persisting the run. */
export async function event(
  run: Run,
  level: RunEvent["level"],
  message: string,
  deltas?: Partial<RunCounts>,
  extra?: Pick<RunEvent, "jobId" | "stage">,
): Promise<void> {
  run.events.push({ at: new Date().toISOString(), level, message, ...extra });
  if (run.events.length > MAX_EVENTS) run.events = run.events.slice(-MAX_EVENTS);
  if (deltas) {
    for (const [k, v] of Object.entries(deltas)) {
      run.counts[k as keyof RunCounts] += v as number;
    }
  }
  await persist(run);
}

export async function finishRun(run: Run, status: RunStatus): Promise<void> {
  run.status = status;
  run.finishedAt = new Date().toISOString();
  await persist(run);
}

async function persist(run: Run): Promise<void> {
  try {
    await db().collection("runs").doc(run.id).set(clean(run));
  } catch (err) {
    console.error("[runlog] persist failed:", (err as Error).message);
  }
}
