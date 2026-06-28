import "server-only";
import type { ApplyType, Profile } from "../types";

/** Options the dispatcher hands each adapter. */
export interface ApplyOptions {
  profile: Profile;
  /** Absolute path to the tailored résumé PDF (for file upload). */
  resumePath: string;
  coverNote: string;
  applyType: ApplyType;
  applyUrl: string;
  /** false → dry-run: fill the form + screenshot, but DO NOT submit. */
  live: boolean;
  /**
   * When true, run a VISIBLE browser (headed + slowMo) and keep the window open
   * after filling so the user can watch and take over by hand. Manual/interactive
   * flows only — the unattended cron stays headless.
   */
  supervised?: boolean;
}

export interface ApplyResult {
  /** true only when a real submission went through. */
  submitted: boolean;
  /** Adapter used, e.g. "greenhouse", or "dry-run:greenhouse". */
  method: string;
  confirmation?: string;
  screenshotUrl?: string;
  error?: string;
  appliedAt: string;
}

/**
 * Minimal structural types for the slice of the Playwright API the adapters
 * use. Declaring them locally keeps `playwright` an optional runtime dependency
 * (dynamic-imported in the dispatcher) so the project type-checks and builds
 * even on a host where the browser package isn't installed yet.
 */
export interface PwLocator {
  fill(value: string): Promise<void>;
  click(opts?: Record<string, unknown>): Promise<void>;
  setInputFiles(files: string): Promise<void>;
  selectOption(value: string | { label?: string; value?: string }): Promise<unknown>;
  count(): Promise<number>;
  first(): PwLocator;
  isVisible(): Promise<boolean>;
  textContent(): Promise<string | null>;
  check(): Promise<void>;
  press(key: string): Promise<void>;
}

export interface PwPage {
  goto(url: string, opts?: Record<string, unknown>): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string, opts?: Record<string, unknown>): Promise<void>;
  locator(selector: string): PwLocator;
  getByLabel(text: string | RegExp, opts?: Record<string, unknown>): PwLocator;
  getByRole(role: string, opts?: Record<string, unknown>): PwLocator;
  setInputFiles(selector: string, files: string): Promise<void>;
  waitForSelector(selector: string, opts?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForLoadState(state?: string, opts?: Record<string, unknown>): Promise<void>;
  /** Resolves when the page emits the named event (we use "close" to detect the
   *  user closing the supervised window). Rejects on timeout. */
  waitForEvent(event: "close", opts?: { timeout?: number }): Promise<unknown>;
  isClosed(): boolean;
  screenshot(opts: { path: string; fullPage?: boolean }): Promise<unknown>;
  url(): string;
  content(): Promise<string>;
  title(): Promise<string>;
  evaluate<R>(fn: () => R): Promise<R>;
}

export interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
  /** Resolves with the new page when a popup/new tab opens (e.g. an Apply link
   *  with target=_blank). Rejects/times out if none appears. */
  waitForEvent(event: "page", opts?: { timeout?: number }): Promise<PwPage>;
}

export interface PwBrowser {
  newContext(opts?: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
}

/** Signature every board adapter implements. */
export type Adapter = (
  page: PwPage,
  opts: ApplyOptions,
) => Promise<{ submitted: boolean; confirmation?: string }>;
