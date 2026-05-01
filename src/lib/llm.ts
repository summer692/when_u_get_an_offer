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
    defaultModel: "gemini-2.5-flash",
    models: [
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        note: "推荐 · 免费层够用",
      },
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        note: "最便宜 / 偶尔抽错",
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        note: "复杂 offer / 多页",
      },
    ],
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "google/gemini-2.5-flash",
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
  "duration": string | null,                // 项目时长，如 "1 年" / "1.5 年" / "2 年" / "30 学分"
  "key_dates": [
    {
      "type": "accept_deadline" | "deposit_deadline" | "term_start" | "tuition_deadline" | "document_deadline" | "other",
      "date": string,                       // ISO 8601，"YYYY-MM-DD"
      "label": string                       // 中文人类可读标签
    }
  ],
  "fees": {
    "tuition":     { "amount": number, "currency": string, "period": "year"|"term"|"total", "note": string|null, "is_partial": boolean } | null,
    "deposit":     { "amount": number, "currency": string, "note": string|null } | null,
    "scholarship": { "amount": number, "currency": string, "note": string } | null
  } | null,
  "conditions": [
    { "item": string, "status": "required"|"optional"|"met", "deadline": string | null }
  ],
  "must_do": [
    { "action": string, "deadline": string | null, "priority": "high"|"medium"|"low" }
  ],
  "raw_highlights": [ string ],             // 原文中最关键的 1-5 句摘录
  "info_gaps": [ string ]                   // 缺失或需要核实的关键信息（中文，简短）
}

抽取规则：
- 字段不确定就用 null 或空数组，**绝对不要编造**。
- 学制时长 (duration) 必须尝试抽取：找 "Programme Duration" / "Normal Duration" / "学制" / "修业年限" / "总学分" 等字段。"Full-time 1.5 years" → "1.5 年"。
- 一切 label 用中文，简洁。

学费 vs 留位费（重要，常见错误源）：
- "Caution Money" / "留位费" / "Acceptance Deposit" / "Enrolment Deposit" / "Seat Deposit" 一律放 fees.deposit，**不要**当成 tuition。
- 真正的学费 (tuition) 是项目本身的教学费，常见关键词："Tuition Fee" / "Programme Fee" / "学费" / "Course Fee"。
- **如果 offer 上的学费数字只是"首期付款 / per-credit 计费 / 单学期金额 / 一部分学分对应的金额"** —— 例如香港多数 PolyU/HKU/CUHK offer 只列出按学分计的首期 debit note —— 必须：
  (1) 仍把它放到 tuition；
  (2) **将 tuition.is_partial 设为 true**；
  (3) 在 tuition.note 里用中文清楚解释，例如 "首期 12 学分 × HK$8,500，全程总学费需查官网"；
  (4) 在 info_gaps 加一条："学费仅显示首期，请到 [学校] 官网查询全程总学费"。

info_gaps 触发条件（任意命中就加一条简短中文说明）：
- 没找到 tuition 数字；
- 找到的 tuition.is_partial 为 true；
- 没找到 duration（学制时长）；
- 没找到 term_start（开学时间）；
- 没找到 deposit_deadline 但 offer 提到 caution / deposit。

key_dates 与 must_do：
- 留位费截止 → key_dates 加一条 type="deposit_deadline"；同时 must_do 加一条 priority="high"，action 写明金额（如有），如 "缴纳留位费 HK$102,400 以确认录取"。
- must_do 是"用户要做的动作"，不是信息描述。
- 日期归一到 YYYY-MM-DD。"within 2 weeks" 这类无法解析就 null。`;

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
    duration: r?.duration ?? undefined,
    key_dates: Array.isArray(r?.key_dates) ? r!.key_dates : [],
    fees: r?.fees ?? undefined,
    conditions: Array.isArray(r?.conditions) ? r!.conditions : [],
    must_do: Array.isArray(r?.must_do) ? r!.must_do : [],
    raw_highlights: Array.isArray(r?.raw_highlights) ? r!.raw_highlights : [],
    info_gaps: Array.isArray(r?.info_gaps)
      ? r!.info_gaps.filter((s): s is string => typeof s === "string" && !!s.trim())
      : [],
  };
}
