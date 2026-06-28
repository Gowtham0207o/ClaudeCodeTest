"use client";

import { useState } from "react";
import { Wand2, FileText, AlertCircle, Sparkles, Download, CheckCircle2 } from "lucide-react";
import { Panel, Spinner } from "@/components/ui";
import { downloadFile } from "@/lib/utils";

interface Result {
  pdfUrl: string;
  compiledWith: string;
  keywords: string[];
  addedKeywords: string[];
  mode: "deep" | "skills-only";
  applicationId: string;
}

export default function TailorPage() {
  const [jd, setJd] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jd, jobTitle: title, company }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to tailor résumé.");
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result?.pdfUrl) return;
    setDownloading(true);
    try {
      await downloadFile(result.pdfUrl, `resume-${result.applicationId}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tailor Résumé</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Paste a job description. We pull its keywords and weave the ones your résumé is
          missing into your skills line, then compile a job-specific PDF from your LaTeX template.
        </p>
      </div>

      <Panel title="Job description">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Job title (optional)"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
          />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company (optional)"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
          />
        </div>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={12}
          placeholder="Paste the full job description here…"
          className="mt-3 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={generate}
            disabled={loading || jd.trim().length < 30}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-5 py-2.5 text-sm font-semibold text-white glow-accent disabled:opacity-60"
          >
            {loading ? <Spinner /> : <Wand2 className="size-4" />}
            {loading ? "Tailoring…" : "Generate tailored résumé"}
          </button>
          <span className="text-xs text-[var(--color-faint)]">{jd.trim().length} chars</span>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </Panel>

      {result && (
        <Panel title="Tailored résumé">
          <div className="flex flex-wrap items-center gap-3">
            {result.pdfUrl ? (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white glow-accent disabled:opacity-60"
              >
                {downloading ? <Spinner className="size-4" /> : <Download className="size-4" />}
                {downloading ? "Downloading…" : "Download PDF"}
              </button>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>Keywords were selected but the PDF compiler isn’t available (stub). The LaTeX was still generated.</span>
              </div>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-faint)]">
              <FileText className="size-3.5" /> compiled with {result.compiledWith}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-violet)]/15 px-2 py-0.5 text-[11px] text-[var(--color-violet)]">
              {result.mode === "deep" ? "Woven across all sections" : "Skills line only"}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span>
              Saved as a manual application you can track.{" "}
              <a href="/manual" className="font-semibold underline underline-offset-2">
                Open Manual Applications →
              </a>
            </span>
          </div>

          {result.mode === "deep" && (
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Your real experience was reframed in this job’s language across Skills, Experience and Projects —
              kept truthful (same companies, roles, dates). Review it before sending.
            </p>
          )}

          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
              <Sparkles className="size-3.5" />{" "}
              {result.mode === "deep" ? "Keywords woven in" : "Added to your “Others” skills"} ({result.addedKeywords.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.addedKeywords.length ? (
                result.addedKeywords.map((k) => (
                  <span key={k} className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                    {k}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[var(--color-muted)]">
                  Your résumé already covers every keyword found in this JD.
                </span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--color-faint)]">
              All keywords detected in the JD ({result.keywords.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.keywords.map((k) => (
                <span key={k} className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
