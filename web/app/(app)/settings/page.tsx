"use client";

import { useEffect, useState } from "react";
import { Save, Check, Bot } from "lucide-react";
import { Panel, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setProfile(d.profile));
  }, []);

  const prefs = profile?.preferences;
  const setPrefs = (patch: Partial<Profile["preferences"]>) =>
    setProfile((p) => (p ? { ...p, preferences: { ...p.preferences, ...patch } } : p));
  const setAnswers = (patch: Partial<Profile["applyAnswers"]>) =>
    setProfile((p) => (p ? { ...p, applyAnswers: { ...p.applyAnswers, ...patch } } : p));
  const setAuto = (patch: Partial<Profile["automation"]>) =>
    setProfile((p) => (p ? { ...p, automation: { ...p.automation, ...patch } } : p));

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: profile.preferences,
          applyAnswers: profile.applyAnswers,
          automation: profile.automation,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!profile || !prefs) {
    return (
      <div className="grid h-60 place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const a = profile.applyAnswers;
  const auto = profile.automation;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automation</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Tune the rules the autonomous engine applies on your behalf.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white glow-accent disabled:opacity-60"
        >
          {saving ? <Spinner /> : saved ? <Check className="size-4" /> : <Save className="size-4" />}
          {saved ? "Saved" : "Save rules"}
        </button>
      </div>

      <Panel title="Auto-apply threshold">
        <p className="text-xs text-[var(--color-muted)]">
          Jobs scoring at or above this confidence are applied to automatically. Below it (down to 50%)
          they wait in the review queue.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <input
            type="range"
            min={50}
            max={95}
            value={prefs.minConfidence}
            onChange={(e) => setPrefs({ minConfidence: Number(e.target.value) })}
            className="flex-1 accent-[var(--color-accent)]"
          />
          <span className="w-16 rounded-lg bg-[var(--color-surface-2)] py-1.5 text-center text-lg font-semibold tabular-nums text-[var(--color-accent-bright)]">
            {prefs.minConfidence}%
          </span>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Location preferences">
          <Toggle
            label="Remote only"
            desc="Skip on-site roles entirely."
            value={prefs.remoteOnly}
            onChange={(v) => setPrefs({ remoteOnly: v })}
          />
          <label className="mt-4 block text-xs font-medium text-[var(--color-faint)]">
            Preferred locations (comma-separated)
          </label>
          <input
            value={prefs.locations.join(", ")}
            onChange={(e) =>
              setPrefs({ locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
            }
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
          />
        </Panel>

        <Panel title="Engine">
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <div className="grid size-9 place-items-center rounded-lg bg-[var(--color-violet)]/15">
              <Bot className="size-5 text-[var(--color-violet)]" />
            </div>
            <div>
              <p className="text-sm font-medium">Resume tailoring</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                Powered by OpenAI GPT when <code className="text-[var(--color-accent-bright)]">OPENAI_API_KEY</code> is set —
                otherwise a deterministic fallback keeps the pipeline running. Tailored résumés compile to PDF via Tectonic
                using <code className="text-[var(--color-accent-bright)]">web/resume/template.tex</code> (drop in your own).
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {/* Apply answers — reused to auto-fill every application form (R5/D5). */}
      <Panel title="Apply answers (used to auto-fill every form)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Phone" value={a.phone} onChange={(v) => setAnswers({ phone: v })} />
          <Field label="Current location" value={a.currentLocation} onChange={(v) => setAnswers({ currentLocation: v })} />
          <Field label="Expected salary" value={a.expectedSalary} onChange={(v) => setAnswers({ expectedSalary: v })} />
          <Field label="Notice period (days)" value={String(a.noticePeriodDays)} onChange={(v) => setAnswers({ noticePeriodDays: Number(v) || 0 })} />
          <Field label="LinkedIn URL" value={a.linkedinUrl} onChange={(v) => setAnswers({ linkedinUrl: v })} />
          <Field label="GitHub URL" value={a.githubUrl} onChange={(v) => setAnswers({ githubUrl: v })} />
          <Field label="Portfolio URL" value={a.portfolioUrl} onChange={(v) => setAnswers({ portfolioUrl: v })} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Toggle label="Authorized to work" desc="In your target market." value={a.workAuthorized} onChange={(v) => setAnswers({ workAuthorized: v })} />
          <Toggle label="Needs sponsorship" desc="Requires visa sponsorship." value={a.needsSponsorship} onChange={(v) => setAnswers({ needsSponsorship: v })} />
          <Toggle label="Willing to relocate" desc="Open to relocation." value={a.willingToRelocate} onChange={(v) => setAnswers({ willingToRelocate: v })} />
        </div>
        <label className="mt-4 block text-xs font-medium text-[var(--color-faint)]">Default cover note</label>
        <textarea
          value={a.coverLetterDefault}
          onChange={(e) => setAnswers({ coverLetterDefault: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
        />
      </Panel>

      {/* Autonomy config (R6). */}
      <Panel title="Autonomous run">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Daily quota" value={String(auto.dailyQuota)} onChange={(v) => setAuto({ dailyQuota: Number(v) || 0 })} />
          <Field label="Max per source" value={String(auto.maxPerSource)} onChange={(v) => setAuto({ maxPerSource: Number(v) || 0 })} />
          <Field label="Concurrency" value={String(auto.concurrency)} onChange={(v) => setAuto({ concurrency: Number(v) || 1 })} />
          <Field label="Throttle min (ms)" value={String(auto.throttleMinMs)} onChange={(v) => setAuto({ throttleMinMs: Number(v) || 0 })} />
        </div>
        <div className="mt-4">
          <Toggle
            label="Live submissions"
            desc="OFF = dry-run (fill + screenshot, never submit). Also toggleable from the Automation page."
            value={auto.live}
            onChange={(v) => setAuto({ live: v })}
          />
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-faint)]">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]/50"
      />
    </div>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[var(--color-muted)]">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-7 w-12 rounded-full transition-colors",
          value ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-strong)]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-5 rounded-full bg-white transition-all",
            value ? "left-6" : "left-1",
          )}
        />
      </button>
    </div>
  );
}
