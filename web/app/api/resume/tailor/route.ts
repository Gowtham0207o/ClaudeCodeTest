import { tailorResumeFromJd } from "@/lib/resume-tailor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/resume/tailor — { jobDescription, jobTitle?, company? }
 *  → tailored résumé PDF with the JD's keywords injected. */
export async function POST(req: Request) {
  try {
    const { jobDescription, jobTitle, company } = (await req.json()) as {
      jobDescription?: string;
      jobTitle?: string;
      company?: string;
    };
    if (!jobDescription || jobDescription.trim().length < 30) {
      return Response.json(
        { error: "Paste a job description (at least a few sentences)." },
        { status: 400 },
      );
    }
    const result = await tailorResumeFromJd({ jobDescription, jobTitle, company });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to tailor résumé." },
      { status: 500 },
    );
  }
}
