import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Profile } from "../types";
import type { ParsedForm } from "../ats/greenhouse";
import type { PwBrowser, PwPage } from "./types";
import { launchOpts, contextOpts, showHandoffBanner, lingerForHandoff } from "./helpers";

/**
 * Greenhouse "apply by URL" engine. Fills the application form field-by-field
 * from the user's reviewed answers, attaches the tailored résumé, and — only
 * when `live` — clicks Submit. Dry-run fills + screenshots without submitting,
 * so the user can verify everything before a real submission goes out.
 */

const SHOTS_DIR = path.join(process.cwd(), ".runtime", "screenshots");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface GreenhouseFillInput {
  url: string;
  form: ParsedForm;
  profile: Profile;
  /** Reviewed answers keyed by field.key. For selects, the option *label*. */
  answers: Record<string, string>;
  resumePath: string;
  coverNote: string;
  live: boolean;
  /** Run a visible browser and keep it open for manual takeover (default true
   *  for the interactive Apply-by-Link flow). */
  supervised?: boolean;
}

export interface GreenhouseFillResult {
  submitted: boolean;
  method: string;
  confirmation?: string;
  screenshotUrl?: string;
  error?: string;
  /** Required fields we couldn't fill (so the UI can flag them). */
  unfilledRequired: string[];
  /** The country actually selected in the phone widget (verification). */
  phoneCountry?: string;
  appliedAt: string;
}

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

const idSel = (id: string) => `[id="${id.replace(/"/g, '\\"')}"]`;

/** Greenhouse serializes field names with underscores but sometimes renders the
 *  DOM id with hyphens (e.g. candidate_location → candidate-location). Try both. */
function idVariants(key: string): string[] {
  const v = [key];
  if (key.includes("_")) v.push(key.replace(/_/g, "-"));
  return v;
}

/** First DOM element matching any id variant of `key`, or null. */
async function locByKey(page: PwPage, key: string) {
  for (const id of idVariants(key)) {
    const loc = page.locator(idSel(id)).first();
    if ((await loc.count()) > 0) return loc;
  }
  return null;
}

async function fillText(page: PwPage, key: string, value: string): Promise<boolean> {
  try {
    const loc = await locByKey(page, key);
    if (!loc) return false;
    await loc.fill(value);
    return true;
  } catch {
    return false;
  }
}

/** React-Select combobox: open, type to filter, click the matching option. */
async function selectOption(page: PwPage, key: string, label: string): Promise<boolean> {
  try {
    const input = await locByKey(page, key);
    if (!input) return false;
    await input.click();
    await page.waitForTimeout(250);
    await input.fill(label);
    await page.waitForTimeout(500);
    // Prefer an exact-ish option from the open listbox.
    const opt = page.getByRole("option", { name: label }).first();
    if ((await opt.count()) > 0) {
      await opt.click();
      return true;
    }
    // Fall back to choosing the top filtered option.
    await input.press("Enter");
    return true;
  } catch {
    return false;
  }
}

/** Location autocomplete: fill, then commit a suggestion (free text alone often
 *  doesn't register a value in Greenhouse's place picker). */
async function fillLocation(page: PwPage, key: string, value: string): Promise<boolean> {
  try {
    const loc = await locByKey(page, key);
    if (!loc) return false;
    await loc.click();
    await loc.fill(value);
    await page.waitForTimeout(900);
    const opt = page.getByRole("option").first();
    if ((await opt.count()) > 0) {
      await opt.click();
      return true;
    }
    await loc.press("Enter");
    return true;
  } catch {
    return false;
  }
}

/** Phone widgets carry a separate country/dial-code React-Select (#country).
 *  Open it, filter by country name, and pick the match so the code shows e.g. +91. */
async function selectCountry(page: PwPage, name: string): Promise<boolean> {
  try {
    const input = await locByKey(page, "country");
    if (!input) return false;
    await input.click();
    await page.waitForTimeout(500);
    await input.fill(name);
    await page.waitForTimeout(800);
    // Match the country as a WHOLE WORD so "India" doesn't accidentally select
    // "British Indian Ocean Territory" / "Indonesia" (substring matches that
    // sort earlier in the filtered list).
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exact = page.getByRole("option", { name: new RegExp(`\\b${escaped}\\b`, "i") }).first();
    if ((await exact.count()) > 0) {
      await exact.click();
      return true;
    }
    const loose = page.getByRole("option", { name }).first();
    if ((await loose.count()) > 0) {
      await loose.click();
      return true;
    }
    await input.press("Enter");
    return true;
  } catch {
    return false;
  }
}

async function attachFile(page: PwPage, key: string, filePath: string): Promise<boolean> {
  try {
    const loc = await locByKey(page, key);
    if (!loc) return false;
    await loc.setInputFiles(filePath);
    await page.waitForTimeout(800);
    return true;
  } catch {
    return false;
  }
}

async function clickFirst(page: PwPage, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.click();
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

async function detectConfirmation(page: PwPage): Promise<string | undefined> {
  await page.waitForTimeout(2000);
  try {
    const body = (await page.content()).toLowerCase();
    if (
      body.includes("thank you for applying") ||
      body.includes("application submitted") ||
      body.includes("your application has been submitted") ||
      body.includes("we received your application") ||
      body.includes("successfully")
    ) {
      return `GH-${Date.now().toString(36).toUpperCase()}`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

async function capture(page: PwPage, tag: string): Promise<string | undefined> {
  try {
    await mkdir(SHOTS_DIR, { recursive: true });
    const safe = tag.replace(/[^a-z0-9]+/gi, "-").slice(0, 30) || "apply";
    const name = `gh-${safe}-${Date.now().toString(36)}.png`;
    await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true });
    return `/api/files/screenshots/${name}`;
  } catch {
    return undefined;
  }
}

export async function fillGreenhouse(
  input: GreenhouseFillInput,
): Promise<GreenhouseFillResult> {
  const appliedAt = new Date().toISOString();
  const unfilledRequired: string[] = [];

  const chromium = await loadChromium();
  if (!chromium) {
    return {
      submitted: false,
      method: "unavailable:greenhouse",
      error: "Playwright not installed — run `npm i playwright && npx playwright install chromium`.",
      unfilledRequired,
      appliedAt,
    };
  }

  const supervised = input.supervised !== false;
  let browser: PwBrowser | null = null;
  try {
    browser = await chromium.launch(launchOpts(supervised));
    const context = await browser.newContext(
      contextOpts(supervised, UA, { width: 1280, height: 2400 }),
    );
    const page = await context.newPage();
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1500);

    for (const f of input.form.fields) {
      let ok = false;
      // Résumé/cover "type it in" textareas are satisfied by the uploaded PDF.
      if (/^(resume|cover_letter)_text$/.test(f.key)) {
        ok = true;
      } else if (f.type === "file") {
        // Only the résumé upload is auto-handled; cover-letter file is optional.
        if (/resume|cv/i.test(f.key) && input.resumePath?.endsWith(".pdf")) {
          ok = await attachFile(page, f.key, input.resumePath);
        } else {
          ok = true; // optional file, nothing to do
        }
      } else {
        const val = input.answers[f.key];
        if (val && val.trim()) {
          if (f.type === "select" || f.type === "multiselect") {
            ok = await selectOption(page, f.key, val);
          } else if (/location/i.test(f.key) || /location|city/i.test(f.label)) {
            ok = await fillLocation(page, f.key, val);
          } else {
            ok = await fillText(page, f.key, val);
          }
        }
      }
      if (!ok && f.required) unfilledRequired.push(f.label || f.key);
    }

    // Set the phone's country/dial-code picker (separate from the phone text).
    // Derive from a +91 phone → India, else the last token of the location.
    const phone = input.profile.applyAnswers.phone ?? "";
    const country = /^\+?\s*91\b/.test(phone)
      ? "India"
      : input.profile.applyAnswers.currentLocation.split(",").pop()?.trim() || "India";
    await selectCountry(page, country);

    // Read back what the phone country picker ended up showing (verification).
    const phoneCountry = await page
      .evaluate(() => {
        const el = document.querySelector("#country");
        const control =
          el?.closest(".select__control") ?? el?.closest('[class*="control"]');
        const sv = control?.querySelector('[class*="single-value"]');
        return (sv?.textContent ?? "").trim();
      })
      .catch(() => "");

    const preShot = await capture(page, `${input.form.title}-filled`);

    let submitted = false;
    let confirmation: string | undefined;
    let screenshotUrl = preShot;

    if (input.live) {
      const clicked = await clickFirst(page, [
        'button:has-text("Submit application")',
        'button:has-text("Submit Application")',
        'button[type="submit"]',
        'button:has-text("Submit")',
      ]);
      if (clicked) {
        confirmation = await detectConfirmation(page);
        submitted = !!confirmation;
      }
      screenshotUrl = (await capture(page, `${input.form.title}-result`)) ?? preShot;
    }

    // Supervised: hold the visible window open so the user can review the filled
    // form, fix anything, and submit by hand — then close it to finish.
    if (supervised) {
      await showHandoffBanner(page);
      await lingerForHandoff(page);
    }

    try {
      await context.close();
    } catch {
      /* user may have already closed the window */
    }
    return {
      submitted: input.live && submitted,
      method: input.live ? "greenhouse" : "dry-run:greenhouse",
      confirmation,
      screenshotUrl,
      unfilledRequired,
      phoneCountry,
      appliedAt,
    };
  } catch (err) {
    return {
      submitted: false,
      method: "error:greenhouse",
      error: (err as Error).message,
      unfilledRequired,
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
