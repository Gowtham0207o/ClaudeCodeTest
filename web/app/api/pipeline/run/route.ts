import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
// Supervised runs keep a visible browser open for manual takeover (~8 min cap).
export const maxDuration = 600;

export async function POST(request: Request) {
  const { jobId, supervised } = (await request.json()) as {
    jobId?: string;
    supervised?: boolean;
  };
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runPipeline(jobId, {
          supervised: !!supervised,
          signal: request.signal,
        })) {
          if (request.signal.aborted) break;
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        // Client hit “Stop” (disconnected) — nothing to report back.
        if (request.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Pipeline error";
        try {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                stage: "scrape",
                status: "error",
                message,
                at: new Date().toISOString(),
              }) + "\n",
            ),
          );
        } catch {
          /* stream already closed */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed by client abort */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
