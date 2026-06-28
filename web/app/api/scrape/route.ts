import { scrapeAndStore } from "@/lib/scrape";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/scrape — runs every live source against the saved profile and
 *  streams progress as newline-delimited JSON. */
export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of scrapeAndStore()) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              message: err instanceof Error ? err.message : "Scrape failed",
              at: new Date().toISOString(),
            }) + "\n",
          ),
        );
      } finally {
        controller.close();
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
