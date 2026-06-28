import { inspectUrl } from "@/lib/apply-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/apply-url/inspect — { url } → parsed form + suggested answers. */
export async function POST(req: Request) {
  try {
    const { url: raw } = (await req.json()) as { url?: string };
    let url = (raw ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!url || !/^https?:\/\/\S+\.\S+/i.test(url)) {
      return Response.json(
        { error: "Provide a valid job URL (e.g. https://job-boards.greenhouse.io/...)." },
        { status: 400 },
      );
    }
    const result = await inspectUrl(url);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to inspect that job link." },
      { status: 500 },
    );
  }
}
