"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Check, UploadCloud, Sparkles, AlertCircle } from "lucide-react";
import { Panel, Spinner } from "@/components/ui";
import type { Profile } from "@/lib/types";

interface ParseResult {
  extractedFields: string[];
  usedAI: boolean;
}

export default function ResumePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onUpload = async (file: File) => {
    setUploading(true);
    setParseResult(null);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/resume/parse", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Failed to parse resume.");
        return;
      }
      setProfile(data.profile);
      setParseResult({ extractedFields: data.extractedFields, usedAI: data.usedAI });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setProfile(d.profile));
  }, []);

  const update = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    setProfile((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="grid h-60 place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resume & Profile</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            The source resume the engine tailors for every job.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white glow-accent disabled:opacity-60"
        >
          {saving ? <Spinner /> : saved ? <Check className="size-4" /> : <Save className="size-4" />}
          {saved ? "Saved" : "Save profile"}
        </button>
      </div>

      <Panel title="Upload resume">
        <p className="-mt-2 mb-3 text-xs text-[var(--color-muted)]">
          Drop in a PDF, DOCX, or TXT. We extract your title, skills, experience and
          location, then use them to scrape matching jobs — no more hard-coded search.
        </p>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onUpload(f);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-8 text-center transition hover:border-[var(--color-accent)]/50"
        >
          {uploading ? (
            <>
              <Spinner className="size-5" />
              <span className="text-sm text-[var(--color-muted)]">Reading your resume…</span>
            </>
          ) : (
            <>
              <UploadCloud className="size-6 text-[var(--color-accent-bright)]" />
              <span className="text-sm font-medium">Click to upload or drag & drop</span>
              <span className="text-xs text-[var(--color-faint)]">PDF, DOCX, or TXT · max 8 MB</span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
        </label>

        {parseResult && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Updated <strong>{parseResult.extractedFields.join(", ") || "no fields"}</strong>{" "}
              {parseResult.usedAI
                ? "with GPT extraction."
                : "(heuristic — set OPENAI_API_KEY for sharper extraction)."}{" "}
              Review below and save.
            </span>
          </div>
        )}
        {uploadError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Identity">
          <div className="space-y-3">
            <Field label="Full name" value={profile.fullName} onChange={(v) => update("fullName", v)} />
            <Field label="Title" value={profile.title} onChange={(v) => update("title", v)} />
            <Field label="Email" value={profile.email} onChange={(v) => update("email", v)} />
            <Field label="Location" value={profile.location} onChange={(v) => update("location", v)} />
            <div>
              <label className="text-xs font-medium text-[var(--color-faint)]">Years of experience</label>
              <input
                type="number"
                value={profile.yearsExperience}
                onChange={(e) => update("yearsExperience", Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
              />
            </div>
          </div>
        </Panel>

        <Panel title="Summary & skills">
          <label className="text-xs font-medium text-[var(--color-faint)]">Professional summary</label>
          <textarea
            value={profile.summary}
            onChange={(e) => update("summary", e.target.value)}
            rows={5}
            className="mt-1 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
          />
          <label className="mt-3 block text-xs font-medium text-[var(--color-faint)]">
            Skills (comma-separated)
          </label>
          <textarea
            value={profile.skills.join(", ")}
            onChange={(e) =>
              update(
                "skills",
                e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              )
            }
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.skills.map((s) => (
              <span key={s} className="rounded-md bg-[var(--color-accent)]/15 px-2 py-0.5 text-[11px] text-[var(--color-accent-bright)]">
                {s}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Experience">
        <div className="space-y-4">
          {profile.experience.map((role, i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{role.role}</p>
                <span className="text-xs text-[var(--color-faint)]">{role.period}</span>
              </div>
              <p className="text-xs text-[var(--color-muted)]">{role.company}</p>
              <ul className="mt-2 space-y-1">
                {role.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2 text-xs text-[var(--color-text)]">
                    <span className="mt-1 size-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--color-faint)]">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
      />
    </div>
  );
}
