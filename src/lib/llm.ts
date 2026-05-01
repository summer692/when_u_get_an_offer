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

学费计算（优先尝试，避免 is_partial）：
- **如果 offer 同时给出了"项目总学分"（如 "Programme Credit Requirements: 31.0"、"30 credits in total"、"修读 30 学分"）和"按学分单价"（如 "HK$8,500/credit"），请你自己用乘法算出全程总学费，并填到 tuition：**
  amount = 总学分 × 单价
  period = "total"
  is_partial = false
  note = "{总学分} 学分 × {币种}{单价}（依据 offer）"
- 同理：如果 offer 给出"按年学费 + 学制年数"，也可以直接相乘得到 total。
- **必须真的相乘得出一个具体的整数**，不要只写公式不写数字。

学费仍然不完整时（is_partial = true）：
- 只有在 offer 上的学费数字是"首期 / 单学期 / 单学分 / 一部分付款"，并且**也无法从 offer 自身算出总额**时，才把它放到 tuition 并设 is_partial = true。
- 在 tuition.note 中用中文解释为什么是首期，例如 "首期 12 学分 × HK$8,500，全程总学费需查官网"。

info_gaps（生成前必须做自检）：
- 在写 info_gaps 之前，请先查看你**已经填入**的字段。一条 gap 只有当对应字段为 null 或为不完整时才能加。**绝不能为一个你已经填了具体值的字段加"未找到"。**
- 触发条件（任意命中且对应字段确实没填好才加）：
  - fees.tuition 为 null 或 is_partial 仍为 true → "学费仅显示首期，请到 [学校] 官网查询全程总学费"
  - duration 为 null → "未找到项目时长"
  - key_dates 中**没有任何** type="term_start" 的条目 → "未找到具体开学日期"
  - offer 提到 caution / deposit / 留位费但 key_dates 中**没有任何** type="deposit_deadline" 的条目 → "未找到留位费截止日期"
- 字段已抽取就**不要**报告这条 gap。

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
  const out: ExtractedOffer = {
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
  out.info_gaps = pruneInfoGaps(out);
  return out;
}

/**
 * Drop info_gaps entries that contradict fields the LLM actually filled in.
 * Defense against the model emitting both "未找到 X" and a populated X field.
 */
export function pruneInfoGaps(offer: ExtractedOffer): string[] {
  const gaps = offer.info_gaps ?? [];
  const hasTermStart = offer.key_dates?.some(
    (k) => k.type === "term_start" && !!k.date,
  );
  const hasDepositDeadline = offer.key_dates?.some(
    (k) => k.type === "deposit_deadline" && !!k.date,
  );
  const hasDuration = !!offer.duration?.trim();
  const t = offer.fees?.tuition;
  const hasCompleteTuition = !!t && t.is_partial !== true;

  return gaps.filter((g) => {
    const s = g.toLowerCase();
    if (
      hasDepositDeadline &&
      (/留位费.*截止|deposit.*deadline|caution.*due/i.test(g) ||
        s.includes("留位"))
    )
      return false;
    if (hasTermStart && /(开学|入学日期|term[\s-]?start)/i.test(g)) return false;
    if (hasDuration && /(学制|时长|duration|学分.*总)/i.test(g)) return false;
    if (hasCompleteTuition && /(学费|tuition).*(首期|不完整|未找到|总学费)/i.test(g))
      return false;
    return true;
  });
}

/**
 * Use Gemini's native googleSearch tool to look up missing tuition / duration
 * for an offer from the school's official website. Only supported on the
 * Google provider — OpenRouter doesn't expose grounded search through this
 * compatibility layer, so the caller must fall back gracefully.
 */
export interface ResearchResult {
  tuition?: NonNullable<ExtractedOffer["fees"]>["tuition"];
  scholarship?: NonNullable<ExtractedOffer["fees"]>["scholarship"];
  duration?: string;
  sources: string[];
}

const RESEARCH_SUPPORTED_MODEL = "gemini-2.5-flash";

export async function researchOffer(
  offer: ExtractedOffer,
  opts: { apiKey: string; signal?: AbortSignal },
): Promise<ResearchResult | null> {
  const termStart = offer.key_dates?.find((k) => k.type === "term_start")?.date;
  const prompt = `用户拿到了一份 ${offer.school} 的录取通知，但 offer 上有些关键信息不全，需要你访问学校官方网站补全。

学校：${offer.school}
项目：${offer.program}${offer.degree ? ` (${offer.degree})` : ""}
学制：${offer.duration ?? "未知"}
入学时间：${termStart ?? "未知"}

请补全以下字段。规则：
1. **只能用学校官方网站**（如 .edu.hk、.edu、.ac.uk、.edu.au、.edu.cn 等学校自己的域名），不要用第三方留学网站。
2. 如果官网公布了"X 学分 × Y/学分"，请算出 X*Y 作为 total 学费。
3. 学费必须明确币种 (HKD / USD / GBP 等三字母 ISO 代码)。
4. 入学时间用于确认你查到的是该届新生的费率（例如 2026/27 入学）。
5. 如果搜不到具体数字，对应字段返回 null。**绝对不要编造**。

请输出一段 JSON（包在 \`\`\`json 代码块里）：

{
  "tuition": { "amount": <number>, "currency": "<3-letter ISO>", "period": "total"|"year", "note": "<中文，说明依据，例如 '30 学分 × HK$8,500，依据 polyu.edu.hk 公布的 2026/27 入学费率'>", "source": "<具体页面 URL>" } | null,
  "duration": "<例如 '1.5 年' 或 '30 学分'>" | null,
  "scholarship": { "amount": <number>, "currency": "<ISO>", "note": "<中文条件说明>", "source": "<URL>" } | null
}

注意：
- 如果你找不到任何官网信息，三个字段都返回 null。
- 已经清楚的字段（学制等）就不必再查，直接返回 null 即可。`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${RESEARCH_SUPPORTED_MODEL}:generateContent` +
    `?key=${encodeURIComponent(opts.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Research request failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
    "";
  if (!text.trim()) return null;

  const parsed = safeJsonParse(text) as Partial<ResearchResult> | null;
  if (!parsed || typeof parsed !== "object") return null;

  const groundingChunks: { web?: { uri?: string; title?: string } }[] =
    json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundedSources = groundingChunks
    .map((c) => c.web?.uri)
    .filter((u): u is string => !!u);

  return {
    tuition: cleanMoney(parsed.tuition),
    scholarship: cleanMoney(parsed.scholarship),
    duration:
      typeof parsed.duration === "string" && parsed.duration.trim()
        ? parsed.duration.trim()
        : undefined,
    sources: groundedSources,
  };
}

function cleanMoney<T extends { amount?: unknown; currency?: unknown }>(
  m: T | null | undefined,
): T | undefined {
  if (!m || typeof m !== "object") return undefined;
  if (typeof m.amount !== "number" || !Number.isFinite(m.amount)) return undefined;
  if (typeof m.currency !== "string" || !m.currency.trim()) return undefined;
  return m;
}

/**
 * Merge research findings into an extracted offer. New fees come with
 * is_partial = false (research returns full / official totals only).
 */
export function applyResearch(
  offer: ExtractedOffer,
  research: ResearchResult,
): ExtractedOffer {
  const merged: ExtractedOffer = { ...offer, fees: { ...(offer.fees ?? {}) } };
  if (research.tuition) {
    merged.fees!.tuition = { ...research.tuition, is_partial: false };
  }
  if (research.scholarship && !merged.fees!.scholarship) {
    merged.fees!.scholarship = research.scholarship;
  }
  if (research.duration && !merged.duration) {
    merged.duration = research.duration;
  }
  merged.info_gaps = pruneInfoGaps(merged);
  return merged;
}
