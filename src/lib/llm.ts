import type { ExtractedOffer, Provider } from "./schema";
import type { ParsedInput } from "./parsers";

interface ProviderConfig {
  endpoint: string;
  defaultModel: string;
  /** Optional extra headers (e.g. OpenRouter analytics) */
  extraHeaders?: () => Record<string, string>;
  models: { id: string; label: string; note?: string }[];
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  google: {
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-2.5-flash-lite",
    models: [
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        note: "免费层 / 最便宜",
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        note: "更高质量",
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        note: "高难度 offer",
      },
    ],
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "google/gemini-2.5-flash-lite",
    extraHeaders: () => ({
      "HTTP-Referer": window.location.origin,
      "X-Title": "OfferLens",
    }),
    models: [
      { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      {
        id: "anthropic/claude-haiku-4.5",
        label: "Claude Haiku 4.5",
        note: "结构化抽取最稳",
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        note: "高质量、贵",
      },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
    ],
  },
};

export const DEFAULT_PROVIDER: Provider = "google";
export const DEFAULT_MODEL = PROVIDERS.google.defaultModel;

const SYSTEM_PROMPT = `你是 OfferLens 的信息抽取引擎。用户会给你一份学校录取通知（offer）的原文或图片。
请**仅**输出一个 JSON 对象，遵循下方 schema，不要输出任何其它文字、注释或 markdown 包裹。

Schema:
{
  "school": string,                         // 学校全名
  "program": string,                        // 项目 / 专业名
  "degree": string | null,                  // 例如 "Master", "Bachelor", "PhD"
  "country": string | null,                 // ISO 国家名或常用中/英名
  "language": string | null,                // offer 原文语言（如 "en", "zh", "fr"）
  "key_dates": [
    {
      "type": "accept_deadline" | "deposit_deadline" | "term_start" | "tuition_deadline" | "document_deadline" | "other",
      "date": string,                       // ISO 8601，"YYYY-MM-DD"
      "label": string                       // 中文人类可读标签
    }
  ],
  "fees": {
    "tuition":     { "amount": number, "currency": string, "period": "year"|"term"|"total" } | null,
    "deposit":     { "amount": number, "currency": string } | null,
    "scholarship": { "amount": number, "currency": string, "note": string } | null
  } | null,
  "conditions": [
    { "item": string, "status": "required"|"optional"|"met", "deadline": string | null }
  ],
  "must_do": [
    { "action": string, "deadline": string | null, "priority": "high"|"medium"|"low" }
  ],
  "raw_highlights": [ string ]              // 原文中最关键的 1-5 句摘录
}

规则：
- 字段不确定就用 null 或空数组，不要编造。
- "留位费 / deposit / seat fee / enrolment deposit" 映射到 deposit_deadline，并加入 must_do 高优先级。
- 日期必须归一到 YYYY-MM-DD。如果原文只说"within 2 weeks"之类，解析不出具体日期就返回 null。
- must_do 是 "用户必须做的动作"（如 "缴纳留位费 $1000"、"提交 IELTS 成绩"），不是信息性陈述。
- 一切中文 label，保持简洁。`;

export interface ExtractOptions {
  apiKey: string;
  provider?: Provider;
  model?: string;
  signal?: AbortSignal;
}

export async function extractOffer(
  input: ParsedInput,
  opts: ExtractOptions
): Promise<ExtractedOffer> {
  const provider = opts.provider ?? DEFAULT_PROVIDER;
  const config = PROVIDERS[provider];
  const model = opts.model || config.defaultModel;

  const userContent: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [];

  if (input.text.trim()) {
    userContent.push({
      type: "text",
      text:
        `下面是 offer 原文（${input.kind}，${input.sourceName ?? "pasted"}）：\n\n` +
        input.text.slice(0, 60_000),
    });
  }
  for (const img of input.images) {
    userContent.push({ type: "image_url", image_url: { url: img } });
  }
  if (userContent.length === 0) {
    userContent.push({ type: "text", text: "(empty)" });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.apiKey}`,
    ...(config.extraHeaders?.() ?? {}),
  };

  const res = await fetch(config.endpoint, {
    method: "POST",
    signal: opts.signal,
    headers,
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content");
  }

  const parsed = safeJsonParse(content);
  return normalizeExtracted(parsed);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]);
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error("Could not parse LLM JSON output");
  }
}

function normalizeExtracted(raw: unknown): ExtractedOffer {
  const r = raw as Partial<ExtractedOffer> | null | undefined;
  return {
    school: r?.school ?? "Unknown school",
    program: r?.program ?? "",
    degree: r?.degree ?? undefined,
    country: r?.country ?? undefined,
    language: r?.language ?? undefined,
    key_dates: Array.isArray(r?.key_dates) ? r!.key_dates : [],
    fees: r?.fees ?? undefined,
    conditions: Array.isArray(r?.conditions) ? r!.conditions : [],
    must_do: Array.isArray(r?.must_do) ? r!.must_do : [],
    raw_highlights: Array.isArray(r?.raw_highlights) ? r!.raw_highlights : [],
  };
}
