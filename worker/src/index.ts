/**
 * Yesletter proxy Worker.
 *
 * Holds the Gemini API key server-side so the frontend doesn't ship it.
 * Each request:
 *   1. Validates Cloudflare Turnstile token (anti-bot)
 *   2. Checks per-IP daily quota in KV (anti-abuse)
 *   3. Forwards the prompt to Gemini, streams response back
 *
 * Frontend posts to POST /api/extract
 *   body: {
 *     turnstile_token: string,
 *     model: string,           // optional, validated against allow-list
 *     messages: ChatMessage[]  // OpenAI-compatible shape
 *   }
 */

import { verifyTurnstile } from "./turnstile";
import { checkAndIncrementQuota } from "./rateLimit";
import { callGemini } from "./gemini";

export interface Env {
  GEMINI_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  GEMINI_MODEL: string;
  DAILY_LIMIT: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT?: KVNamespace;
}

const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
]);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin") ?? "";
    const corsHeaders = buildCorsHeaders(origin, env.ALLOWED_ORIGINS);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);
    if (url.pathname !== "/api/extract" || req.method !== "POST") {
      return jsonError(404, "not found", corsHeaders);
    }

    let body: ExtractRequest;
    try {
      body = (await req.json()) as ExtractRequest;
    } catch {
      return jsonError(400, "invalid json body", corsHeaders);
    }
    if (!body.turnstile_token || !Array.isArray(body.messages)) {
      return jsonError(400, "missing turnstile_token or messages", corsHeaders);
    }

    const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
    const ok = await verifyTurnstile(
      body.turnstile_token,
      env.TURNSTILE_SECRET_KEY,
      ip,
    );
    if (!ok) {
      return jsonError(403, "turnstile verification failed", corsHeaders);
    }

    const limit = parseInt(env.DAILY_LIMIT ?? "0", 10);
    if (limit > 0 && env.RATE_LIMIT) {
      const allowed = await checkAndIncrementQuota(env.RATE_LIMIT, ip, limit);
      if (!allowed) {
        return jsonError(
          429,
          `每日请求次数上限 ${limit} 次已用完，请明天再试`,
          corsHeaders,
        );
      }
    }

    const model =
      body.model && ALLOWED_MODELS.has(body.model)
        ? body.model
        : env.GEMINI_MODEL;

    try {
      const result = await callGemini(env.GEMINI_API_KEY, model, body.messages);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(502, `gemini upstream failed: ${message}`, corsHeaders);
    }
  },
};

interface ExtractRequest {
  turnstile_token: string;
  model?: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: unknown;
  }>;
}

function buildCorsHeaders(
  origin: string,
  allowed: string,
): Record<string, string> {
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin =
    list.includes("*") || list.includes(origin) ? origin || "*" : list[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonError(
  status: number,
  message: string,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
