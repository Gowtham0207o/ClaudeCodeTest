// Deprecated. The legacy 6-source scraper task that lived here is retired.
//
// Scraping now happens inside the Next.js app (`web/lib/scrapers/*`, real live
// APIs) and is driven by the thin scheduler in `./daily-apply.ts`, which calls
// the app's /api/cron/daily-batch endpoint. The old `src/lib/scrapers/*`
// (mostly demo data) are no longer wired to any task.
//
// This file intentionally exports no task so Trigger.dev does not register the
// old cron alongside the new one.
export {};
