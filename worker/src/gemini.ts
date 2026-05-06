/**
 * Gemini API call. Uses the OpenAI-compatible chat completions endpoint
 * exposed by Google AI Studio so the request shape matches what the
 * frontend already builds for the BYOK path.
 *
 * Endpoint:
 *   https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

interface GeminiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  // Pass through any error info verbatim for the frontend to surface.
  error?: unknown;
}

export async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<GeminiResponse> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
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
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as GeminiResponse;
}
