"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, ExternalLink } from "lucide-react";
import { ConfidenceRing, SourceBadge, Spinner, EmptyState } from "@/components/ui";
import { ScrapeButton } from "@/components/scrape-button";
import { cn } from "@/lib/utils";
import type { Job, MatchResult } from "@/lib/types";

type Scored = { job: Job; match: MatchResult };
type Filter = "all" | "auto-apply" | "review" | "skip";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Scored[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const loadJobs = useCallback(() => {
    setLoading(true);
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader, setState runs in a later microtask
    loadJobs();
  }, [loadJobs]);

  const filtered = useMemo(() => {
    return jobs.filter(({ job, match }) => {
      if (filter !== "all" && match.verdict !== filter) return false;
      if (!q) return true;
      const hay = `${job.title} ${job.company}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [jobs, q, filter]);

  const counts = useMemo(() => {
    const c = { all: jobs.length, "auto-apply": 0, review: 0, skip: 0 } as Record<Filter, number>;
    jobs.forEach(({ match }) => (c[match.verdict] += 1));
    return c;
  }, [jobs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Matched Jobs</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Live jobs scraped from your profile — scored and sorted by confidence.
          </p>
        </div>
        <ScrapeButton onComplete={loadJobs} className="w-full sm:w-72" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or company…"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-accent)]/50"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
          {(["all", "auto-apply", "review", "skip"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition",
                filter === f ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-muted)] hover:text-white",
              )}
            >
              {f} <span className="opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid h-40 place-items-center">
          <Spinner className="size-6" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No jobs match" hint="Try a different filter, or hit “Scrape now” to pull fresh jobs for your profile." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ job, match }, i) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className="card flex flex-col p-5"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{job.title}</p>
                  <p className="truncate text-xs text-[var(--color-muted)]">{job.company}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">{job.location ?? "—"}</p>
                </div>
                <ConfidenceRing value={match.confidence} size={52} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {(job.requiredSkills ?? []).slice(0, 6).map((sk) => (
                  <span
                    key={sk}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px]",
                      match.matchedSkills.includes(sk)
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-white/5 text-[var(--color-faint)]",
                    )}
                  >
                    {sk}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex items-center justify-between pt-4">
                <SourceBadge source={job.source} />
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                      match.verdict === "auto-apply"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : match.verdict === "review"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-rose-500/15 text-rose-300",
                    )}
                  >
                    {match.verdict}
                  </span>
                  {job.jobUrl && (
                    <a href={job.jobUrl} target="_blank" rel="noreferrer" className="text-[var(--color-faint)] hover:text-white">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
