import { extractText, extractProfile } from "@/lib/resume-extract";
import { saveProfile } from "@/lib/profile";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** POST /api/resume/parse — multipart upload of a resume file.
 *  Extracts text, structures it (GPT or heuristic), merges into the profile. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file uploaded (field 'file')." }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ error: "Uploaded file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "File too large (max 8 MB)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buffer, file.name, file.type);

    if (text.trim().length < 30) {
      return Response.json(
        { error: "Could not read meaningful text from that file. Try a PDF, DOCX, or TXT." },
        { status: 422 },
      );
    }

    const { profile: extracted, usedAI } = await extractProfile(text);

    // Build a clean patch — never overwrite with empty values.
    const patch: Partial<Profile> = {};
    if (extracted.fullName) patch.fullName = extracted.fullName;
    if (extracted.title) patch.title = extracted.title;
    if (extracted.email) patch.email = extracted.email;
    if (extracted.location) patch.location = extracted.location;
    if (extracted.yearsExperience && extracted.yearsExperience > 0)
      patch.yearsExperience = extracted.yearsExperience;
    if (extracted.summary) patch.summary = extracted.summary;
    if (extracted.skills?.length) patch.skills = extracted.skills;
    if (extracted.experience?.length) patch.experience = extracted.experience;

    const profile = await saveProfile(patch);

    return Response.json({
      profile,
      extractedFields: Object.keys(patch),
      usedAI,
      textLength: text.length,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to parse resume." },
      { status: 500 },
    );
  }
}
