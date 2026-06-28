import "server-only";
import OpenAI from "openai";

/**
 * Shared OpenAI/GPT client for the structured-output calls the product makes
 * (résumé tailoring and résumé extraction). Uses Structured Outputs
 * (response_format json_schema, strict) so the model returns schema-valid JSON.
 *
 * Configure with:
 *   OPENAI_API_KEY — required to enable AI (otherwise callers use a fallback)
 *   OPENAI_MODEL   — optional, defaults to gpt-4o
 */

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function openaiModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o";
}

interface GenerateJsonOptions {
  user: string;
  system?: string;
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
  /** Override the model for this call (e.g. a cheaper one for light tasks). */
  model?: string;
}

/** Run a single structured-output completion and parse the JSON result. */
export async function generateJson<T>(opts: GenerateJsonOptions): Promise<T> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: opts.model ?? openaiModel(),
    max_tokens: opts.maxTokens ?? 2000,
    messages: [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      { role: "user" as const, content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
    },
  });

  const content = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content) as T;
}
