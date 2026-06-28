"use client";

import { useState } from "react";
import { Radar } from "lucide-react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ScrapeEvent {
  type: "start" | "source" | "saving" | "done" | "error";
  message: string;
  at: string;
}

export function ScrapeButton({
  onComplete,
  className,
}: {
  onComplete?: () => void;
  className?: string;
}) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<ScrapeEvent[]>([]);

  const scrape = async () => {
    setRunning(true);
    setLog([]);
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            setLog((prev) => [...prev, JSON.parse(line) as ScrapeEvent]);
          } catch {
            /* ignore partial */
          }
        }
      }
      onComplete?.();
    } catch (err) {
      setLog((prev) => [
        ...prev,
        {
          type: "error",
          message: err instanceof Error ? err.message : "Scrape failed",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-stretch gap-2", className)}>
      <button
        onClick={scrape}
        disabled={running}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white glow-accent disabled:opacity-60"
      >
        {running ? <Spinner /> : <Radar className="size-4" />}
        {running ? "Scraping…" : "Scrape now"}
      </button>

      {log.length > 0 && (
        <div className="max-h-44 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
          {log.map((e, i) => (
            <div
              key={i}
              className={cn(
                "py-0.5",
                e.type === "error"
                  ? "text-rose-300"
                  : e.type === "done"
                    ? "font-medium text-emerald-300"
                    : "text-[var(--color-muted)]",
              )}
            >
              {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
