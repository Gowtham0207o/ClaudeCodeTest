import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Admin reset — re-arm the pipeline for a fresh evaluation.
 *
 *  - Clears `processedAt` on every stored job so the (corrected) matcher gets
 *    another shot at them instead of skipping already-processed docs.
 *  - Deletes applications (default: only `skipped` ones) so the dashboard isn't
 *    polluted by the old all-skipped batch.
 *
 * POST body (all optional):
 *   { "clearApplications": "skipped" | "all" | "none" }   default "skipped"
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      clearApplications?: "skipped" | "all" | "none";
    };
    const mode = body.clearApplications ?? "skipped";

    // 1) Un-process all jobs.
    const jobsSnap = await db().collection("jobs").get();
    let jobsReset = 0;
    for (let i = 0; i < jobsSnap.docs.length; i += 400) {
      const batch = db().batch();
      for (const doc of jobsSnap.docs.slice(i, i + 400)) {
        batch.update(doc.ref, { processedAt: FieldValue.delete() });
        jobsReset++;
      }
      await batch.commit();
    }

    // 2) Optionally clear applications.
    let appsDeleted = 0;
    if (mode !== "none") {
      const appsSnap = await db().collection("applications").get();
      const targets = appsSnap.docs.filter(
        (d) => mode === "all" || (d.data() as { status?: string }).status === "skipped",
      );
      for (let i = 0; i < targets.length; i += 400) {
        const batch = db().batch();
        for (const doc of targets.slice(i, i + 400)) {
          batch.delete(doc.ref);
          appsDeleted++;
        }
        await batch.commit();
      }
    }

    return Response.json(
      {
        status: "ok",
        jobsReset,
        appsDeleted,
        clearApplications: mode,
        message: `Re-armed ${jobsReset} jobs; deleted ${appsDeleted} ${mode} applications.`,
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      { status: "error", error: (error as Error).message },
      { status: 500 },
    );
  }
}
