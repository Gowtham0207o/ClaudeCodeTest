"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { JobSource, ApplicationStatus } from "@/lib/types";

/* -------------------------------------------------------------- Source badge */
const SOURCE_STYLES: Record<JobSource, string> = {
  remoteok: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  manual: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  remotive: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  arbeitnow: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  jobicy: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  themuse: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  angellist: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  indeed: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  glassdoor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  linkedin: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  instahyre: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

export function SourceBadge({ source }: { source: JobSource }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase",
        SOURCE_STYLES[source] ?? "bg-white/5 text-[var(--color-muted)] border-white/10",
      )}
    >
      {source}
    </span>
  );
}

/* ------------------------------------------------------------ Status pill */
const STATUS_STYLES: Record<ApplicationStatus, string> = {
  draft: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  matched: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  tailoring: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  applied: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  interview: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  offer: "bg-green-500/20 text-green-300 border-green-500/40",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  skipped: "bg-white/5 text-[var(--color-faint)] border-white/10",
};

export function StatusPill({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/* ---------------------------------------------------------- Confidence ring */
export function ConfidenceRing({
  value,
  size = 56,
  stroke = 5,
  label = true,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  const color =
    value >= 70 ? "var(--color-emerald)" : value >= 50 ? "var(--color-amber)" : "var(--color-rose)";

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      {label && (
        <span className="absolute text-sm font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Stat card */
export function StatCard({
  label,
  value,
  sub,
  accent = "var(--color-accent)",
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      className="card relative overflow-hidden p-5"
    >
      <div
        className="absolute -top-10 -right-10 size-28 rounded-full blur-2xl opacity-30"
        style={{ background: accent }}
      />
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-faint)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>}
    </motion.div>
  );
}

/* -------------------------------------------------------------------- Misc */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border-strong)] py-12 text-center">
      <p className="text-sm font-medium text-[var(--color-muted)]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}
