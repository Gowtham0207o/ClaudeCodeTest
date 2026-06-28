import "server-only";
import * as cheerio from "cheerio";

/**
 * Greenhouse job-board parser.
 *
 * `job-boards.greenhouse.io` is a Remix app that server-renders the full
 * application form AND serializes the form definition (every question, its
 * type, required flag, and dropdown options) into the page HTML. We parse that
 * definition directly — no browser needed to *inspect* the form — so the user
 * can answer the screening ("robot") questions before we fill + submit.
 */

export type FieldType = "text" | "textarea" | "select" | "multiselect" | "file";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormField {
  /** DOM id / field key, e.g. "first_name", "question_67281497", "29638". */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Present for select/multiselect. */
  options?: FieldOption[];
}

export interface ParsedForm {
  ats: "greenhouse";
  url: string;
  company: string;
  title: string;
  descriptionText: string;
  fields: FormField[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function isGreenhouseUrl(url: string): boolean {
  return /(?:job-boards|boards)\.greenhouse\.io/i.test(url);
}

/** Match the balanced `[...]` starting at `start` (which must point at `[`). */
function matchBracket(s: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

const TYPE_MAP: Record<string, FieldType> = {
  input_text: "text",
  textarea: "textarea",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
  input_file: "file",
};

interface GroupAField {
  name?: string;
  type?: string;
  values?: { value: string | number; label: string }[];
}
interface GroupAItem {
  required?: boolean;
  label?: string;
  fields?: GroupAField[];
}
interface GroupBItem {
  id?: number;
  name?: string;
  required?: boolean;
  answer_type?: { key?: string };
  answer_options?: { id: number; name: string }[];
}

/** Pull every `"questions":[ ... ]` array out of the serialized page data. */
function extractQuestionGroups(htmlText: string): unknown[][] {
  const groups: unknown[][] = [];
  const re = /"questions":\[/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(htmlText))) {
    const open = m.index + m[0].length - 1; // index of '['
    const arr = matchBracket(htmlText, open);
    if (!arr) continue;
    try {
      groups.push(JSON.parse(arr) as unknown[]);
    } catch {
      /* skip a group that doesn't cleanly parse */
    }
  }
  return groups;
}

/** Parse a fetched Greenhouse page into a structured, answerable form. */
export function parseGreenhouseHtml(htmlText: string, url: string): ParsedForm {
  const $ = cheerio.load(htmlText);

  // Title + company (best-effort).
  const rawTitle =
    $("h1.app-title").first().text().trim() ||
    $("h1").first().text().trim() ||
    ($('meta[property="og:title"]').attr("content") ?? "").trim() ||
    $("title").text().trim();
  const title = rawTitle.replace(/\s+at\s+.*$/i, "").trim() || rawTitle;
  const slug = url.match(/greenhouse\.io\/([^/]+)/i)?.[1] ?? "";
  const company =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Unknown";

  // Description text for tailoring (strip chrome).
  $("script, style, noscript, nav, header, footer, svg").remove();
  const descriptionText = (
    $('[class*="job__description" i]').first().text() ||
    $('[class*="description" i]').first().text() ||
    $("main").first().text() ||
    $("body").text()
  )
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 8000);

  // The form definition (questions + options) lives in the serialized data.
  const textareaIds = new Set(
    [...htmlText.matchAll(/<textarea[^>]*\bid="([^"]+)"/g)].map((m) => m[1]),
  );
  const groups = extractQuestionGroups(htmlText);
  const fields: FormField[] = [];
  const seen = new Set<string>();

  // Group A — main application fields + custom questions.
  for (const item of (groups[0] as GroupAItem[] | undefined) ?? []) {
    const label = (item.label ?? "").trim();
    const required = !!item.required;
    for (const f of item.fields ?? []) {
      if (!f.name || seen.has(f.name)) continue;
      let type = TYPE_MAP[f.type ?? ""] ?? "text";
      if (textareaIds.has(f.name)) type = "textarea";
      const options =
        f.values?.map((v) => ({ value: String(v.value), label: v.label })) ??
        undefined;
      seen.add(f.name);
      fields.push({ key: f.name, label, type, required, options });
    }
  }

  // Group B — EEO / demographic questions (different schema).
  for (const item of (groups[1] as GroupBItem[] | undefined) ?? []) {
    const key = String(item.id ?? "");
    if (!key || seen.has(key)) continue;
    const type: FieldType =
      item.answer_type?.key === "MULTI_SELECT" ? "multiselect" : "select";
    const options = (item.answer_options ?? []).map((o) => ({
      value: String(o.id),
      label: o.name,
    }));
    seen.add(key);
    fields.push({ key, label: (item.name ?? "").trim(), type, required: !!item.required, options });
  }

  return { ats: "greenhouse", url, company, title, descriptionText, fields };
}

/** Fetch a Greenhouse job URL and parse its application form. */
export async function fetchGreenhouseForm(url: string): Promise<ParsedForm> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Greenhouse page returned HTTP ${res.status}.`);
    const htmlText = await res.text();
    const form = parseGreenhouseHtml(htmlText, url);
    if (!form.fields.length) {
      throw new Error("Could not find an application form on that page.");
    }
    return form;
  } finally {
    clearTimeout(t);
  }
}
