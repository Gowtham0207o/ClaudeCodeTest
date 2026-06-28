import { db } from "@/lib/firebase-admin";
import type { Application } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await db().collection("applications").limit(200).get();
    const apps: Application[] = snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Application, "id">) }),
    );
    apps.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return Response.json({ applications: apps });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed", applications: [] },
      { status: 500 },
    );
  }
}
