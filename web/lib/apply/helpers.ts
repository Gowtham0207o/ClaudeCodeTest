import "server-only";
import type { ApplyOptions, PwLocator, PwPage } from "./types";

/** Random human-like pause to avoid obvious bot cadence. */
export function jitter(minMs = 250, maxMs = 900): Promise<void> {
  const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Chromium launch options. Supervised → a VISIBLE, maximized window the user can
 * watch and grab control of; `slowMo` paces the automated steps so they're
 * followable by eye. Otherwise headless (the unattended/cron path).
 */
export function launchOpts(supervised: boolean): Record<string, unknown> {
  return supervised
    ? { headless: false, slowMo: 220, args: ["--start-maximized"] }
    : { headless: true };
}

/** newContext options that pair with launchOpts (full-window viewport when
 *  supervised so the maximized window isn't letterboxed). */
export function contextOpts(
  supervised: boolean,
  ua: string,
  headlessViewport: { width: number; height: number },
): Record<string, unknown> {
  return supervised
    ? { userAgent: ua, viewport: null }
    : { userAgent: ua, viewport: headlessViewport };
}

/** Drop a non-intrusive banner into the live page so the user understands they
 *  can review, take over, or submit by hand — then close the window when done.
 *  Best-effort: silently ignored if the page has navigated/closed. */
export async function showHandoffBanner(page: PwPage): Promise<void> {
  try {
    if (page.isClosed()) return;
    await page.evaluate(() => {
      const id = "__jobsync_handoff_banner";
      if (document.getElementById(id)) return;
      const bar = document.createElement("div");
      bar.id = id;
      bar.textContent =
        "JobSync filled this form for you — review it, take over if anything's wrong, then submit. Close this window when you're done.";
      Object.assign(bar.style, {
        position: "fixed", top: "0", left: "0", right: "0", zIndex: "2147483647",
        background: "#0b1220", color: "#fff",
        font: "600 13px system-ui, -apple-system, sans-serif",
        padding: "10px 16px", textAlign: "center",
        borderBottom: "2px solid #6366f1", boxShadow: "0 2px 14px rgba(0,0,0,.45)",
      });
      document.body.appendChild(bar);
    });
  } catch {
    /* page may have navigated away; the banner is purely informational */
  }
}

/**
 * Supervised hold: keep the visible window open so the user can intervene and
 * finish the application by hand. Resolves as soon as they close the window,
 * after `maxMs` as a safety cap, or immediately if `signal` aborts (user hit
 * “Stop”) — so the request can never hang forever.
 */
export async function lingerForHandoff(
  page: PwPage,
  maxMs = 8 * 60_000,
  signal?: AbortSignal,
): Promise<void> {
  try {
    if (page.isClosed() || signal?.aborted) return;
    const closed = page.waitForEvent("close", { timeout: maxMs });
    if (!signal) {
      await closed;
      return;
    }
    await Promise.race([
      closed,
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })),
    ]);
  } catch {
    /* timed out — the user left the window open; we close it ourselves */
  }
}

/** Try a list of selectors; fill the first one that exists & is visible. */
export async function tryFill(page: PwPage, selectors: string[], value: string): Promise<boolean> {
  if (!value) return false;
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.fill(value);
        await jitter(120, 400);
        return true;
      }
    } catch {
      /* try the next selector */
    }
  }
  return false;
}

/** Try a list of selectors; click the first that exists & is visible. */
export async function tryClick(page: PwPage, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.click();
        await jitter();
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

/** Attach the résumé to the first file input we can find. */
export async function attachResume(page: PwPage, resumePath: string): Promise<boolean> {
  if (!resumePath || !resumePath.endsWith(".pdf")) return false;
  const fileSelectors = [
    'input[type="file"][name*="resume" i]',
    'input[type="file"][id*="resume" i]',
    'input[type="file"]',
  ];
  for (const sel of fileSelectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        await loc.setInputFiles(resumePath);
        await jitter(400, 1000);
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

/**
 * Best-effort fill of the fields nearly every application form shares:
 * name, email, phone, links, cover note. Adapter-specific code handles the
 * board's quirks; this covers the common 80%.
 */
export async function fillCommonFields(page: PwPage, opts: ApplyOptions): Promise<void> {
  const { profile, coverNote } = opts;
  const a = profile.applyAnswers;
  const [first, ...rest] = profile.fullName.split(" ");
  const last = rest.join(" ");

  await tryFill(page, ['input[name="first_name"]', 'input[id*="first" i]', 'input[autocomplete="given-name"]'], first);
  await tryFill(page, ['input[name="last_name"]', 'input[id*="last" i]', 'input[autocomplete="family-name"]'], last);
  await tryFill(page, ['input[name="name"]', 'input[id="full_name"]', 'input[autocomplete="name"]'], profile.fullName);
  await tryFill(page, ['input[type="email"]', 'input[name="email"]', 'input[id*="email" i]'], profile.email);
  await tryFill(page, ['input[type="tel"]', 'input[name*="phone" i]', 'input[id*="phone" i]'], a.phone);
  await tryFill(page, ['input[name*="location" i]', 'input[id*="location" i]', 'input[name*="city" i]'], a.currentLocation);
  await tryFill(page, ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'], a.linkedinUrl);
  await tryFill(page, ['input[name*="github" i]', 'input[id*="github" i]'], a.githubUrl);
  await tryFill(page, ['input[name*="website" i]', 'input[name*="portfolio" i]', 'input[id*="website" i]'], a.portfolioUrl || a.websiteUrl);
  await tryFill(page, ['textarea[name*="cover" i]', 'textarea[id*="cover" i]', 'textarea[name*="summary" i]', 'textarea'], coverNote || a.coverLetterDefault);

  await attachResume(page, opts.resumePath);
}

/** Heuristic to find and (only when live) click a submit button. */
export async function clickSubmit(page: PwPage): Promise<boolean> {
  return tryClick(page, [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit application")',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Send application")',
  ]);
}

/** A locator that resolves true if it exists at all (for confirmation checks). */
export async function exists(loc: PwLocator): Promise<boolean> {
  try {
    return (await loc.count()) > 0;
  } catch {
    return false;
  }
}
