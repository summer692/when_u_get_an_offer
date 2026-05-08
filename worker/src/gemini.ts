/**
 * Upstream LLM call. Talks to whatever OpenAI-compatible endpoint the
 * Worker is configured for via env.LLM_BASE_URL. Defaults to gptsapi.net
 * (a Hong Kong-based reseller that proxies Gemini and accepts CNY
 * payment) — switch to Google's official endpoint by setting
 * LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
 * in wrangler.toml.
 *
 * The endpoint must accept a POST to ${BASE}/chat/completions with the
 * standard OpenAI chat completion request shape.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: unknown;
}

export async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      // Don't enforce response_format here — the system prompt already
      // describes the JSON shape and the frontend's safeJsonParse ladder
      // tolerates minor formatting noise.
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as ChatResponse;
}
