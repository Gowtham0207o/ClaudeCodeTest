import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const RUNTIME_DIR = path.join(process.cwd(), ".runtime");
const ALLOWED_ROOTS = new Set(["resumes", "screenshots"]);
const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xdv": "application/pdf", // XeTeX output, treated as PDF
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".tex": "text/plain; charset=utf-8",
};

/**
 * GET /api/files/<root>/<name> — serves generated artifacts (tailored résumé
 * PDFs, apply screenshots) from the host's .runtime dir. Locked to known roots
 * and guarded against path traversal.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const { path: segs } = await ctx.params;
  if (!segs || segs.length < 2 || !ALLOWED_ROOTS.has(segs[0])) {
    return new Response("Not found", { status: 404 });
  }
  if (segs.some((s) => s.includes("..") || s.includes("/") || s.includes("\\"))) {
    return new Response("Bad path", { status: 400 });
  }

  const filePath = path.join(RUNTIME_DIR, segs[0], segs.slice(1).join("/"));
  if (!filePath.startsWith(RUNTIME_DIR)) {
    return new Response("Bad path", { status: 400 });
  }

  try {
    const data = await readFile(filePath);
    const type = TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
