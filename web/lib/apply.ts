import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ApplyType, Job, TailoredResume } from "./types";
import { getBoardCredentials } from "./secrets";
import { detectApplyType } from "./jd";
import { ADAPTERS } from "./apply/adapters";
import {
  tryClick,
  tryFill,
  jitter,
  launchOpts,
  contextOpts,
  showHandoffBanner,
  lingerForHandoff,
} from "./apply/helpers";
import type { ApplyOptions, ApplyResult, PwBrowser, PwContext, PwPage } from "./apply/types";

export type { ApplyOptions, ApplyResult } from "./apply/types";

const SHOTS_DIR = path.join(process.cwd(), ".runtime", "screenshots");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Dynamically load Playwright so it stays an optional runtime dependency. */
async function loadChromium(): Promise<{
  launch: (opts?: Record<string, unknown>) => Promise<PwBrowser>;
} | null> {
  try {
    const mod = (await import("playwright")) as unknown as {
      chromium: { launch: (opts?: Record<string, unknown>) => Promise<PwBrowser> };
    };
    return mod.chromium;
  } catch {
    return null;
  }
}

/** Log into a board that requires authentication before applying. */
async function loginIfNeeded(page: PwPage, applyType: string): Promise<void> {
  const creds = getBoardCredentials(applyType);
  if (!creds) return;

  if (applyType === "linkedin") {
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    await tryFill(page, ["#username"], creds.username);
    await tryFill(page, ["#password"], creds.password);
    await tryClick(page, ['button[type="submit"]']);
    await page.waitForTimeout(3000);
  } else if (applyType === "indeed") {
    await page.goto("https://secure.indeed.com/auth", { waitUntil: "domcontentloaded" });
    await tryFill(page, ['input[type="email"]', "#ifl-InputFormField-3"], creds.username);
    await tryClick(page, ['button:has-text("Continue")', 'button[type="submit"]']);
    await page.waitForTimeout(2000);
    await tryFill(page, ['input[type="password"]'], creds.password);
    await tryClick(page, ['button[type="submit"]']);
    await page.waitForTimeout(3000);
  }
}

/**
 * From an aggregator/listing page, find and follow the "Apply" link to the real
 * application form. The link commonly opens a new tab (target=_blank) or
 * redirects in place; handle both. Returns the page now showing the form and
 * its URL, or null when no apply link is found.
 */
async function followApplyLink(
  context: PwContext,
  page: PwPage,
): Promise<{ page: PwPage; url: string } | null> {
  const selectors = [
    'a[href*="boards.greenhouse.io" i]',
    'a[href*="job-boards.greenhouse.io" i]',
    'a[href*="jobs.lever.co" i]',
    'a[href*="myworkdayjobs.com" i]',
    'a:has-text("Apply now")',
    'a:has-text("Apply for this job")',
    'a:has-text("Apply")',
    'a[href*="/apply" i]',
    'a[href*="apply" i]',
    'button:has-text("Apply now")',
    'button:has-text("Apply")',
  ];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0 || !(await loc.isVisible())) continue;

      // Start listening for a popup BEFORE clicking, then click. If a new tab
      // opens we use it; otherwise we assume same-tab navigation.
      const popupPromise = context.waitForEvent("page", { timeout: 6000 }).catch(() => null);
      await loc.click().catch(() => {});
      const popup = await popupPromise;

      if (popup) {
        await popup.waitForLoadState("domcontentloaded").catch(() => {});
        await popup.waitForTimeout(1500);
        return { page: popup, url: popup.url() };
      }

      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(2000);
      return { page, url: page.url() };
    } catch {
      /* try the next selector */
    }
  }
  return null;
}

/**
 * Real application submission (R5).
 *
 * Launches a headless browser, logs into the board if credentials exist, fills
 * the application form from the saved answers, attaches the per-job résumé PDF,
 * captures a screenshot, and — only when `opts.live` is true — submits.
 *
 * Safe by default: with `live=false` it's a dry-run (fills + screenshots, no
 * submit). If Playwright isn't installed on the host it returns a clear,
 * non-throwing error result so the batch keeps going.
 */
export async function submitApplication(
  job: Job,
  _tailored: TailoredResume,
  opts: ApplyOptions,
): Promise<ApplyResult> {
  const appliedAt = new Date().toISOString();
  const methodBase = opts.applyType ?? "unknown";

  if (!opts.applyUrl) {
    return { submitted: false, method: `error:${methodBase}`, error: "No apply URL on the job.", appliedAt };
  }

  const chromium = await loadChromium();
  if (!chromium) {
    return {
      submitted: false,
      method: `unavailable:${methodBase}`,
      error: "Playwright not installed on host — run `npm i playwright && npx playwright install chromium`.",
      appliedAt,
    };
  }

  if (opts.signal?.aborted) {
    return { submitted: false, method: `stopped:${methodBase}`, error: "Stopped before apply.", appliedAt };
  }

  const supervised = !!opts.supervised;
  let browser: PwBrowser | null = null;
  try {
    browser = await chromium.launch(launchOpts(supervised));
    const context: PwContext = await browser.newContext(
      contextOpts(supervised, UA, { width: 1280, height: 1800 }),
    );
    const page = await context.newPage();

    await loginIfNeeded(page, methodBase);

    await page.goto(opts.applyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await jitter(800, 1600);

    // Aggregator listing pages ("external"/"unknown") almost never host the
    // form themselves — follow their "Apply" link to the real ATS, then
    // re-detect which adapter can actually submit it.
    let activePage: PwPage = page;
    let effectiveType: ApplyType = opts.applyType ?? "unknown";
    let effectiveOpts: ApplyOptions = opts;

    if (effectiveType === "external" || effectiveType === "unknown") {
      const dest = await followApplyLink(context, page);
      if (dest && dest.url && dest.url !== opts.applyUrl) {
        activePage = dest.page;
        const destType = detectApplyType(dest.url);
        effectiveType = destType;
        effectiveOpts = { ...opts, applyType: destType, applyUrl: dest.url };
        await jitter(800, 1600);
      }
    }

    const adapter = ADAPTERS[effectiveType] ?? ADAPTERS.unknown;
    const { submitted, confirmation } = await adapter(activePage, { ...effectiveOpts, supervised });

    const screenshotUrl = await capture(activePage, job.id);

    // Supervised: keep the visible window open so the user can review, fix, or
    // submit by hand. Blocks until they close the window (or a safety timeout).
    if (supervised) {
      await showHandoffBanner(activePage);
      await lingerForHandoff(activePage, undefined, opts.signal);
    }

    try {
      await context.close();
    } catch {
      /* user may have already closed the window */
    }

    const method = opts.live ? effectiveType : `dry-run:${effectiveType}`;
    return {
      submitted: opts.live && submitted,
      method,
      confirmation: opts.live ? confirmation : undefined,
      screenshotUrl,
      appliedAt,
    };
  } catch (err) {
    return {
      submitted: false,
      method: `error:${methodBase}`,
      error: (err as Error).message,
      appliedAt,
    };
  } finally {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
  }
}

/** Screenshot the final form state for proof + debugging. */
async function capture(page: PwPage, jobId: string): Promise<string | undefined> {
  try {
    await mkdir(SHOTS_DIR, { recursive: true });
    const name = `${jobId}-${Date.now().toString(36)}.png`;
    await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true });
    return `/api/files/screenshots/${name}`;
  } catch {
    return undefined;
  }
}
