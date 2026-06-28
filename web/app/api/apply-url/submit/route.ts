import { applyUrl } from "@/lib/apply-url";

export const dynamic = "force-dynamic";
// Generous budget: supervised mode keeps a visible browser open for manual
// takeover (capped at ~8 min in lingerForHandoff).
export const maxDuration = 600;

/** POST /api/apply-url/submit — { url, answers, live, supervised } → fill + (optionally) submit. */
export async function POST(req: Request) {
  try {
    const { url, answers, live, supervised } = (await req.json()) as {
      url?: string;
      answers?: Record<string, string>;
      live?: boolean;
      supervised?: boolean;
    };
    let clean = (url ?? "").trim();
    if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
    if (!clean || !/^https?:\/\/\S+\.\S+/i.test(clean)) {
      return Response.json(
        { error: "Provide a valid job URL (e.g. https://job-boards.greenhouse.io/...)." },
        { status: 400 },
      );
    }
    const result = await applyUrl({
      url: clean,
      answers: answers ?? {},
      live: !!live,
      supervised: supervised !== false,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to apply." },
      { status: 500 },
    );
  }
}
