import "server-only";
import type { ApplyType } from "../types";
import type { Adapter, PwPage } from "./types";
import {
  attachResume,
  clickSubmit,
  fillCommonFields,
  jitter,
  tryClick,
  tryFill,
} from "./helpers";

/** Look for a post-submit confirmation signal; returns a token if found. */
async function detectConfirmation(page: PwPage): Promise<string | undefined> {
  await page.waitForTimeout(1500);
  try {
    const body = (await page.content()).toLowerCase();
    if (
      body.includes("thank you for applying") ||
      body.includes("application submitted") ||
      body.includes("application received") ||
      body.includes("your application has been") ||
      body.includes("successfully applied")
    ) {
      return `OK-${Date.now().toString(36).toUpperCase()}`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Greenhouse-hosted boards (boards.greenhouse.io) — predictable field ids. */
const greenhouse: Adapter = async (page, opts) => {
  const { profile } = opts;
  const [first, ...rest] = profile.fullName.split(" ");
  await tryFill(page, ["#first_name", 'input[name="first_name"]'], first);
  await tryFill(page, ["#last_name", 'input[name="last_name"]'], rest.join(" "));
  await tryFill(page, ["#email", 'input[name="email"]'], profile.email);
  await tryFill(page, ["#phone", 'input[name="phone"]'], profile.applyAnswers.phone);
  await attachResume(page, opts.resumePath);
  await fillCommonFields(page, opts); // sweep up any extra known fields
  if (!opts.live) return { submitted: false };
  await tryClick(page, ["#submit_app", 'button:has-text("Submit Application")', 'button[type="submit"]']);
  return { submitted: true, confirmation: await detectConfirmation(page) };
};

/** Lever-hosted boards (jobs.lever.co). */
const lever: Adapter = async (page, opts) => {
  await tryFill(page, ['input[name="name"]'], opts.profile.fullName);
  await tryFill(page, ['input[name="email"]'], opts.profile.email);
  await tryFill(page, ['input[name="phone"]'], opts.profile.applyAnswers.phone);
  await tryFill(page, ['input[name="urls[LinkedIn]"]'], opts.profile.applyAnswers.linkedinUrl);
  await tryFill(page, ['input[name="urls[GitHub]"]'], opts.profile.applyAnswers.githubUrl);
  await attachResume(page, opts.resumePath);
  await fillCommonFields(page, opts);
  if (!opts.live) return { submitted: false };
  await tryClick(page, ['button:has-text("Submit application")', 'button[type="submit"]']);
  return { submitted: true, confirmation: await detectConfirmation(page) };
};

/** Workday (*.myworkdayjobs.com) — heavy SPA; best-effort, usually needs auth. */
const workday: Adapter = async (page, opts) => {
  await tryClick(page, ['a:has-text("Apply")', 'button:has-text("Apply")']);
  await page.waitForTimeout(1500);
  await tryClick(page, ['button:has-text("Apply Manually")', 'a:has-text("Apply Manually")']);
  await page.waitForTimeout(1500);
  await fillCommonFields(page, opts);
  if (!opts.live) return { submitted: false };
  await tryClick(page, ['button:has-text("Submit")', 'button[data-automation-id="bottom-navigation-next-button"]']);
  return { submitted: true, confirmation: await detectConfirmation(page) };
};

/** LinkedIn Easy Apply — multi-step modal. Brittle by nature; heavily guarded. */
const linkedin: Adapter = async (page, opts) => {
  const opened = await tryClick(page, [
    'button:has-text("Easy Apply")',
    "button.jobs-apply-button",
  ]);
  if (!opened) throw new Error("Easy Apply button not found (job may be external apply).");
  await page.waitForTimeout(1500);
  await fillCommonFields(page, opts);
  // Walk the Next/Review steps until Submit appears (cap the loop).
  for (let step = 0; step < 6; step++) {
    if (!opts.live) {
      // Dry-run: stop at the first step; do not advance/submit.
      return { submitted: false };
    }
    const submitted = await tryClick(page, ['button[aria-label="Submit application"]', 'button:has-text("Submit application")']);
    if (submitted) return { submitted: true, confirmation: await detectConfirmation(page) };
    const advanced = await tryClick(page, [
      'button[aria-label="Continue to next step"]',
      'button:has-text("Next")',
      'button:has-text("Review")',
    ]);
    if (!advanced) break;
    await jitter(800, 1600);
  }
  return { submitted: false };
};

/** Indeed apply flow. */
const indeed: Adapter = async (page, opts) => {
  await tryClick(page, ['button:has-text("Apply now")', "#indeedApplyButton", ".indeed-apply-button"]);
  await page.waitForTimeout(2000);
  await fillCommonFields(page, opts);
  if (!opts.live) return { submitted: false };
  for (let step = 0; step < 6; step++) {
    const submitted = await tryClick(page, ['button:has-text("Submit application")', 'button:has-text("Submit your application")']);
    if (submitted) return { submitted: true, confirmation: await detectConfirmation(page) };
    const advanced = await tryClick(page, ['button:has-text("Continue")', 'button:has-text("Next")']);
    if (!advanced) break;
    await jitter(800, 1600);
  }
  return { submitted: false };
};

/** Anything else: fill the common fields and submit if a button exists. */
const generic: Adapter = async (page, opts) => {
  await fillCommonFields(page, opts);
  if (!opts.live) return { submitted: false };
  const clicked = await clickSubmit(page);
  return { submitted: clicked, confirmation: clicked ? await detectConfirmation(page) : undefined };
};

export const ADAPTERS: Record<ApplyType, Adapter> = {
  greenhouse,
  lever,
  workday,
  linkedin,
  indeed,
  external: generic,
  unknown: generic,
};
