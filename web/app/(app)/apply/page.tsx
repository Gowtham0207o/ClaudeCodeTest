"use client";

import { useState } from "react";
import { downloadFile } from "@/lib/utils";
import {
  Link2,
  Search,
  Send,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { Panel, Spinner } from "@/components/ui";

type FieldType = "text" | "textarea" | "select" | "multiselect" | "file";
interface Field {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: { value: string; label: string }[];
  suggested: string;
  auto: boolean;
}
interface Inspect {
  ats: string;
  url: string;
  company: string;
  title: string;
  fields: Field[];
}
interface ApplyResult {
  submitted: boolean;
  method: string;
  confirmation?: string;
  screenshotUrl?: string;
  resumePdfUrl?: string;
  applicationId: string;
  unfilledRequired: string[];
  error?: string;
}

export default function ApplyPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [live, setLive] = useState(false);
  const [supervised, setSupervised] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setInspect(null);
    setResult(null);
    try {
      const res = await fetch("/api/apply-url/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load the application form.");
        return;
      }
      setInspect(data);
      const init: Record<string, string> = {};
      for (const f of data.fields as Field[]) if (!f.auto) init[f.key] = f.suggested ?? "";
      setAnswers(init);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!inspect) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/apply-url/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inspect.url, answers, live, supervised }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to apply.");
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!result?.resumePdfUrl) return;
    setDownloading(true);
    try {
      await downloadFile(result.resumePdfUrl, `resume-${result.applicationId}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const set = (k: string, v: string) => setAnswers((a) => ({ ...a, [k]: v }));
  const visibleFields = inspect?.fields.filter((f) => !f.auto) ?? [];
  const missingRequired = visibleFields.filter((f) => f.required && !(answers[f.key] ?? "").trim());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apply by Link</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Paste a job link. We read the application form, tailor your résumé, and fill it —
          you answer the screening questions, then apply. (Greenhouse links supported.)
        </p>
      </div>

      <Panel title="Job link">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-faint)]" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url && load()}
              placeholder="https://job-boards.greenhouse.io/company/jobs/123456"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-accent)]/50"
            />
          </div>
          <button
            onClick={load}
            disabled={!url || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white glow-accent disabled:opacity-60"
          >
            {loading ? <Spinner /> : <Search className="size-4" />}
            Load form
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </Panel>

      {inspect && (
        <>
          <Panel title={`${inspect.title} — ${inspect.company}`}>
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-accent-bright)]">
              <Sparkles className="size-3.5 shrink-0" />
              <span>
                {visibleFields.length} questions detected. Answers are pre-filled from your profile —
                review the screening questions, then apply. Your tailored résumé is attached automatically.
              </span>
            </div>

            <div className="space-y-4">
              {visibleFields.map((f) => (
                <div key={f.key}>
                  <label className="flex items-center gap-1 text-xs font-medium text-[var(--color-faint)]">
                    {f.label || f.key}
                    {f.required && <span className="text-rose-400">*</span>}
                  </label>

                  {f.type === "select" || f.type === "multiselect" ? (
                    <select
                      value={answers[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
                    >
                      <option value="">— Select —</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.label}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      value={answers[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      rows={4}
                      className="mt-1 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
                    />
                  ) : (
                    <input
                      value={answers[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
                    />
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Submit">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <input
                type="checkbox"
                checked={supervised}
                onChange={(e) => setSupervised(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-violet)]"
              />
              <span className="text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-[var(--color-text)]">
                  <Eye className="size-3.5 text-[var(--color-violet)]" />
                  {supervised ? "Supervised — open a visible browser and do it in front of me" : "Headless — fill in the background (no window)"}
                </span>
                <span className="mt-0.5 block text-[var(--color-muted)]">
                  {supervised
                    ? "A real Chromium window opens on this PC and fills the form while you watch. Take over anytime, then close the window when you're done."
                    : "Runs invisibly — faster, but you can't watch or step in if it gets stuck."}
                </span>
              </span>
            </label>

            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => setLive(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span className="text-xs">
                <span className="font-semibold text-[var(--color-text)]">
                  {live ? "LIVE — actually submit this application" : "Dry-run — fill only (no auto-submit)"}
                </span>
                <span className="mt-0.5 block text-[var(--color-muted)]">
                  {live
                    ? "The engine clicks Submit for you. Review the answers above first."
                    : supervised
                      ? "We fill the form; you review it in the window and click Submit yourself."
                      : "We fill the form and screenshot it so you can verify before sending for real."}
                </span>
              </span>
            </label>

            {missingRequired.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {missingRequired.length} required question{missingRequired.length > 1 ? "s" : ""} still blank:{" "}
                  {missingRequired.map((f) => f.label || f.key).join(", ")}
                </span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-5 py-2.5 text-sm font-semibold text-white glow-accent disabled:opacity-60"
            >
              {submitting ? <Spinner /> : supervised ? <Eye className="size-4" /> : live ? <Send className="size-4" /> : <ShieldCheck className="size-4" />}
              {submitting
                ? supervised
                  ? "Browser open — finish in the window…"
                  : live
                    ? "Applying…"
                    : "Filling…"
                : supervised
                  ? live
                    ? "Open browser & apply"
                    : "Open browser & fill"
                  : live
                    ? "Apply now"
                    : "Dry-run fill"}
            </button>
            {submitting && supervised && (
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                A Chromium window should have opened. Review/finish there, then close it — this page updates when you do.
              </p>
            )}
          </Panel>
        </>
      )}

      {result && (
        <Panel title="Result">
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              result.error
                ? "bg-rose-500/10 text-rose-300"
                : result.submitted
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-sky-500/10 text-sky-300"
            }`}
          >
            {result.error ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {result.error
                ? result.error
                : result.submitted
                  ? `Application submitted via ${result.method}${result.confirmation ? ` (ref ${result.confirmation})` : ""}.`
                  : `Form filled (${result.method}). No submission sent — flip to LIVE and apply when the screenshot looks right.`}
            </span>
          </div>

          {result.unfilledRequired?.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>Couldn’t fill: {result.unfilledRequired.join(", ")} — answer these and re-run.</span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {result.screenshotUrl && (
              <a
                href={result.screenshotUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:border-[var(--color-accent)]/50"
              >
                <ImageIcon className="size-3.5" /> View filled form
              </a>
            )}
            {result.resumePdfUrl && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:border-[var(--color-accent)]/50 disabled:opacity-50"
              >
                <FileText className="size-3.5" /> Download tailored résumé
              </button>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
