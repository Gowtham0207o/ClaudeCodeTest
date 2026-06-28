import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder. A package-lock.json exists in the
  // parent dir too, so Turbopack otherwise infers the wrong root and warns.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // pdf-parse / mammoth are CJS libs that touch `fs` — keep them out of the
  // bundle so the resume-parsing route loads them at runtime instead.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
