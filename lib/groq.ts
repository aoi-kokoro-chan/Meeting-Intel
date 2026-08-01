import Groq from "groq-sdk";

const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

// Distinct failure classes — callers pick recovery strategy and user copy.
// too_large: request exceeds per-request/TPM token budget (Groq 413 / 400-size)
// rate_limited: 429 request-rate limit
// outage: 5xx or network/timeout
// malformed: model replied but output was unusable JSON
export type LLMErrorCode = "too_large" | "rate_limited" | "outage" | "malformed" | "unknown";

// Thrown when every attempt (retry + fallback model) failed. Routes catch
// this and degrade to a memory-only response instead of a blank failure.
export class LLMUnavailableError extends Error {
  code: LLMErrorCode;
  constructor(message = "LLM unavailable after retries", code: LLMErrorCode = "unknown") {
    super(message);
    this.name = "LLMUnavailableError";
    this.code = code;
  }
}

export function classifyLLMError(err: unknown): LLMErrorCode {
  const status = (err as GroqError)?.status;
  const msg = String((err as Error)?.message ?? "");
  if (status === 413) return "too_large";
  if (status === 400 && /token|context|length|too large|maximum|payload/i.test(msg)) return "too_large";
  if (status === 429) return "rate_limited";
  if (typeof status === "number" && status >= 500) return "outage";
  if ((err as Error)?.name === "AbortError" || /timed? ?out|network|fetch failed|ECONN/i.test(msg)) return "outage";
  return "unknown";
}

function getClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new LLMUnavailableError("GROQ_API_KEY not set");
  return new Groq({ apiKey });
}

type GroqError = { status?: number; message?: string; error?: { error?: { code?: string } } };

function isRetryable(err: unknown): boolean {
  const status = (err as GroqError)?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

function isDecommissioned(err: unknown): boolean {
  const e = err as GroqError;
  const code = e?.error?.error?.code ?? "";
  const msg = e?.message ?? "";
  return code === "model_decommissioned" || /decommission/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function complete(system: string, user: string, model: string): Promise<string> {
  const groq = getClient();
  const res = await groq.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function askLLM(system: string, user: string): Promise<string> {
  try {
    return await complete(system, user, PRIMARY_MODEL);
  } catch (err) {
    const code = classifyLLMError(err);
    // Oversized requests never succeed on retry — surface immediately so the
    // caller can chunk the input instead.
    if (code === "too_large") {
      console.error(`[groq] request too large: ${String((err as Error)?.message ?? "").slice(0, 200)}`);
      throw new LLMUnavailableError(String((err as Error)?.message ?? err), "too_large");
    }
    if (isDecommissioned(err)) {
      // Primary model gone: go straight to fallback.
    } else if (isRetryable(err)) {
      await sleep(2000);
      try {
        return await complete(system, user, PRIMARY_MODEL);
      } catch (e2) {
        if (classifyLLMError(e2) === "too_large") {
          throw new LLMUnavailableError(String((e2 as Error)?.message ?? e2), "too_large");
        }
        // fall through to fallback model
      }
    } else {
      throw new LLMUnavailableError(String((err as Error)?.message ?? err), code);
    }
    try {
      return await complete(system, user, FALLBACK_MODEL);
    } catch (err2) {
      const c2 = classifyLLMError(err2);
      console.error(`[groq] all attempts failed (${c2}): ${String((err2 as Error)?.message ?? "").slice(0, 200)}`);
      throw new LLMUnavailableError(String((err2 as Error)?.message ?? err2), c2 === "unknown" ? code : c2);
    }
  }
}

function stripFences(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  // Some models prepend prose — grab from the first { or [ to the last } or ]
  const first = t.search(/[[{]/);
  if (first > 0) {
    const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (lastBrace > first) t = t.slice(first, lastBrace + 1);
  }
  return t;
}

export async function askLLMJson<T = unknown>(system: string, user: string): Promise<T> {
  const jsonSystem = `${system}\n\nRespond with ONLY a single valid JSON object. No prose, no markdown, no code fences.`;
  const raw = await askLLM(jsonSystem, user);
  try {
    return JSON.parse(stripFences(raw)) as T;
  } catch {
    const retry = await askLLM(
      jsonSystem,
      `${user}\n\nYour previous reply was not valid JSON. Reply again with ONLY the valid JSON object.`
    );
    try {
      return JSON.parse(stripFences(retry)) as T;
    } catch {
      console.error("[groq] unparseable JSON after retry");
      throw new LLMUnavailableError("LLM returned unparseable JSON twice", "malformed");
    }
  }
}
