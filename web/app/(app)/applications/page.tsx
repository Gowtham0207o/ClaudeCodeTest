"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import { StatusPill, SourceBadge, Spinner, EmptyState, ConfidenceRing } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import type { Application } from "@/lib/types";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then((d) => setApps(d.applications ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Everything the engine has applied to, with follow-ups.
        </p>
      </div>

      {loading ? (
        <div className="grid h-40 place-items-center">
          <Spinner className="size-6" />
        </div>
      ) : apps.length === 0 ? (
        <EmptyState title="No applications yet" hint="Run the pipeline to create your first application." />
      ) : (
        <div className="space-y-3">
          {apps.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="card flex items-center gap-4 p-4"
            >
              <ConfidenceRing value={a.confidence} size={48} stroke={4} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.jobTitle}</p>
                <p className="truncate text-xs text-[var(--color-muted)]">{a.company}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <SourceBadge source={a.source} />
                  {a.appliedAt && (
                    <span className="text-[11px] text-[var(--color-faint)]">applied {timeAgo(a.appliedAt)}</span>
                  )}
                  {a.followUps?.some((f) => !f.done) && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-amber)]">
                      <CalendarClock className="size-3" /> follow-up scheduled
                    </span>
                  )}
                </div>
              </div>
              {a.tailored && (
                <p className="hidden max-w-[280px] text-xs text-[var(--color-muted)] lg:block">
                  {a.tailored.headline}
                </p>
              )}
              <StatusPill status={a.status} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
