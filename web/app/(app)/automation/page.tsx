"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Loader2, Power, ShieldCheck, Zap, AlertTriangle, Eye } from "lucide-react";
import { Panel, Spinner, StatCard, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Profile, Run, RunEvent } from "@/lib/types";

const LEVEL_COLOR: Record<RunEvent["level"], string> = {
  info: "var(--color-muted)",
  success: "var(--color-emerald)",
  warn: "var(--color-amber)",
  error: "var(--color-rose)",
};

export default function AutomationPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [starting, setStarting] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [supervised, setSupervised] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProfile = useCallback(async () => {
    const r = await fetch("/api/profile").then((x) => x.json());
    setProfile(r.profile);
  }, []);

  const loadRuns = useCallback(async () => {
    const r = await fetch("/api/runs").then((x) => x.json());
    if (Array.isArray(r.runs)) setRuns(r.runs);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loaders, setState runs in a later microtask
    loadProfile();
    loadRuns();
    timer.current = setInterval(loadRuns, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [loadProfile, loadRuns]);

  const setLive = async (live: boolean) => {
    if (!profile) return;
    const automation = { ...profile.automation, live };
    setProfile({ ...profile, automation });
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automation }),
    });
  };

  const runNow = async () => {
    setStarting(true);
    try {
      await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, supervised }),
      });
      await loadRuns();
    } finally {
      setStarting(false);
    }
  };

  const latest = runs[0];
  const live = profile?.automation.live ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automation</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            The autonomous engine: scrape → match (&gt;60%) → tailor LaTeX → apply → track. Hands-off.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="accent-[var(--color-accent)]" />
            Dry-run this start
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]" title="Opens a visible browser per apply, one at a time, so you can watch and step in.">
            <input type="checkbox" checked={supervised} onChange={(e) => setSupervised(e.target.checked)} className="accent-[var(--color-violet)]" />
            <Eye className="size-3.5 text-[var(--color-violet)]" /> Supervised
          </label>
          <button
            onClick={runNow}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white glow-accent disabled:opacity-60"
          >
            {starting ? <Loader2 className="size-4 animate-spin" /> : supervised ? <Eye className="size-4" /> : <Play className="size-4" />}
            {supervised ? "Run supervised" : "Run now"}
          </button>
        </div>
      </div>

      {/* Kill switch */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn("grid size-10 place-items-center rounded-xl", live ? "bg-emerald-500/15" : "bg-amber-500/15")}>
              {live ? <Zap className="size-5 text-emerald-300" /> : <ShieldCheck className="size-5 text-amber-300" />}
            </div>
            <div>
              <p className="text-sm font-semibold">{live ? "LIVE — submitting real applications" : "SAFE — dry-run mode"}</p>
              <p className="mt-0.5 max-w-xl text-xs text-[var(--color-muted)]">
                {live
                  ? "The engine submits applications automatically. LinkedIn/Indeed automation can get accounts flagged — monitor the log."
                  : "Forms are filled and screenshotted but never submitted. Flip live when you're ready to apply for real."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLive(!live)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
              live
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
            )}
          >
            <Power className="size-4" />
            {live ? "Switch to dry-run" : "Go live"}
          </button>
        </div>
      </Panel>

      {/* Latest run counts */}
      {latest ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Applied" value={latest.counts.applied} sub={`of quota ${latest.quota}`} accent="var(--color-emerald)" />
            <StatCard label="Held for review" value={latest.counts.heldForReview} accent="var(--color-amber)" delay={0.05} />
            <StatCard label="Skipped" value={latest.counts.skipped} accent="var(--color-faint)" delay={0.1} />
            <StatCard label="Failed" value={latest.counts.failed} accent="var(--color-rose)" delay={0.15} />
          </div>

          <Panel
            title={
              <span className="flex items-center gap-2">
                Live run log
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                    latest.status === "running"
                      ? "bg-[var(--color-accent)]/15 text-[var(--color-accent-bright)]"
                      : latest.status === "done"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300",
                  )}
                >
                  {latest.status}
                </span>
                <span className="text-[10px] text-[var(--color-faint)]">
                  {latest.live ? "LIVE" : "dry-run"} · {latest.trigger}
                </span>
              </span>
            }
          >
            <div className="max-h-[420px] space-y-1 overflow-auto font-mono text-xs">
              {latest.events.length === 0 && <p className="text-[var(--color-faint)]">Starting…</p>}
              {[...latest.events].reverse().map((e, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 text-[var(--color-faint)]">{new Date(e.at).toLocaleTimeString()}</span>
                  {e.stage && (
                    <span className="shrink-0 uppercase" style={{ color: LEVEL_COLOR[e.level] }}>
                      {e.stage}
                    </span>
                  )}
                  <span style={{ color: e.level === "error" ? "var(--color-rose)" : "var(--color-muted)" }}>{e.message}</span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : (
        <EmptyState title="No runs yet" hint="Hit “Run now” to start the autonomous engine." />
      )}

      {/* Config + setup hints */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Run configuration">
          {profile ? (
            <dl className="space-y-2 text-sm">
              <Row k="Daily quota" v={`${profile.automation.dailyQuota} applications`} />
              <Row k="Auto-apply gate" v={`≥ ${profile.preferences.minConfidence}% confidence`} />
              <Row k="Sources" v={profile.automation.sources.join(", ")} />
              <Row k="Max per source" v={String(profile.automation.maxPerSource)} />
              <Row k="Concurrency" v={String(profile.automation.concurrency)} />
              <Row k="Throttle" v={`${profile.automation.throttleMinMs / 1000}–${profile.automation.throttleMaxMs / 1000}s`} />
            </dl>
          ) : (
            <Spinner />
          )}
          <p className="mt-3 text-xs text-[var(--color-faint)]">Tune these in Settings → Apply answers & automation.</p>
        </Panel>

        <Panel title="Setup checklist">
          <ul className="space-y-2 text-xs text-[var(--color-muted)]">
            <Check ok={Boolean(profile?.applyAnswers.phone)} text="Apply answers filled (phone, links, work auth) in Settings" />
            <Check ok text="LaTeX résumé template present (default ships; drop your own at web/resume/template.tex)" />
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
              <span>Install on the host: <code className="text-[var(--color-accent-bright)]">playwright</code> + Tectonic, and set <code className="text-[var(--color-accent-bright)]">CRON_SECRET</code> for the daily Trigger.dev schedule.</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
              <span>For LinkedIn/Indeed submit, set <code className="text-[var(--color-accent-bright)]">LINKEDIN_EMAIL/PASSWORD</code> etc. in <code>.env.local</code>.</span>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-2 last:border-0">
      <dt className="text-[var(--color-faint)]">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={cn("mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full text-[8px]", ok ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-[var(--color-faint)]")}>
        {ok ? "✓" : "○"}
      </span>
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{text}</motion.span>
    </li>
  );
}
