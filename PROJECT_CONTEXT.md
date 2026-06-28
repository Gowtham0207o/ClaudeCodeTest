# JobSync — Project Context & Master Plan

> **Single source of truth** for what this product is, what's actually built today,
> and what's left to build. Read this first in any new session before touching code.
> Last updated: 2026-06-21.

---

## 1. The Vision (the SaaS idea)

An autonomous **job-application engine**. The user defines their skills, role, and
experience once; the system then runs end-to-end every day:

1. **Scrape** job openings continuously (the user's priority: LinkedIn & Indeed),
   filtered to their skill set / role / experience, and store them in a DB.
2. **Match** each job against the user's profile with a model and keep everything
   scoring **> 60%**.
3. **Tailor** the résumé per job: pull the keywords out of the JD, inject them into
   the user's **LaTeX résumé**, and produce a job-specific PDF.
4. **Apply** automatically — fill the application form with details the user
   provided up front and submit.
5. **Volume:** at least **50 applications per day**, hands-off.

Everything below is measured against that target.

---

## 2. Target user flow → requirement IDs

| ID | Requirement | Priority |
|----|-------------|----------|
| **R1** | Scrape job openings (user wants LinkedIn + Indeed first) into a DB | Must |
| **R2** | Filter/store by the user's skills, role, and experience | Must |
| **R3** | Score each job vs. profile; keep matches **≥ 60%** | Must |
| **R4** | Extract JD keywords and inject them into the user's **LaTeX résumé** → per-job PDF | Must |
| **R5** | Auto-fill the application form from pre-saved answers and **submit** | Must |
| **R6** | Sustain **≥ 50 applications/day** autonomously | Must |
| **R7** | Track every application + schedule follow-ups | Should |
| **R8** | Dashboard to review the queue, matches, and outcomes | Should |

---

## 3. Current state (honest snapshot)

There are **two separate codebases** in this repo. They overlap and need to be
consolidated (see §8, Decision D1).

### 3a. `web/` — the real product (Next.js, App Router) ⭐

This is the more advanced implementation and where the vision actually lives. It
implements a full vertical slice: **scrape → match → tailor → apply → track**.

**Pipeline** (`web/lib/pipeline.ts`) runs one job through all five stages and
streams NDJSON events to the UI (`/pipeline` page via `POST /api/pipeline/run`).

| Stage | File | Real or stub? |
|-------|------|---------------|
| Scrape | `web/lib/scrape.ts`, `web/lib/scrapers/*` | **Real** — live free APIs |
| Match | `web/lib/match.ts` | **Real** — deterministic weighted score |
| Tailor | `web/lib/tailor.ts` | **Real** — Claude Opus 4.8 (JSON, *not* LaTeX) |
| Apply | `web/lib/apply.ts` | **⚠️ SIMULATED** — fake confirmation, no real submit |
| Track | `web/lib/pipeline.ts` + Firestore | **Real** — saves application + follow-up |

**Live scrape sources** (all free, ToS-friendly JSON APIs — *not* LinkedIn/Indeed):
`remoteok`, `remotive`, `arbeitnow`, `jobicy`, `themuse`
(`web/lib/scrapers/index.ts`). Runs all in parallel, applies remote/location
preference, dedupes by `externalId` then `title|company`.

**Match logic** (`web/lib/match.ts`) — deterministic weighted score, 0–100:

| Dimension | Weight |
|-----------|--------|
| Skill overlap | 0.50 |
| Role / title relevance | 0.20 |
| Experience fit | 0.18 |
| Location / remote fit | 0.12 |

Verdict: `confidence ≥ minConfidence` → **auto-apply**; `≥ 50` → **review**; else
**skip**. `minConfidence` default is **65** (`web/lib/profile.ts`), satisfying the
"> 60%" rule (R3). This is the gate that decides whether the pipeline tailors +
applies or skips.

**Tailor** (`web/lib/tailor.ts`) — calls **Claude Opus 4.8**
(`model: "claude-opus-4-8"`) with a JSON-schema response, returns
`{ headline, summary, highlightedBullets, coverNote, emphasizedSkills, rationale }`.
Falls back to a deterministic template if `ANTHROPIC_API_KEY` is unset.
⚠️ **This produces structured text, not a LaTeX document** — R4's LaTeX/keyword
injection is **not** implemented.

**Profile** (`web/lib/profile.ts`) — stored in Firestore at `profile/me`, with a
hard-coded `DEFAULT_PROFILE` for Gowtham Ravi (Full Stack Engineer, Bengaluru, 4y).
Preferences: `remoteOnly`, `minConfidence`, `locations`.

**Résumé ingest** (`web/app/api/resume/parse/route.ts`, `web/lib/resume-extract.ts`)
— upload PDF/DOCX/TXT (≤ 8 MB) → extract text → structure via Claude or heuristic →
merge into profile. Working.

**Pages:** `/dashboard`, `/jobs`, `/applications`, `/resume`, `/pipeline`,
`/settings`.
**API routes:** `jobs`, `applications`, `profile`, `stats`, `seed`, `scrape`,
`resume/parse`, `pipeline/run`.

**Stack:** Next.js (App Router — note `web/AGENTS.md`: this is a *newer* Next.js,
read `node_modules/next/dist/docs/` before coding), Firebase Admin SDK
(`web/lib/firebase-admin.ts`), `@anthropic-ai/sdk`.

### 3b. Root `src/` — legacy Trigger.dev scraper

The original backend. A scheduled Trigger.dev task
(`src/trigger/scrape-daily-jobs.ts`, cron `0 6 * * *`) scrapes 6 sources and writes
to Firestore via the **client** SDK (`src/lib/firebase.ts`).

Scrapers: `angellist`, `remoteok`, `indeed`, `glassdoor`, `linkedin`, `instahyre`.
**Reality:** only RemoteOK is genuinely live. Indeed/Glassdoor hit bot detection
(403) and return **demo data**; AngelList/InstaHyre return **demo data**; LinkedIn
just **logs documentation** and returns `[]` (`src/lib/scrapers/linkedin.ts`).
The celebratory status in `ALL_SOURCES_WORKING.md` / `FIXES_APPLIED.md` overstates
this — most "working" sources are fallback mock data.

A static dashboard (`public/index.html` + `server.js`) reads Firestore directly.

---

## 4. Architecture (target)

```
                 ┌──────────────────────────────────────────────┐
   Scheduler  →  │  SCRAPE   live APIs → normalize → dedupe       │ → Firestore `jobs`
  (cron/Trigger) └──────────────────────────────────────────────┘
                                   │
                 ┌─────────────────▼────────────────────────────┐
                 │  MATCH    weighted score vs. profile (≥60%)   │
                 └─────────────────┬────────────────────────────┘
                          skip ◄───┤ verdict
                                   │ auto-apply / review
                 ┌─────────────────▼────────────────────────────┐
                 │  TAILOR   JD keywords → LaTeX résumé → PDF     │  ← (R4: not built)
                 └─────────────────┬────────────────────────────┘
                                   │
                 ┌─────────────────▼────────────────────────────┐
                 │  APPLY    headless form-fill + submit         │  ← (R5: simulated)
                 │           OR partner/apply API                │
                 └─────────────────┬────────────────────────────┘
                                   │
                 ┌─────────────────▼────────────────────────────┐
                 │  TRACK    Application doc + follow-up          │ → Firestore `applications`
                 └──────────────────────────────────────────────┘
```

### Data model (`web/lib/types.ts`)
- **`Job`** — `title, company, location?, requiredExperience?, requiredSkills?[], jobUrl?, source, externalId?` → Firestore `jobs`.
- **`Profile`** — `fullName, title, email, location, yearsExperience, skills[], summary, experience[], preferences{ remoteOnly, minConfidence, locations[] }` → Firestore `profile/me`.
- **`MatchResult`** — `confidence, matchedSkills[], missingSkills[], breakdown[], verdict`.
- **`TailoredResume`** — `headline, summary, highlightedBullets[], coverNote, emphasizedSkills[], rationale`.
- **`Application`** — `jobId, jobTitle, company, source, status, confidence, match?, tailored?, appliedAt?, createdAt, followUps[]` → Firestore `applications`.

---

## 5. Gap analysis — vision vs. reality

| Req | What's built | Status |
|-----|--------------|--------|
| R1 scrape | 5 live free APIs in `web/`; LinkedIn/Indeed via Playwright apply adapters (submit, not scrape) | 🟢 Done (LinkedIn/Indeed are apply targets, not scrape sources) |
| R2 filter by profile | `buildQuery()` from profile; match filters | 🟢 Done |
| R3 ≥60% match | `match.ts`, threshold default 65 | 🟢 Done |
| R4 LaTeX + JD keywords | `jd.ts` fetches JD + keywords → `tailor.ts` curates `injectedKeywords` → `latex.ts` injects + compiles per-job PDF (Tectonic, hosted fallback, stub) | 🟢 Built (needs Tectonic on host for real PDFs) |
| R5 auto-fill & submit | `apply.ts` real Playwright engine + per-board adapters (`apply/adapters.ts`), encrypted creds (`secrets.ts`), screenshots, dry-run kill-switch | 🟢 Built (needs `playwright` + browsers + board creds on host) |
| R6 ≥50/day | `batch.ts` quota/per-source/concurrency loop + `runlog.ts`; `/api/cron/daily-batch`; Trigger.dev `daily-apply` cron | 🟢 Built |
| R7 track + follow-up | Application saved, follow-up scheduled +4 days | 🟢 Done |
| R8 dashboard | + `/automation` control center (live log, kill-switch, Run now); settings has apply-answers + autonomy config | 🟢 Done |

**All three hard pieces (R4 LaTeX, R5 real submit, R6 volume) are now implemented.**
Remaining work is *host provisioning + tuning*, not missing code: install Tectonic +
Playwright browsers on the long-running Node host, set `CRON_SECRET` / board creds /
`ANTHROPIC_API_KEY`, and harden the brittle LinkedIn/Indeed adapter selectors against
real postings. Safe by default — `automation.live=false` (dry-run) until flipped. See §6.

---

## 6. ⚠️ Legal & compliance reality (read before building R5/R6)

This is a real SaaS, so this section is not optional.

- **LinkedIn & Indeed prohibit automated scraping and automated applications** in
  their Terms of Service. LinkedIn in particular actively detects and bans
  automation and has litigated over it. Bulk auto-apply bots get **user accounts
  banned** and expose the SaaS operator to liability. This is precisely why `web/`
  quietly pivoted to free, ToS-friendly APIs and away from LinkedIn/Indeed.
- **"50 fully-autonomous applications/day to LinkedIn/Indeed"** is the single
  riskiest part of the vision. Recommended compliant alternatives:
  - **Human-in-the-loop / assisted apply:** the system tailors the résumé and
    *pre-fills* the form; the user reviews and clicks submit. Keeps most of the time
    savings without violating automation clauses.
  - **Boards with official apply APIs / partner programs** (and ATSs like
    Greenhouse/Lever/Workday) — submit through sanctioned channels.
  - **Aggregator APIs** whose terms permit programmatic use.
  - Restrict *fully autonomous* submission to sources whose ToS allow it.
- **Operational hygiene if any browser automation is used:** respect `robots.txt`
  and rate limits, throttle realistically, never store the user's third-party
  passwords in plaintext, and make autonomy opt-in and clearly disclosed.
- **Honesty in the product:** don't promise "auto-apply to LinkedIn" if the
  compliant implementation is "assisted apply." Set that expectation early.

**Security note (do now):** `FIXES_APPLIED.md` and `ALL_SOURCES_WORKING.md` contain
what look like real `TRIGGER_SECRET_KEY` and `FIREBASE_*` values in plaintext.
**Rotate those keys**, move secrets to `.env.local` / a secret manager, ensure
`.env*` is git-ignored, and scrub them from the markdown. Never commit secrets.

---

## 7. Roadmap (phased)

### Phase 0 — Consolidate & clean (foundation)
- [ ] Decide on **one** codebase (recommend `web/`); fold the Trigger.dev scheduler
      into it or keep Trigger.dev *only* as the background scheduler that calls
      `web/lib/scrape.ts`. Retire the duplicate root `src/` scrapers + `public/` dashboard.
- [ ] Rotate leaked secrets; scrub them from tracked markdown; verify `.gitignore`.
- [ ] Archive the celebratory/overstated status docs or replace with this file.

### Phase 1 — Make matching real & profile-driven (R2/R3)
- [ ] Confirm scrape→match→track works against a real profile end-to-end.
- [ ] Consider an LLM-assisted match score alongside the deterministic one for
      better JD↔skill semantic matching (keep deterministic as the explainable gate).

### Phase 2 — LaTeX résumé tailoring (R4) ← biggest missing user ask
- [ ] Store the user's **LaTeX résumé template** with named placeholders/sections.
- [ ] Extract JD keywords (already have matched/missing skills from `match.ts`;
      add JD keyword extraction).
- [ ] Inject keywords into the LaTeX (drive section ordering / skill emphasis /
      bullet selection) — reuse the Claude tailoring output to decide *what* to
      emphasize, then render into LaTeX rather than JSON.
- [ ] Compile LaTeX → PDF (Tectonic, or a LaTeX service/container) per job; store the PDF.

### Phase 3 — Real application submission (R5) ← legally sensitive
- [ ] Implement the `apply.ts` seam for real. Start with the **compliant** path:
      ATS/partner apply APIs and/or assisted (pre-fill + user confirm).
- [ ] Capture the user's standard answers (work auth, notice period, salary, EEO,
      common screening questions) once → reuse across forms.
- [ ] Only if/where ToS permits: headless-browser form fill (Playwright) with
      per-board adapters; otherwise keep human-in-the-loop.

### Phase 4 — Volume & autonomy (R6/R7)
- [ ] Batch pipeline: select top-N matched jobs/day, queue them (Trigger.dev),
      enforce a **daily quota** and per-source rate limits.
- [ ] Dashboard surfaces the day's queue, what was applied, what's held for review.
- [ ] Follow-up automation (already scaffolded in the track stage).

---

## 8. Key decisions & open questions

### ✅ Confirmed with the user (2026-06-21) — driving the current build

The user re-confirmed the full autonomous flow (scrape → store → score → for every
match **>60%**, fetch JD → inject missing skills into a **LaTeX résumé** → compile a
per-job PDF → **apply automatically**, zero manual intervention, ~50/day) and made
these calls:

- **D1 → resolved.** `web/lib` is the single source of truth for all domain logic.
  **Trigger.dev is a thin scheduler**: its daily cron makes one authenticated call to a
  new `web` batch endpoint (`/api/cron/daily-batch`); all scrape/match/tailor/LaTeX/apply
  logic stays in `web/`. Legacy root `src/lib/scrapers/*` retired. The app must run on a
  **long-running Node host** (not Vercel serverless) so Playwright + the LaTeX compiler run
  in-process.
- **D2 → resolved (user's accepted risk).** Real **Playwright browser auto-submit on
  LinkedIn/Indeed/ATS with no human step**. Mitigations: per-source rate limits, human-like
  throttle, encrypted credentials, screenshots, and a global `automation.live` kill-switch
  (dry-run mode) — but **live by default**. The ATS/partner-API adapters are the durable
  path; LinkedIn/Indeed remain ToS-hostile and may ban the account (documented, accepted).
- **D3 → resolved.** User provides their `.tex` at `web/resume/template.tex`; the engine
  fits it (named markers). A default ATS-friendly template ships so the pipeline runs before
  the file arrives.
- **D4 → resolved.** Keep the deterministic weighted score as the explainable gate; let the
  Claude tailor decide *what* to inject. (No separate embedding matcher this pass.)
- **D5 → in progress.** Canonical pre-saved application answers are modelled as
  `Profile.applyAnswers` and captured in `/settings` (work auth, notice, salary, phone,
  links, EEO, common screeners).
- **Scope:** single-user, production-hardened. No auth/multi-tenant/billing this pass.

Build tracked in plan `~/.claude/plans/iridescent-riding-noodle.md`.

---

- **D1 — Two codebases.** Root `src/` (Trigger.dev) vs. `web/` (Next.js) both scrape
  to Firestore and overlap. **Recommendation:** make `web/` the product; use
  Trigger.dev only as the scheduler that invokes `web/` logic. *Decision pending.*
- **D2 — LinkedIn/Indeed.** The user wants these first, but they're ToS-hostile to
  automation. **Recommendation:** assisted-apply for those two; full autonomy only
  on compliant sources. *Decision pending — affects R5/R6 scope.*
- **D3 — LaTeX pipeline.** Need the user's actual `.tex` template and a compile
  toolchain choice (Tectonic vs. hosted). *Blocked on user providing the template.*
- **D4 — "Match model."** Today it's a deterministic weighted score. Is that
  sufficient for R3, or do we want an embedding/LLM semantic matcher? *Open.*
- **D5 — Pre-saved application answers.** What's the canonical set of fields the
  user will pre-fill (work auth, salary, notice, demographics, etc.)? *Need from user.*

---

## 9. File map (where things live)

```
web/                      ← THE PRODUCT (Next.js)
  app/
    (app)/                dashboard, jobs, applications, resume, pipeline, settings
    api/                  jobs, applications, profile, stats, seed, scrape,
                          resume/parse, pipeline/run
  lib/
    pipeline.ts           scrape→match→tailor→apply→track orchestrator (streams NDJSON)
    scrape.ts             scrape + dedupe + persist (progress events)
    scrapers/             remoteok, remotive, arbeitnow, jobicy, themuse (+index/util/types)
    match.ts              deterministic weighted match score + verdict
    tailor.ts             Claude Opus 4.8 résumé tailoring (JSON; NOT LaTeX yet)
    apply.ts              ⚠️ SIMULATED submit — the real-automation seam
    profile.ts            Firestore profile/me + DEFAULT_PROFILE
    resume-extract.ts     PDF/DOCX/TXT → text → structured profile
    types.ts              all domain types
    firebase-admin.ts     Firebase Admin SDK

src/                      ← LEGACY Trigger.dev scraper (consider retiring)
  trigger/scrape-daily-jobs.ts   cron 0 6 * * *
  lib/firebase.ts                client-SDK Firestore helpers
  lib/scrapers/*                 6 sources, mostly demo/fallback data
public/index.html + server.js    legacy static dashboard

Docs: README.md, SETUP.md, FRONTEND_GUIDE.md,
      ALL_SOURCES_WORKING.md / FIXES_APPLIED.md (overstated — verify before trusting),
      PROJECT_CONTEXT.md (this file — the source of truth)
```

---

## 10. Config / environment (reference, no secrets here)

- `web/` needs: `ANTHROPIC_API_KEY` (tailoring + résumé extraction), Firebase Admin
  credentials (`FIREBASE_PROJECT_ID`, service-account email + private key).
- Root `src/` needs: `TRIGGER_SECRET_KEY`, Firebase client config (`FIREBASE_API_KEY`, …).
- Keep all of these in `.env.local` (git-ignored). Rotate anything that was ever
  committed to a tracked file (see §6).
- Firestore collections: `jobs`, `applications`, doc `profile/me`.
