import { db, clean } from "@/lib/firebase-admin";
import type { Application, ApplicationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: ApplicationStatus[] = [
  "draft", "matched", "tailoring", "applied", "interview", "offer", "rejected", "skipped",
];

/** GET a single application. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const snap = await db().collection("applications").doc(id).get();
    if (!snap.exists) return Response.json({ error: "Application not found." }, { status: 404 });
    return Response.json({ application: { id: snap.id, ...snap.data() } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** PATCH editable fields — status, title, company, notes, appliedAt, follow-ups. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Partial<Application>;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof body.jobTitle === "string") patch.jobTitle = body.jobTitle;
    if (typeof body.company === "string") patch.company = body.company;
    if (typeof body.notes === "string") patch.notes = body.notes;
    if (typeof body.appliedAt === "string") patch.appliedAt = body.appliedAt;
    if (Array.isArray(body.followUps)) patch.followUps = body.followUps;
    if (body.status && STATUSES.includes(body.status)) {
      patch.status = body.status;
      // First time it's marked applied, stamp the applied date if absent.
      if (body.status === "applied" && !body.appliedAt) patch.appliedAt = new Date().toISOString();
    }

    const ref = db().collection("applications").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ error: "Application not found." }, { status: 404 });
    await ref.set(clean(patch), { merge: true });
    const updated = await ref.get();
    return Response.json({ application: { id, ...updated.data() } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** DELETE an application (the stored résumé PDF is left on disk). */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db().collection("applications").doc(id).delete();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
