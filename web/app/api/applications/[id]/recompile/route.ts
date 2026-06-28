import { db, clean } from "@/lib/firebase-admin";
import { buildResume } from "@/lib/latex";
import { getProfile } from "@/lib/profile";
import { matchJob } from "@/lib/match";
import type { Application, Job } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return Response.json({ error: "Missing application ID" }, { status: 400 });

    const snap = await db().collection("applications").doc(id).get();
    if (!snap.exists) return Response.json({ error: "Application not found" }, { status: 404 });

    const app = snap.data() as Application;
    const profile = await getProfile();

    const fJob: Job = {
      id: app.jobId,
      title: app.jobTitle,
      company: app.company,
      source: app.source,
      descriptionText: app.jobDescription || "",
      requiredSkills: app.keywords || [],
    };

    const fMatch = matchJob(fJob, profile);
    const tailored = app.tailored || {
      headline: "",
      summary: "",
      highlightedBullets: [],
      coverNote: "",
      emphasizedSkills: [],
      rationale: "",
      injectedKeywords: [],
    };

    const resume = await buildResume({
      jobId: app.jobId,
      profile,
      tailored,
      match: fMatch,
      jdKeywords: app.keywords || [],
    });

    const updated: Application = {
      ...app,
      resumePdfUrl: resume.pdfUrl,
      updatedAt: new Date().toISOString(),
    };

    await db().collection("applications").doc(id).set(clean(updated));

    return Response.json({
      application: updated,
      compiledWith: resume.compiledWith,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to recompile resume." },
      { status: 500 },
    );
  }
}
