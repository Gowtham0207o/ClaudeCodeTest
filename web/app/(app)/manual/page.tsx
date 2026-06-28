"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Trash2,
  ChevronDown,
  Check,
  Save,
  ClipboardList,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Spinner, EmptyState, SourceBadge } from "@/components/ui";
import { timeAgo, downloadFile } from "@/lib/utils";
import type { Application } from "@/lib/types";

const TRACK_STATUSES = ["draft", "applied", "interview", "offer", "rejected"] as const;

export default function ManualApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    fetch("/api/applications")
      .then((r) => r.json())
      .then((d) => setApps(((d.applications ?? []) as Application[]).filter((a) => a.source === "manual" || a.manual)))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    setApps((xs) => xs.filter((a) => a.id !== id));
    await fetch(`/api/applications/${id}`, { method: "DELETE" });
  };

  const patched = (updated: Application) =>
    setApps((xs) => xs.map((a) => (a.id === updated.id ? updated : a)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manual Applications</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Every résumé you tailor is saved here as an application you can edit and track.
        </p>
      </div>

      {loading ? (
        <div className="grid h-40 place-items-center">
          <Spinner className="size-6" />
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          title="No manual applications yet"
          hint="Tailor a résumé on the Tailor Résumé page — it'll be saved here to track."
        />
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Card key={a.id} app={a} onPatched={patched} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  app,
  onPatched,
  onRemove,
}: {
  app: Application;
  onPatched: (a: Application) => void;
  onRemove: (id: string) => void;
}) {
  const [title, setTitle] = useState(app.jobTitle);
  const [company, setCompany] = useState(app.company);
  const [notes, setNotes] = useState(app.notes ?? "");
  const [status, setStatus] = useState(app.status);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openJd, setOpenJd] = useState(false);
  const [recompiling, setRecompiling] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const dirty = title !== app.jobTitle || company !== app.company || notes !== (app.notes ?? "");

  const patch = async (body: Partial<Application>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.application) onPatched(d.application);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (s: Application["status"]) => {
    setStatus(s);
    patch({ status: s });
  };

  const handleDownload = async () => {
    if (!app.resumePdfUrl) return;
    setDownloadError(null);
    try {
      await downloadFile(app.resumePdfUrl, `resume-${app.id}.pdf`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleRecompile = async () => {
    setRecompiling(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/recompile`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setDownloadError(data.error || "Recompilation failed");
        return;
      }
      if (data.application) {
        onPatched(data.application);
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Recompilation failed");
    } finally {
      setRecompiling(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent)]/50"
          />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-[var(--color-muted)] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent)]/50"
          />
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <SourceBadge source={app.source} />
            <span className="text-[11px] text-[var(--color-faint)]">created {timeAgo(app.createdAt)}</span>
            {app.appliedAt && (
              <span className="text-[11px] text-emerald-300">applied {timeAgo(app.appliedAt)}</span>
            )}
          </div>
        </div>

        <select
          value={status}
          onChange={(e) => changeStatus(e.target.value as Application["status"])}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs font-medium capitalize outline-none focus:border-[var(--color-accent)]/50"
        >
          {TRACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => onRemove(app.id)}
          title="Delete"
          className="rounded-lg p-1.5 text-[var(--color-faint)] transition hover:bg-rose-500/10 hover:text-rose-300"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {app.resumePdfUrl ? (
          <>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:border-[var(--color-accent)]/50"
            >
              <FileText className="size-3.5" /> Download résumé
            </button>
            <button
              onClick={handleRecompile}
              disabled={recompiling}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:border-[var(--color-accent)]/50 disabled:opacity-50"
              title="Recompile the LaTeX and regenerate the PDF"
            >
              {recompiling ? <Spinner className="size-3" /> : <RefreshCw className="size-3.5" />}
              Recompile
            </button>
          </>
        ) : (
          <button
            onClick={handleRecompile}
            disabled={recompiling}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-300 hover:border-amber-500/60 disabled:opacity-50"
            title="Generate the LaTeX resume PDF"
          >
            {recompiling ? <Spinner className="size-3" /> : <RefreshCw className="size-3.5" />}
            Compile résumé
          </button>
        )}
        {app.jobDescription && (
          <button
            onClick={() => setOpenJd((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:border-[var(--color-accent)]/50"
          >
            <ClipboardList className="size-3.5" /> Job description
            <ChevronDown className={`size-3 transition ${openJd ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {downloadError && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <span className="shrink-0">⚠️</span>
          <span>{downloadError}</span>
        </div>
      )}

      {openJd && app.jobDescription && (
        <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs whitespace-pre-wrap text-[var(--color-muted)]">
          {app.jobDescription}
        </div>
      )}

      {!!app.keywords?.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {app.keywords.slice(0, 24).map((k) => (
            <span key={k} className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
              {k}
            </span>
          ))}
        </div>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes (recruiter name, referral, next step, salary discussed…)"
        className="mt-3 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
      />

      <div className="mt-2 flex justify-end">
        <button
          onClick={() => patch({ jobTitle: title, company, notes })}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:border-[var(--color-accent)]/50"
        >
          {saving ? <Spinner className="size-3.5" /> : saved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
          {saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
