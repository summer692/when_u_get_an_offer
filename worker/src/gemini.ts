/**
 * Upstream LLM call. Talks to whatever OpenAI-compatible endpoint the
 * Worker is configured for via env.LLM_BASE_URL. Defaults to gptsapi.net
 * (a Hong Kong-based reseller that proxies Gemini and accepts CNY
 * payment) — switch to Google's official endpoint by setting
 * LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
 * in wrangler.toml.
 *
 * Hardening on top of a plain fetch:
 *   - 30s timeout via AbortController (Workers don't enforce one)
 *   - Up to 3 attempts with exponential backoff + jitter on transient
 *     upstream errors (408/429/5xx/520+ Cloudflare codes)
 *   - Captures Cloudflare debug headers (cf-ray, cf-error-type) into
 *     the thrown Error so logs / responses can pinpoint which CF zone
 *     blew up — critical when the chain is CF Worker → CF (gptsapi.net)
 *     → Gemini and a 520 could come from either edge.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: unknown;
}

const RETRYABLE_STATUS = new Set([
  408, 429, 500, 502, 503, 504,
  // Cloudflare-origin extension codes
  520, 521, 522, 523, 524, 525, 526, 527,
]);

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const payload = JSON.stringify({ model, messages });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "yesletter-api/1.0",
        },
        body: payload,
      });

      const cfRay = res.headers.get("cf-ray") ?? "-";
      const cfErr = res.headers.get("cf-error-type") ?? "-";

      if (res.ok) {
        return (await res.json()) as ChatResponse;
      }

      const body = (await res.text()).slice(0, 500);
      lastError = new Error(
        `LLM ${res.status} (cf-ray=${cfRay} cf-error=${cfErr}): ${body}`,
      );

      // Non-retryable client errors (400, 401, 403, 422 etc) bail out
      // immediately — the user's prompt or our config is wrong.
      if (!RETRYABLE_STATUS.has(res.status)) {
        throw lastError;
      }
    } catch (err) {
      // AbortError on timeout, network error, or thrown lastError above.
      lastError =
        err instanceof Error ? err : new Error(String(err));
      // If this was the abort fired by our own timer, normalize the
      // message so logs don't say "AbortError: …" generically.
      if (
        lastError.name === "AbortError" ||
        /aborted/i.test(lastError.message)
      ) {
        lastError = new Error(`LLM upstream timeout after ${REQUEST_TIMEOUT_MS}ms`);
      }
    } finally {
      clearTimeout(timer);
    }

    // Exponential backoff with jitter: ~300ms, ~600ms, ~1200ms (+ rand)
    if (attempt < MAX_ATTEMPTS - 1) {
      const backoff = 300 * 2 ** attempt + Math.random() * 300;
      await sleep(backoff);
    }
  }

  throw lastError ?? new Error("LLM call failed after retries");
}
