# Archived

This file previously contained an overstated scraper status report **and real
secrets in plaintext** (a Trigger.dev key and Firebase config). Both have been
removed.

- The authoritative project state now lives in **[`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)**.
- The legacy root `src/lib/scrapers/*` referenced here are retired in favour of the
  live scrapers in `web/lib/scrapers/`.

> **Action required:** the `TRIGGER_SECRET_KEY` and `FIREBASE_API_KEY` that were
> committed here in plaintext must be **rotated** in the Trigger.dev and Firebase
> consoles. All secrets belong in `.env.local` (git-ignored), never in tracked files.
