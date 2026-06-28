"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Database, ArrowRight, Zap } from "lucide-react";
import { StatCard, Panel, SourceBadge, StatusPill, Spinner, EmptyState } from "@/components/ui";
import type { Application, JobSource } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

interface Stats {
  totals: {
    jobs: number;
    applications: number;
    applied: number;
    autoApplyReady: number;
    reviewable: number;
    responseRate: number;
  };
  bySource: Record<string, number>;
  statusCounts: Record<string, number>;
  recent: Application[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stats");
      setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader, setState runs in a later microtask
    load();
  }, [load]);

  const seed = async () => {
    setSeeding(true);
    try {
      await fetch("/api/seed", { method: "POST" });
      await load();
    } finally {
      setSeeding(false);
    }
  };

  const totals = stats?.totals;
  const sources = Object.entries(stats?.bySource ?? {}).sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(1, ...sources.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
            Your autonomous job-application command center.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={seed}
            disabled={seeding}
            className="inline-flex items-center justify-center sm:justify-start gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-elevated)] disabled:opacity-60"
          >
            {seeding ? <Spinner /> : <Database className="size-4" />}
            <span className="hidden sm:inline">Seed sample data</span>
            <span className="sm:hidden">Seed</span>
          </button>
          <Link
            href="/pipeline"
            className="inline-flex items-center justify-center sm:justify-start gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white glow-accent"
          >
            <Zap className="size-4" /> <span className="hidden sm:inline">Run pipeline</span>
            <span className="sm:hidden">Run</span>
          </Link>
        </div>
      </div>

      {loading && !stats ? (
        <div className="grid h-40 place-items-center text-[var(--color-muted)]">
          <Spinner className="size-6" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Jobs in store" value={totals?.jobs ?? 0} sub="across all sources" delay={0} />
            <StatCard
              label="Auto-apply ready"
              value={totals?.autoApplyReady ?? 0}
              sub={`${totals?.reviewable ?? 0} need review`}
              accent="var(--color-emerald)"
              delay={0.05}
            />
            <StatCard
              label="Applications"
              value={totals?.applications ?? 0}
              sub={`${totals?.applied ?? 0} submitted`}
              accent="var(--color-violet)"
              delay={0.1}
            />
            <StatCard
              label="Response rate"
              value={`${totals?.responseRate ?? 0}%`}
              sub="interviews / applied"
              accent="var(--color-cyan)"
              delay={0.15}
            />
          </div>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
            <Panel
              title="Recent activity"
              action={
                <Link href="/applications" className="flex items-center gap-1 text-xs text-[var(--color-accent-bright)]">
                  View all <ArrowRight className="size-3" />
                </Link>
              }
            >
              {stats?.recent?.length ? (
                <div className="divide-y divide-[var(--color-border)]">
                  {stats.recent.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.jobTitle}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {a.company} · {timeAgo(a.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs tabular-nums text-[var(--color-faint)]">{a.confidence}%</span>
                        <StatusPill status={a.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No applications yet" hint="Run the pipeline to apply to your first job." />
              )}
            </Panel>

            <Panel title="Jobs by source">
              {sources.length ? (
                <div className="space-y-3">
                  {sources.map(([src, n], i) => (
                    <div key={src} className="flex items-center gap-3">
                      <div className="w-24 shrink-0">
                        <SourceBadge source={src as JobSource} />
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${(n / maxSource) * 100}%` }}
                          transition={{ duration: 0.7, delay: i * 0.05 }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs tabular-nums text-[var(--color-muted)]">{n}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No jobs yet" hint="Seed sample data to get started." />
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
