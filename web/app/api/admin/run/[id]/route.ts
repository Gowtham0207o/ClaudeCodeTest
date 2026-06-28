import { db } from "@/lib/firebase-admin";

type RunData = {
  trigger?: string;
  live?: boolean;
  status?: string;
  quota?: number;
  startedAt?: unknown;
  finishedAt?: unknown;
  counts?: Record<string, number>;
  events?: Array<unknown>;
};

/** Get details of a specific batch run. */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const snap = await db().collection("runs").doc(id).get();

    if (!snap.exists) {
      return Response.json({ status: "error", error: "Run not found" }, { status: 404 });
    }

    const run = snap.data() as RunData;
    return Response.json(
      {
        status: "ok",
        run: {
          id: snap.id,
          trigger: run.trigger,
          live: run.live,
          status: run.status,
          quota: run.quota,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          counts: run.counts,
          totalEvents: run.events?.length || 0,
          recentEvents: run.events?.slice(-20) || [],
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      { status: "error", error: (error as Error).message },
      { status: 500 }
    );
  }
}
