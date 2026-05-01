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
  "school": string,                         // 学校全名（offer 上的原文，可能是英文）
  "school_zh": string | null,               // 学校常用中文名，如 "香港理工大学"。没有公认中文名就 null
  "program": string,                        // 项目 / 专业名（offer 原文）
  "program_zh": string | null,              // 项目中文名，如 "可持续能源理学硕士"
  "degree": string | null,                  // 例如 "Master", "Bachelor", "PhD"
  "degree_zh": string | null,               // 学位中文名："硕士" / "学士" / "博士"
  "country": string | null,                 // ISO 国家名或常用中/英名
  "country_zh": string | null,              // 国家或地区中文名，如 "中国香港" / "英国" / "美国"
  "language": string | null,                // offer 原文语言（如 "en", "zh", "fr"）
  "duration": string | null,                // 项目时长，如 "1 年" / "1.5 年" / "2 年" / "30 学分"
  "term_start_text": string | null,         // 入学时间的中文描述（即使无具体日期，也要写学期+学年）
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

入学时间 (term_start_text) - 必填:
- offer 上能看到的最具体的入学时间描述。优先级：**具体日期 > 学期+学年 > 仅学年**。
- 如果 offer 给了具体开学日期（"Term starts: 2026-09-01"），key_dates 中加 type="term_start"，date="2026-09-01"，并把 term_start_text 写成 "2026 年 9 月 1 日"。
- 如果 offer **没有具体日期**但给了学期+学年（最常见，如 "Semester 1 of the 2026/27 academic year"），key_dates 中**不要**加 term_start，但**必须**填 term_start_text = "2026/27 学年第一学期"。
- 如果只给学年（"for 2026/27 entry"），term_start_text = "2026/27 学年"。
- "Academic year 2026/27" = 2026 年秋季入学，**不是** 2025 年。
- 中文化对照：Semester 1 / Term 1 / Fall = 第一学期；Semester 2 / Term 2 / Spring = 第二学期；Summer = 夏季学期。

抽取规则：
- 字段不确定就用 null 或空数组，**绝对不要编造**。
- 学制时长 (duration) 必须尝试抽取：找 "Programme Duration" / "Normal Duration" / "学制" / "修业年限" / "总学分" 等字段。"Full-time 1.5 years" → "1.5 年"。
- 一切 label、key_dates[].label、must_do[].action、conditions[].item、tuition.note 等**用户可见**的文字一律用**中文**写，简洁直接（即使 offer 是全英文）。
- 中文名规则：
  - school_zh 是学校的常用中文名，例如 "The Hong Kong Polytechnic University" → "香港理工大学"；"University College London" → "伦敦大学学院"；"University of California, Berkeley" → "加州大学伯克利分校"；"The University of Hong Kong" → "香港大学"；"Imperial College London" → "帝国理工学院"。学校没有公认中文名就 null，不要硬翻。
  - program_zh 是项目的中文译名（学校官方公布的优先；没有就用通用直译），例如 "MSc Sustainable Energy" → "可持续能源理学硕士"；"MSc Computer Science" → "计算机科学理学硕士"；"MBA" → "工商管理硕士"。
  - degree_zh: Master/MSc/MA → "硕士"；Bachelor/BSc/BA → "学士"；PhD/Doctor of Philosophy → "博士"；Master of Engineering → "工程硕士"。
  - country_zh: Hong Kong → "中国香港"；United Kingdom/UK → "英国"；United States/US → "美国"；Australia → "澳大利亚"；Singapore → "新加坡"；Mainland China → "中国大陆"。
- **英文规范化**：如果 offer 把学校或专业名写成全大写（如 "THE HONG KONG POLYTECHNIC UNIVERSITY" / "MSC SUSTAINABLE ENERGY"），抽取到 school / program 字段时**必须规范化为 Title Case**："The Hong Kong Polytechnic University" / "MSc Sustainable Energy"。常见缩写保持原样大写：MSc, MA, MBA, PhD, BSc, BA, MEng, MFA, LLM, MPhil, USA, UK, HK, MIT, NUS。

conditions vs must_do（必须区分清楚，不要同一件事写在两处）：
- **conditions = 学术 / 资格类录取条件**，描述"你必须满足或具备的状态 / 文件 / 资格"。例如：
  - "持有 GPA ≥ 3.0 的学士学位"
  - "提交雅思 7.0 / 托福 100 成绩"
  - "完成资格审核 (Qualification Verification)"
  - "本科最后一学期成绩单"
- **must_do = 学生必须主动采取的动作**，特别是付款、注册、签证、提交材料、面试预约等。例如：
  - "缴纳首期学费及留位费 HK$102,400 以确认录取"
  - "完成在线项目注册"
  - "申请 CAS / I-20 / 学生签证"
  - "提交资格审核所需文件"
- **同一件事只能出现在一处**。付款类**一律 must_do**，即使 offer 把 "Pay your deposit by Y" 写在 "Acceptance Conditions" 标题下，也归 must_do（不归 conditions）。
- must_do[].action **只描述要做什么，不要在 action 里嵌入日期**：
  ❌ "在 2026-08-31 前完成在线项目注册"
  ✅ "完成在线项目注册"，deadline = "2026-08-31"
- 涉及金额可以写在 action 里（"缴纳留位费 HK$102,400"），但**日期一律只放 deadline 字段**。

学费计算（**重要：旧规则已废弃，请严格遵守新规则**）：
- offer 上的"每学分单价 / per-credit fee"几乎都是**首期账单的临时折算价**（特别是当它出现在 "Debit Note" / "this debit note" / "Note on Tuition Fee" 注释里时），**不是**该项目官方公布的单价。**绝对不要**用它做 total 学费的乘法计算。
- 只有当 offer **明确直接**列出"项目总学费"数字（如 "Total Programme Tuition: HK$530,400"、"Programme Fee: USD 80,000 in total"）时，才用这个数字，is_estimate = false。
- 任何其它情况（offer 只列首期 / 只列单价 / 只列总学分 / 给了"年度学费 + 学制"组合等）**都不要在抽取阶段计算 total**。
  - tuition 直接设为 null
  - info_gaps 加一条"学费未在 offer 上明确列出全程总额，请到 [学校] 官网查询"
  - 后续的研究步骤会用官网的当前公布单价补全。
- **明令禁止**：不要做"项目总学分 × offer 上的 per-credit 单价"的乘法（如 31 × HK$8,500 这种）—— 这种乘法用的是错误的单价来源，结果会是错的。

留位费 / Caution Money（沿用之前规则）：
- "Caution Money" / "留位费" / "Acceptance Deposit" / "Enrolment Deposit" / "Seat Deposit" 一律放 fees.deposit，不要塞进 tuition。

fees.deposit 的语义（沿用之前规则）：
- fees.deposit 的含义是"为了确认录取、必须在 deposit_deadline 之前缴纳的总金额"——也就是中介或学生口头说的"留位费 / 接受 offer 要交多少钱"。
- 如果 offer 上的"Debit Note 1 / 首期账单 / Initial Payment"包含若干小项（caution money + tuition first installment + 其它 fees），fees.deposit.amount 应该是它们的**合计 (Total Fee)**，而不是其中某一行。
- 例子：PolyU offer 的 Debit Note 1 写 "Caution Money 400 + Tuition fee 102,000 = Total 102,400, Payment Deadline 19-Mar-2026"，则 fees.deposit = { amount: 102400, currency: "HKD", note: "Caution Money 400 + 首期学费 102,000" }，并在 key_dates 中加 deposit_deadline=2026-03-19，在 must_do 中加高优先级"在 2026-03-19 前缴纳 HK$102,400 以确认录取"。
- 如果 offer 只有一个独立的 "refundable deposit" 数字（不含首期学费），那 fees.deposit 就是这个独立数字。

（学费计算规则见上方"学费计算"段；新版本不再做自动相乘，未明确列出总学费时直接 tuition=null + info_gaps + 等研究步骤）

学费仍然不完整时（is_partial = true）：
- 只有在 offer 上的学费数字是"首期 / 单学期 / 单学分 / 一部分付款"，并且**也无法从 offer 自身算出总额**时，才把它放到 tuition 并设 is_partial = true。
- 在 tuition.note 中用中文解释为什么是首期，例如 "首期 12 学分 × HK$8,500，全程总学费需查官网"。

info_gaps（生成前必须做自检）：
- 在写 info_gaps 之前，请先查看你**已经填入**的字段。一条 gap 只有当对应字段为 null 或为不完整时才能加。**绝不能为一个你已经填了具体值的字段加"未找到"。**
- 触发条件（任意命中且对应字段确实没填好才加）：
  - fees.tuition 为 null 或 is_partial 仍为 true → "学费仅显示首期，请到 [学校] 官网查询全程总学费"
  - duration 为 null → "未找到项目时长"
  - **term_start_text 也为 null 且 key_dates 中无任何 type="term_start"** → "未找到具体入学时间"（注意：只要 term_start_text 写了"2026/27 学年第一学期"这类描述，就**不要**加这条 gap）
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
    school_zh: r?.school_zh ?? undefined,
    program: r?.program ?? "",
    program_zh: r?.program_zh ?? undefined,
    degree: r?.degree ?? undefined,
    degree_zh: r?.degree_zh ?? undefined,
    country: r?.country ?? undefined,
    country_zh: r?.country_zh ?? undefined,
    language: r?.language ?? undefined,
    duration: r?.duration ?? undefined,
    term_start_text: r?.term_start_text ?? undefined,
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
  const hasTermStart =
    offer.key_dates?.some((k) => k.type === "term_start" && !!k.date) ||
    !!offer.term_start_text?.trim();
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
    if (
      hasTermStart &&
      /(开学|入学日期|入学时间|term[\s-]?start)/i.test(g)
    )
      return false;
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
1. **只能用学校官方网站**（如 .edu.hk、.edu、.ac.uk、.edu.au、.edu.cn 等学校自己的域名），不要用第三方留学网站、论坛、知乎、小红书等。
2. **绝对不要复用 offer 文件里写的 per-credit / 单学期 / 首期账单的金额**——那些通常是临时折算值。所有数字**必须**直接来自学校官网当前公布的费率页（"Tuition Fee" / "Programme Fee" / "Fees and Funding" 类页面）。
3. 如果官网公布"项目总学费 X"（如 "HK$530,400 per programme"），直接使用 X。
4. 如果官网只公布"per-credit Y"和"项目总学分要求 Z"，那么 amount = Z * Y；如果有 1-credit Academic Integrity 等明确不收学费的学分，请在乘法中扣除并在 note 里说明。
5. **特别留意可能的减免规则**——学分豁免、奖学金内置折扣、首学期减免、本地 vs 非本地费率差异。看到 "fee waiver / exempt / non-tuition / scholarship-discounted" 字样时必须读完整段并反映到 amount 或 note。
6. 学费必须明确币种 (HKD / USD / GBP 等三字母 ISO 代码)。
7. 入学时间用于确认你查到的是该届新生的费率（如 2026/27 入学）。如果只能查到旧届费率，请在 note 里注明并返回 null amount，让用户自己核对。
8. 如果搜不到具体数字，对应字段返回 null。**绝对不要编造**。

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

  // The model's freeform `source` URLs in the JSON are not trustworthy — it
  // tends to write a plausible-looking school path that 404s. Only Gemini's
  // groundingMetadata.groundingChunks contains the URLs that were actually
  // fetched during search. Replace any model-supplied source with the first
  // grounded URI, and drop it entirely if no grounded sources exist.
  const groundingChunks: { web?: { uri?: string; title?: string } }[] =
    json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundedSources = groundingChunks
    .map((c) => c.web?.uri)
    .filter((u): u is string => !!u);
  const verifiedSource = groundedSources[0];

  return {
    tuition: withVerifiedSource(cleanMoney(parsed.tuition), verifiedSource),
    scholarship: withVerifiedSource(
      cleanMoney(parsed.scholarship),
      verifiedSource,
    ),
    duration:
      typeof parsed.duration === "string" && parsed.duration.trim()
        ? parsed.duration.trim()
        : undefined,
    sources: groundedSources,
  };
}

function withVerifiedSource<T extends { source?: unknown }>(
  m: T | undefined,
  verified: string | undefined,
): T | undefined {
  if (!m) return undefined;
  const { source: _omit, ...rest } = m;
  if (verified) return { ...(rest as T), source: verified };
  return rest as T;
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
export function applyResearch<T extends ExtractedOffer>(
  offer: T,
  research: ResearchResult,
): T {
  const merged: T = { ...offer, fees: { ...(offer.fees ?? {}) } };
  if (research.tuition) {
    // Research from the school's website is treated as authoritative (not an
    // estimate, not partial). User can still manually override later.
    merged.fees!.tuition = {
      ...research.tuition,
      is_partial: false,
      is_estimate: false,
    };
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
