"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Target,
  Wand2,
  SendHorizontal,
  ClipboardCheck,
  Check,
  X,
  Play,
  Loader2,
  Sparkles,
  FileText,
  Eye,
  Square,
} from "lucide-react";
import { ConfidenceRing, SourceBadge, Spinner, EmptyState } from "@/components/ui";
import { cn, downloadFile } from "@/lib/utils";
import type {
  Job,
  MatchResult,
  PipelineEvent,
  PipelineStageId,
  StageStatus,
  TailoredResume,
  Application,
} from "@/lib/types";

type Scored = { job: Job; match: MatchResult };

const STAGES: { id: PipelineStageId; label: string; icon: typeof Search }[] = [
  { id: "scrape", label: "Scrape", icon: Search },
  { id: "match", label: "Match", icon: Target },
  { id: "tailor", label: "Tailor", icon: Wand2 },
  { id: "apply", label: "Apply", icon: SendHorizontal },
  { id: "track", label: "Track", icon: ClipboardCheck },
];

const STATUS_COLOR: Record<StageStatus, string> = {
  pending: "var(--color-faint)",
  running: "var(--color-accent-bright)",
  done: "var(--color-emerald)",
  skipped: "var(--color-amber)",
  error: "var(--color-rose)",
};

export default function PipelinePage() {
  const [jobs, setJobs] = useState<Scored[]>([]);
  const [selected, setSelected] = useState<Scored | null>(null);
  const [running, setRunning] = useState(false);
  const [supervised, setSupervised] = useState(true);
  const [stages, setStages] = useState<Record<PipelineStageId, { status: StageStatus; message: string }>>(
    () => initStages(),
  );
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const [application, setApplication] = useState<Application | null>(null);
  const [log, setLog] = useState<PipelineEvent[]>([]);
  const [stopping, setStopping] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    if (Array.isArray(data.jobs)) {
      setJobs(data.jobs);
      setSelected((cur) => cur ?? data.jobs[0] ?? null);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const reset = () => {
    setStages(initStages());
    setMatch(null);
    setTailored(null);
    setApplication(null);
    setLog([]);
  };

  const run = useCallback(async () => {
    if (!selected || running) return;
    reset();
    setRunning(true);
    setStopping(false);
    setStages((s) => ({ ...s, scrape: { status: "running", message: "Starting…" } }));

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selected.job.id, supervised }),
        signal: ac.signal,
      });
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as PipelineEvent;
          applyEvent(evt);
        }
      }
    } catch (err) {
      if (ac.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        // User hit Stop — mark whatever was mid-flight as stopped, not failed.
        setStages((s) => {
          const next = { ...s };
          for (const id of Object.keys(next) as PipelineStageId[]) {
            if (next[id].status === "running") next[id] = { status: "error", message: "Stopped" };
          }
          return next;
        });
        setLog((l) => [
          ...l,
          { stage: "apply", status: "error", message: "Pipeline stopped by you.", at: new Date().toISOString() } as PipelineEvent,
        ]);
      } else {
        setStages((s) => ({
          ...s,
          scrape: { status: "error", message: err instanceof Error ? err.message : "Failed" },
        }));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setStopping(false);
      loadJobs();
    }
  }, [selected, running, loadJobs, supervised]);

  const stop = useCallback(() => {
    setStopping(true);
    abortRef.current?.abort();
  }, []);

  function applyEvent(evt: PipelineEvent) {
    setLog((l) => [...l, evt]);
    setStages((s) => ({ ...s, [evt.stage]: { status: evt.status, message: evt.message } }));
    const data = evt.data as Record<string, unknown> | undefined;
    if (evt.stage === "match" && data?.match) setMatch(data.match as MatchResult);
    if (evt.stage === "tailor" && data?.tailored) {
      setTailored(data.tailored as TailoredResume);
      setUsedAI(Boolean(data.usedAI));
    }
    if (evt.stage === "track" && data?.application) setApplication(data.application as Application);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Header />

      {/* Job picker + run control */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-[1.1fr_2fr]">
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-semibold">Pick a job</h2>
            <span className="text-xs text-[var(--color-faint)]">{jobs.length} matched</span>
          </div>
          <div className="max-h-[300px] sm:max-h-[420px] space-y-2 overflow-auto pr-1">
            {jobs.length === 0 && <EmptyState title="No jobs yet" hint="Seed data from the Dashboard." />}
            {jobs.map((s) => (
              <button
                key={s.job.id}
                onClick={() => !running && setSelected(s)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                  selected?.job.id === s.job.id
                    ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-white/[0.02]",
                )}
              >
                <ConfidenceRing value={s.match.confidence} size={44} stroke={4} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.job.title}</p>
                  <p className="truncate text-xs text-[var(--color-muted)]">{s.job.company}</p>
                </div>
                <SourceBadge source={s.job.source} />
              </button>
            ))}
          </div>
        </div>

        {/* Selected + run */}
        <div className="card flex flex-col p-4 sm:p-5">
          {selected ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base sm:text-lg font-semibold truncate">{selected.job.title}</p>
                  <p className="text-xs sm:text-sm text-[var(--color-muted)] truncate">
                    {selected.job.company} · {selected.job.location ?? "—"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(selected.job.requiredSkills ?? []).slice(0, 6).map((sk) => (
                      <span
                        key={sk}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] sm:text-[11px]",
                          selected.match.matchedSkills.includes(sk)
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-white/5 text-[var(--color-faint)]",
                        )}
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>
                <ConfidenceRing value={selected.match.confidence} size={48} stroke={3} />
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <input
                  type="checkbox"
                  checked={supervised}
                  onChange={(e) => setSupervised(e.target.checked)}
                  disabled={running}
                  className="mt-0.5 size-4 accent-[var(--color-violet)]"
                />
                <span className="text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-[var(--color-text)]">
                    <Eye className="size-3.5 text-[var(--color-violet)]" />
                    Supervised — watch the apply in a visible browser
                  </span>
                  <span className="mt-0.5 block text-[var(--color-muted)]">
                    {supervised
                      ? "When it reaches the Apply step, a Chromium window opens on this PC. Take over if it gets stuck, then close the window to continue."
                      : "Runs headless — you won't see the browser or be able to intervene."}
                  </span>
                </span>
              </label>

              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={run}
                  disabled={running}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 glow-accent"
                >
                  {running ? <Loader2 className="size-3 sm:size-4 animate-spin" /> : supervised ? <Eye className="size-3 sm:size-4" /> : <Play className="size-3 sm:size-4" />}
                  <span className="hidden sm:inline">{running ? "Running pipeline…" : supervised ? "Run pipeline (watch it apply)" : "Run autonomous pipeline"}</span>
                  <span className="sm:hidden">{running ? "Running…" : "Run"}</span>
                </button>
                {running && (
                  <button
                    onClick={stop}
                    disabled={stopping}
                    title="Stop the run — closes the browser if it's open"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-60"
                  >
                    {stopping ? <Loader2 className="size-3 sm:size-4 animate-spin" /> : <Square className="size-3 sm:size-4" />}
                    {stopping ? "Stopping…" : "Stop"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <EmptyState title="Select a job to begin" />
          )}
        </div>
      </div>

      {/* Stage flow */}
      <div className="card p-4 sm:p-6 grid-bg">
        <div className="flex items-stretch justify-between gap-1 sm:gap-2 overflow-x-auto">
          {STAGES.map((stage, i) => (
            <div key={stage.id} className="flex flex-1 items-center min-w-0">
              <StageNode stage={stage} state={stages[stage.id]} />
              {i < STAGES.length - 1 && (
                <Connector active={stages[stage.id].status === "done"} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {(match || tailored || application) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2"
          >
            {match && <MatchCard match={match} />}
            {tailored && <TailoredCard tailored={tailored} usedAI={usedAI} application={application} />}
          </motion.div>
        )}
      </AnimatePresence>

      {log.length > 0 && <LogStream log={log} />}
    </div>
  );
}

function initStages() {
  return STAGES.reduce(
    (acc, s) => ({ ...acc, [s.id]: { status: "pending" as StageStatus, message: "" } }),
    {} as Record<PipelineStageId, { status: StageStatus; message: string }>,
  );
}

function Header() {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Live Pipeline</h1>
        <span className="rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-[var(--color-accent-bright)]">
          end-to-end
        </span>
      </div>
      <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
        One job, fully autonomous — scrape → match → tailor → apply → track. No manual steps.
      </p>
    </div>
  );
}

function StageNode({
  stage,
  state,
}: {
  stage: { id: PipelineStageId; label: string; icon: typeof Search };
  state: { status: StageStatus; message: string };
}) {
  const Icon = stage.icon;
  const color = STATUS_COLOR[state.status];
  const isRunning = state.status === "running";
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <motion.div
        animate={{ scale: isRunning ? [1, 1.08, 1] : 1 }}
        transition={{ repeat: isRunning ? Infinity : 0, duration: 1.2 }}
        className={cn(
          "grid place-items-center rounded-2xl border transition-colors size-10 sm:size-14",
          isRunning && "animate-pulse-ring",
        )}
        style={{ borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        {state.status === "done" ? (
          <Check className="size-4 sm:size-6" style={{ color }} />
        ) : state.status === "error" ? (
          <X className="size-4 sm:size-6" style={{ color }} />
        ) : isRunning ? (
          <Loader2 className="size-4 sm:size-6 animate-spin" style={{ color }} />
        ) : (
          <Icon className="size-4 sm:size-6" style={{ color }} />
        )}
      </motion.div>
      <p className="mt-1 sm:mt-2 text-[10px] sm:text-xs font-semibold" style={{ color: state.status === "pending" ? "var(--color-muted)" : color }}>
        <span className="hidden sm:inline">{stage.label}</span>
        <span className="sm:hidden">{stage.label.slice(0, 3)}</span>
      </p>
      <p className="mt-0.5 h-6 sm:h-8 max-w-[100px] sm:max-w-[150px] text-[8px] sm:text-[10px] leading-tight text-[var(--color-faint)]">
        {state.message}
      </p>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
      <motion.div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-emerald)]"
        initial={{ width: "0%" }}
        animate={{ width: active ? "100%" : "0%" }}
        transition={{ duration: 0.6 }}
      />
    </div>
  );
}

function MatchCard({ match }: { match: MatchResult }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Match analysis</h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
            match.verdict === "auto-apply"
              ? "bg-emerald-500/15 text-emerald-300"
              : match.verdict === "review"
                ? "bg-amber-500/15 text-amber-300"
                : "bg-rose-500/15 text-rose-300",
          )}
        >
          {match.verdict}
        </span>
      </div>
      <div className="space-y-3">
        {match.breakdown.map((b) => (
          <div key={b.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-muted)]">{b.label}</span>
              <span className="tabular-nums font-medium">{b.score}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)]"
                initial={{ width: 0 }}
                animate={{ width: `${b.score}%` }}
                transition={{ duration: 0.7 }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-faint)]">{b.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TailoredCard({
  tailored,
  usedAI,
  application,
}: {
  tailored: TailoredResume;
  usedAI: boolean;
  application: Application | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!application?.resumePdfUrl) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadFile(application.resumePdfUrl, `resume-${application.id}.pdf`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-[var(--color-violet)]" />
          Tailored resume
        </h3>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--color-muted)]">
          {usedAI ? "GPT" : "fallback"}
        </span>
      </div>
      <p className="text-sm font-medium text-[var(--color-accent-bright)]">{tailored.headline}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">{tailored.summary}</p>
      <ul className="mt-3 space-y-1.5">
        {tailored.highlightedBullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-xs text-[var(--color-text)]">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
            {b}
          </li>
        ))}
      </ul>
      {application?.resumePdfUrl && (
        <>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-3 py-2 text-xs font-medium text-[var(--color-accent-bright)] hover:bg-[var(--color-accent)]/20 disabled:opacity-60"
          >
            {downloading ? <Spinner className="size-4" /> : <FileText className="size-4" />}
            {downloading ? "Downloading…" : "Download tailored résumé PDF"}
          </button>
          {downloadError && (
            <div className="mt-2 text-xs text-rose-300">{downloadError}</div>
          )}
        </>
      )}
      {application?.status === "applied" && application.appliedAt && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <Check className="size-4" /> Applied automatically — tracked with a follow-up scheduled.
        </div>
      )}
    </div>
  );
}

function LogStream({ log }: { log: PipelineEvent[] }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold">Activity log</h3>
      <div className="space-y-1 font-mono text-xs">
        {log.map((e, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <span className="text-[var(--color-faint)]">
              {new Date(e.at).toLocaleTimeString()}
            </span>
            <span className="uppercase" style={{ color: STATUS_COLOR[e.status] }}>
              {e.stage}
            </span>
            <span className="text-[var(--color-muted)]">{e.message}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
