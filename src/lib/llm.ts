import { jsonrepair } from "jsonrepair";
import type { ExtractedOffer, Condition, MustDo, Provider } from "./schema";
import { stripMarkdown } from "./format";
import { recordExtractionLog } from "./debugLog";
import type { ParsedInput } from "./parsers";

interface ProviderConfig {
  endpoint: string;
  defaultModel: string;
  /** Optional extra headers (e.g. OpenRouter analytics) */
  extraHeaders?: () => Record<string, string>;
  models: { id: string; label: string; note?: string }[];
  /** Whether to send `response_format: { type: "json_object" }`. Most
   * OpenAI-compatible providers interpret this as "JSON conforming to
   * the schema described in the prompt"; 智谱 specifically interprets
   * it as "any valid JSON, ignore the schema" and produces off-schema
   * garbage. Default true; set false on providers that misbehave. */
  jsonMode?: boolean;
  /** Whether to send `top_p: 0` for greedy / deterministic decoding.
   * Some providers reject `top_p: 0` as out-of-range and either error
   * or silently fall back to default. Default true. */
  greedyTopP?: boolean;
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
  zhipu: {
    // 智谱 BigModel — OpenAI-compatible chat completions endpoint. Same
    // multimodal request shape as Google AI Studio, so the existing
    // extractOnce code path works unchanged. Reachable from mainland
    // China without VPN, which is why we surface it as the default
    // provider for Chinese-timezone users.
    //
    // Default model is GLM-4.6V-Flash, not the free GLM-4V-Flash —
    // testing showed GLM-4V-Flash is too small for our 8000+ char prompt
    // and routinely returns malformed JSON (arrays instead of objects,
    // repetition loops on phrases like "Programme Fee"). A few cents per
    // offer for GLM-4.6V-Flash is well worth the reliability.
    //
    // jsonMode=false: 智谱 reads `response_format: json_object` as "emit
    // ANY valid JSON, the schema in the system prompt is hints not law"
    // and ships back made-up keys (offer_date / offer_type / etc.).
    // Without the flag set, the model falls back to following the
    // system prompt's JSON schema description, and our safeJsonParse
    // ladder (strict → fenced → brace-slice → jsonrepair) absorbs any
    // formatting noise.
    //
    // greedyTopP=false: 智谱's API rejects top_p: 0 as out-of-range.
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4.6v-flash",
    jsonMode: false,
    greedyTopP: false,
    models: [
      {
        id: "glm-4.6v-flash",
        label: "GLM-4.6V-Flash",
        note: "推荐 · 国内可用 · 约 ¥0.005/份 offer",
      },
      {
        id: "glm-4.6v",
        label: "GLM-4.6V",
        note: "旗舰 · 复杂 offer 用",
      },
      {
        id: "glm-4v-flash",
        label: "GLM-4V-Flash",
        note: "免费 · 仅适合简单 offer，可能抽错",
      },
    ],
  },
};

export const DEFAULT_PROVIDER: Provider = "google";
export const DEFAULT_MODEL = PROVIDERS.google.defaultModel;

const SYSTEM_PROMPT = `你是 OfferLens 的信息抽取引擎。用户会给你一份学校录取通知（offer）的原文或图片。
请**仅**输出一个 JSON 对象，遵循下方 schema，不要输出任何其它文字、注释或 markdown 包裹。

⛔ 全文（包括 conditions[].item / conditions[].details / must_do[].action / must_do[].details / notes[] / info_gaps[]）**严禁**任何 markdown 标记：
- ❌ 不要写 \`**加粗**\` / \`__加粗__\` / \`*斜体*\` / \`_斜体_\`
- ❌ 不要在字符串里写 \`# 标题\` / \`## 标题\`
- ❌ 不要在字符串里加 \`- 列表\` / \`1. 编号\`（数据本来就是数组，每条 item 已经隐含了编号）
- 想强调某个词就用中文引号「」或者书名号《》。需要换行就用真实 \\n。

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
  "faculty": string | null,                 // 学院 / 学部，如 "Faculty of Engineering"
  "faculty_zh": string | null,              // 学院中文名，如 "工程学院"
  "student_category": string | null,        // offer 上写明的学生类别，如 "Non-local student" / "本地学生"
  "language": string | null,                // offer 原文语言（如 "en", "zh", "fr"）
  "duration": string | null,                // 项目时长，如 "1 年" / "1.5 年" / "2 年" / "30 学分"
  "applicant_name": string | null,          // 录取人姓名（"Dear X" / "Applicant Name: X" / "亲爱的 X"），中文优先
  "term_start_text": string | null,         // 入学时间的中文描述（即使无具体日期，也要写学期+学年）
  "key_dates": [
    {
      "type": "accept_deadline" | "deposit_deadline" | "term_start" | "tuition_deadline" | "document_deadline" | "other",
      "date": string,                       // ISO 8601，"YYYY-MM-DD"
      "label": string                       // 中文人类可读标签
    }
  ],
  "fees": {
    "tuition":     { "amount": number, "currency": "HKD"|"USD"|"GBP"|"EUR"|"CNY"|"SGD"|"AUD"|"CAD"|"JPY"|"KRW", "period": "year"|"term"|"total", "note": string|null, "is_partial": boolean } | null,
    "deposit":     { "amount": number, "currency": "HKD"|"USD"|"GBP"|"EUR"|"CNY"|"SGD"|"AUD"|"CAD"|"JPY"|"KRW", "note": string|null } | null,
    "scholarship": { "amount": number, "currency": "HKD"|"USD"|"GBP"|"EUR"|"CNY"|"SGD"|"AUD"|"CAD"|"JPY"|"KRW", "note": string } | null
  } | null,
  "conditions": [
    {
      "item": string,                       // 一句话主述（含具体院校名 / 专业 / 分数等关键细节）
      "details": string | null,             // 扩展说明：可接受的格式、有效期、备选方案、考试代码、英文翻译要求等
      "status": "required" | "optional" | "met",
      "deadline": string | null
    }
  ],
  "must_do": [
    {
      "action": string,                     // 一句话主述（在哪里操作、上传什么、金额等核心信息）
      "details": string | null,             // 扩展说明：URL、缴费金额构成、联系邮箱、其它操作步骤
      "deadline": string | null,
      "priority": "high" | "medium" | "low"
    }
  ],
  "raw_highlights": [ string ],             // 原文中最关键的 1-5 句摘录
  "notes": [ string ],                      // 重要备注（材料真实性、不退费、签证自办、Concurrent Registration 等），每条一句中文
  "info_gaps": [ string ],                  // 缺失或需要核实的关键信息（中文，简短）
  "summary": string                         // 250-350 字中文叙事（详见下方"叙事解读"段落）
}

叙事解读 (summary) - 必填，最重要的兜底字段:
- summary 的定位是 **"中介可以直接复制粘贴发给学生/家长的整理文本"**——不是写给开发者看的散文，而是写给学生看的工作产物。
- **格式：纯文本 + emoji 锚点 + 换行**。**不要** markdown 语法（不要 \`**\` 加粗、不要 \`### \` 标题、不要 \`-\` 项目符号）——直接用 emoji 当章节锚点、用换行隔开层级、用中文符号"•"做内嵌项目。这样复制到微信、邮件、QQ 都能直接读。
- **长度：500-800 字**。比之前长，因为它要替代结构化卡片成为一份"全集"。
- **结构（按这个顺序）**：
  1. 称呼 + 一句"恭喜获得 XX 大学 XX 项目的录取"。
  2. \`🎓 录取基本信息\` 段：专业、学制、入学时间、学费总额（一两行讲清）。
  3. \`⏳ 接受录取与缴费\` 段：截止日期、留位费金额（含构成）、具体操作步骤（带 URL）、未缴后果、退款规则。
  4. \`📝 换取正式录取的条件\` 段：学位/成绩要求 + 各项材料的提交时间和具体规格。
  5. \`⚠️ 注意事项\` 段：所有"容易踩坑、不能忽略"的注意点，比如 Concurrent Registration、签证自办、授课语言、奖学金附带条件、offer 撤回情形等。
  6. 收尾一句简短鼓励/提醒（"时间紧迫，请优先处理留位费"之类）。
- **写作要求**：
  - **必须**包含 offer 上提到的所有具体 URL（缴费系统、招生平台等）—— 学生需要直接点击。
  - **必须**列出留位费的具体金额构成（如 "HK$140,450（含首期学费、HK$350 保证金、HK$100 学生活动费）"）。
  - **必须**写明各类截止日期的"如果不做会怎样"（"未缴费视为放弃录取" / "未提交材料则录取失效"）。
  - **必须**给材料类的具体规格（"中英双语在线验证报告，有效期至少 6 个月"），不能只写"提交学历认证"。
  - 学校名、专业名首次出现时给中英双语（"香港大学 (The University of Hong Kong)"）。
- ❌ 禁止编造：所有金额、日期、URL、条件细节都必须**确实出自 offer 原文**，没有就不写。
- ❌ 禁止套话：不要"请仔细阅读"、"祝学习顺利"这种没信息量的话。

✅ 完整范例（港大低空技术工程理学硕士 conditional offer）：

\`\`\`
Wang Chenchen 同学，恭喜你获得香港大学 (The University of Hong Kong) 的条件录取通知书 (Conditional Offer)！以下是这份 offer 的关键信息，请仔细阅读，重点关注截止日期。

🎓 录取基本信息
专业：Master of Science in Engineering in Low-Altitude Technology（低空技术工程理学硕士）
学制：全日制 1.5 年，2026 年 9 月入学
学费总额：HK$420,000（分三期等额支付）

⏳ 接受录取与缴费（紧急）
截止日期：2026 年 4 月 22 日
留位费：HK$140,450（含首期学费、HK$350 保证金、HK$100 学生活动费）
操作步骤：
• 在线上录取通知书回执（Notice of Admission）上确认接受录取
• 在截止日前将缴费凭证上传至工程学院招生系统：https://tpgadmission.engg.hku.hk
注意：未在截止日前完成确认和缴费视为放弃录取；留位费除未能满足录取条件外不可退还或转让。

📝 换取正式录取的条件
2026 年 8 月 31 日前从中南大学 (Central South University) 顺利获得机械设计制造及其自动化学士学位
2026 年 7 月 31 日前向机械工程系提交以下材料（中国大陆学历）：
• 成绩单：学信网 (CHSI) 中英双语《高等学校学生成绩单在线验证报告》
• 学位证：学信网中英双语《中国高等教育学位在线验证报告》
• 毕业证：学信网中英双语《教育部学历证书电子注册备案表》
所有学信网报告有效期至少 6 个月（建议选最长有效期）。

⚠️ 注意事项
• 不接受同时在其他高校注册学位 (Concurrent Registration)
• 课程语言为英文
• 签证需自行申请，学校只出录取证明

时间紧迫，请优先处理留位费缴纳和系统确认。任何疑问随时联系。
\`\`\`

- 写完后**自检一遍**：把这段文字直接复制粘贴发给学生家长，他们能不能据此独立完成所有该做的事？做不到就回去补。

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

🔴 **核心原则：完整性 — 绝对不能丢失信息**
你是这位学生的助手，他完全依赖你的输出来了解 offer。**你不能删任何对学生有用的细节**。如果一句话太长，把核心放 item / action，把扩展细节（具体院校名、可接受格式、有效期、考试分数代码、URL 等）放 details 字段。**没有"概括"权限——必须把 offer 上能看到的具体信息都列出来**。

✅ 完整抽取范例（来自一份真实 HKU offer）：

conditions（注意每条都包含具体院校 / 专业 / 分数 / 代码）：
[
  {
    "item": "在中南大学完成机械制造及自动化专业学士学位",
    "details": "需要原件 + 英文版本（或附经认证的英文翻译）",
    "deadline": "2026-08-31"
  },
  {
    "item": "提交官方最终成绩单",
    "details": "需含完整修课记录、所修科目成绩、授予学位证明（英文版）。如来自中国大陆，可改用学信网 (CHSI) 出具的中英双语《高等学校学生成绩单在线验证报告》，由教育部授权的第三方机构发出，验证有效期至少 6 个月。",
    "deadline": "2026-07-31"
  },
  {
    "item": "提交学位证书与毕业证书",
    "details": "中国大陆学历可改用学信网中英双语《学位证书在线验证报告》和《学历证书电子注册备案表》，验证有效期至少 6 个月。",
    "deadline": "2026-07-31"
  },
  {
    "item": "提交托福或雅思官方成绩",
    "details": "TOEFL ≥ 80（网考）或 ≥ 550（纸考），IELTS 总分 ≥ 6.0 且单项 ≥ 5.5，两年内有效；港大 TOEFL 院校代码 9671；成绩须由考试机构直接寄送。",
    "deadline": "2026-07-31"
  }
]

must_do（注意每条都说清楚：在哪里、上传什么、金额构成、URL）：
[
  {
    "action": "在网申系统接受录取并上传 HK$140,450 缴费凭证",
    "details": "登录 https://tpgadmission.engg.hku.hk，在 Notice of Admission 上勾选「ACCEPTANCE」并上传缴费证明。HK$140,450 = 首期学费 HK$140,000 + 留位费 HK$350 + 学生活动费 HK$100。逾期未回复视为放弃录取；款项一旦缴纳，除未满足录取条件外不可退还、不可转让。",
    "deadline": "2026-04-22",
    "priority": "high"
  }
]

notes（offer 上易被忽略但重要的附加说明，每条一句中文）：
[
  "所有提交材料须真实可查，伪造或隐瞒可能导致录取被取消并面临法律责任。",
  "提交的所有文件不退还；非英文文件须附经认证的英文翻译。",
  "学生须自行办理赴港学生签证，详见 https://www.immd.gov.hk/eng/services/visas/study.html。",
  "禁止 Concurrent Registration —— 在港大就读期间不得同时在其它学校修读其它学历，违反将被中止学籍。"
]

❌ 反例（错误的偷懒写法）：
- conditions: [{ "item": "获得机械制造及自动化学士学位" }]  ← 丢了"中南大学"、丢了 deadline、丢了 details
- conditions: [{ "item": "提交托福或雅思成绩" }]  ← 丢了具体分数 / 代码 / 有效期
- must_do: [{ "action": "缴纳留位费" }]  ← 丢了金额构成、URL、操作流程、逾期后果
- 没有 notes 数组，把"材料真实性"、"签证自办"、"Concurrent Registration"等重要警告整段省略

只要 offer 上写明的信息，**必须**反映到对应字段——任何省略都视为严重错误。

🎓 **专业名 (program / program_zh) — 必须自含学位类型**

program 是会出现在分享卡核心位置的字段，**绝对不能**只写专业方向裸名。规则：

1. program **必须**是 "学位类型 + 专业方向" 的完整英文写法。**不接受**：
   - ❌ \`Public Policy\`（缺学位）
   - ❌ \`Computer Science\`（缺学位）
   - ❌ \`MPP\`（用了缩写没展开）
   - ✅ \`Master of Public Policy\`
   - ✅ \`MSc in Computer Science\`
   - ✅ \`PhD in Education\`

2. **缩写一律展开为全称**：
   - \`MPP\` → \`Master of Public Policy\`
   - \`MSc\` 出现时若 offer 别处写出全称（如 \`Master of Science in X\`），优先使用全称
   - \`MBA\` 可保留为缩写（\`Master of Business Administration\` 太长，业界通用 MBA）
   - 同理 LLM, PhD, MPhil, EdD, JD, DPhil, EngD, MArch 这些**业界通用缩写**可保留

3. **找全名的范围**：扫整份 offer——标题（subject line）、抬头（recipient block）、正文（"You have been admitted to..."）、签名段、附件页眉、Programme Code 旁的 Programme Title。**只要任何一处写了完整名称，就用那个**。

4. program_zh **必须**包含学位中文：硕士 / 博士 / 学士 / 工程硕士 / 工商管理硕士 等。**不接受**只写"公共政策"、"计算机科学"——必须是"公共政策硕士"、"计算机科学理学硕士"。

5. 如果整份 offer 上**确实只能找到**裸专业名（极罕见，比如某些非正式 acceptance letter），保留裸名 + 在 info_gaps 加一句"专业名缺学位类型，建议查 [学校] 官网项目页确认"——后续 research 步骤会去补全。

**反例校正**（offer 上各处都没明说时不要硬猜，但只要任何一处提到学位类型就必须用上）：

✅ offer 标题写 \`Offer of Admission to MPP Programme\`，正文有 \`Master of Public Policy\`：
   → program = "Master of Public Policy"
   → program_zh = "公共政策硕士"
   → degree = "Master"
   → degree_zh = "硕士"

✅ offer 只在 Programme Title 处写 \`Computer Science\`，但 Programme Code 是 \`TPG-MSc-CS\`：
   → 从代码推 program = "MSc in Computer Science"，program_zh = "计算机科学理学硕士"

抽取规则（续）：
- 中文名规则：
  - school_zh 是学校的常用中文名，例如 "The Hong Kong Polytechnic University" → "香港理工大学"；"University College London" → "伦敦大学学院"；"University of California, Berkeley" → "加州大学伯克利分校"；"The University of Hong Kong" → "香港大学"；"Imperial College London" → "帝国理工学院"。学校没有公认中文名就 null，不要硬翻。
  - program_zh 是项目的中文译名（学校官方公布的优先；没有就用通用直译），例如 "MSc Sustainable Energy" → "可持续能源理学硕士"；"MSc Computer Science" → "计算机科学理学硕士"；"MBA" → "工商管理硕士"。
  - degree_zh: Master/MSc/MA → "硕士"；Bachelor/BSc/BA → "学士"；PhD/Doctor of Philosophy → "博士"；Master of Engineering → "工程硕士"。
  - country_zh: Hong Kong → "中国香港"；United Kingdom/UK → "英国"；United States/US → "美国"；Australia → "澳大利亚"；Singapore → "新加坡"；Mainland China → "中国大陆"。

⚠️ 中国大学中文名查表（**必须用公认中文名，不要机械翻译**）：
- Central South University → **中南大学**（不是"中央南大学"）
- Tsinghua University → 清华大学
- Peking University → 北京大学
- Fudan University → 复旦大学
- Shanghai Jiao Tong University → 上海交通大学
- Zhejiang University → 浙江大学
- Renmin University of China → 中国人民大学
- Sun Yat-sen University → 中山大学
- Beijing Normal University → 北京师范大学
- Wuhan University → 武汉大学
- Nanjing University → 南京大学
- Xi'an Jiaotong University → 西安交通大学
- Harbin Institute of Technology → 哈尔滨工业大学
- The University of Hong Kong / HKU → 香港大学
- The Chinese University of Hong Kong / CUHK → 香港中文大学
- The Hong Kong University of Science and Technology / HKUST → 香港科技大学
- The Hong Kong Polytechnic University / PolyU → 香港理工大学
- City University of Hong Kong / CityU → 香港城市大学
- Hong Kong Baptist University / HKBU → 香港浸会大学
- The Education University of Hong Kong / EdUHK → 香港教育大学
- Lingnan University → 岭南大学
- 不在上表里的中国大学，要先想这个学校的**官方中文名**再写；想不出来就用 null（在 conditions / details 里也保留 null 或写英文原名），**绝不**机械直译。

英文 → 中文翻译陷阱（不要按字面翻译）：
英文 → 中文翻译陷阱（不要按字面翻译）：
- 提到外国学校或机构名时，先用其公认中文名，没有就保留英文。
- 不要把 "X College" 永远翻成 "X 学院"；很多 College 实际叫 "学院" 或 "大学"。Imperial College London → 帝国理工学院。
- "School of X" 在大学语境是"X 学院"或"学系"。

- **英文规范化**：如果 offer 把学校或专业名写成全大写（如 "THE HONG KONG POLYTECHNIC UNIVERSITY" / "MSC SUSTAINABLE ENERGY"），抽取到 school / program 字段时**必须规范化为 Title Case**："The Hong Kong Polytechnic University" / "MSc Sustainable Energy"。常见缩写保持原样大写：MSc, MA, MBA, PhD, BSc, BA, MEng, MFA, LLM, MPhil, USA, UK, HK, MIT, NUS。

申请人姓名 (applicant_name)：
- 从 offer 上抽取被录取学生的姓名。常见位置：
  - 信件抬头 "Dear [Name]," / "Dear Mr./Ms. [Name],"
  - "Applicant Name: [Name]"
  - 中文：抬头 "亲爱的 [姓名]" / "[姓名] 同学" / 申请人姓名栏
  - 香港 / 台湾常见格式 "Applicant Name: Li Jun (李俊)"
- **优先级**：完整中文姓名 > 中文名字（即使是同一人英文名后括号里的中文）> 英文姓名。
- 多语形式如 "Li Jun (李俊)" → 取 "李俊"（不带括号、不带英文部分）。
- 全大写英文名（"LI JUN"）→ 规范化为 Title Case "Li Jun"。
- **去掉敬称**（Mr. / Ms. / Mrs. / Dr. / Prof. / 先生 / 女士 / 同学），只保留姓名本身。
- 如果 offer 仅写 "Dear Student" / "Dear Applicant" 这种泛称，applicant_name 设为 null。
- 找不到就 null，**不要编造**。

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

⛔ conditions 严禁项（常见错误）：
- ❌ **不要**把"完成本项目 / 在 X 大学完成 X 硕士 / 须满足以下所有要求"这种**元条件 / 总括语**当作一条 condition。这只是 offer 在介绍后续条件清单时的过渡句，不是学生要满足的具体条件。conditions[] 只列**实质性的资格 / 学位 / 文件 / 成绩**。
- ❌ 不要把任何"接受 offer / 缴纳留位费 / 提交缴费凭证"放进 conditions（它们一律是 must_do）。

⚠️ conditions[] OR 选项规则（极易丢失，必须遵守）：
当 offer 同一项材料给出**多种可接受的格式 / 来源**（A 或 B 或 C）时，**必须**把它们**合并成一条 condition**，并在 details 里完整列出所有选项。**绝对不要**只写其中一个选项，也不要把同一项材料的不同选项拆成多条 conditions。

✅ 正确（HKU offer 实际成绩单条款的对照）：
{
  "item": "提交官方最终成绩单",
  "details": "可任选其一：\n(A) 由所在院校注册处签发的英文版官方成绩单原件，须包含完整修课记录、各科考试结果、总体成绩、学位授予日期；非英文文件须附经认证的英文翻译。\n(B) 仅适用于中国大陆学历：由 CHSI 或经教育部授权的第三方机构出具的中英双语《中国高等教育学生学籍/学历认证报告》（《高等学校学生成绩单在线验证报告》），验证有效期至少 6 个月（或选最长有效期）。",
  "deadline": "2026-07-31"
}

✅ 正确（HKU offer 实际学位 / 毕业证条款）：
{
  "item": "提交学位证书及毕业证书",
  "details": "可任选其一：\n(A) 学位证书 + 毕业证书原件（英文版，或非英文版本附经认证的英文翻译）。\n(B) 仅适用于中国大陆学历：学信网 (CHSI) 或教育部授权机构出具的中英双语《高等教育学位证书在线验证报告》和《高等教育学历证书在线验证报告》，验证有效期至少 6 个月。",
  "deadline": "2026-07-31"
}

❌ 错误写法（用户已反馈）：
- 把 (A) 写进 #3 transcript、(B) 写进 #4 degree —— 这样学生不知道哪条适用于自己。
- 只写 (A) 不写 (B)，或反过来 —— 漏选项。
- 把 #3 #4 拆成 4 条 conditions（每个选项一条）—— 同一项材料应合并。

- must_do[].action **只描述要做什么，不要在 action 里嵌入日期**：
  ✅ offer 写 "Complete programme registration by 31 August 2026"
     → action="完成在线项目注册"，deadline="2026-08-31"
  ✅ offer 写 "Submit documents within 2 weeks of receiving this offer"
     → action="在 2 周内提交资格审核所需文件"（**相对时间**保留在 action 里，因为没有具体日期），deadline=null
  ❌ "在 2026-08-31 前完成在线项目注册"（日期不应嵌入 action）
- ⚠️ 关键：把日期**挪到 deadline**，**不是把日期丢掉**。如果 offer 写了 "by 31 August 2026"，你应该把 "2026-08-31" 填到 deadline；**绝不允许**把日期从 action 删掉之后让 deadline 也是 null。
- ⚠️ **明令禁止使用以下填充语**（这些是没有信息量的废话）：
  ❌ "在指定时间内…"
  ❌ "按规定时间…"
  ❌ "在限期内…"
  ❌ "在要求时间…"
  ❌ "by the prescribed time / by the due date / by the scheduled date"（中文化时不要意译为"在指定时间内"）
  如果你确实在 offer 上找不到具体日期或相对期限，请在 action 里写明："完成项目注册（offer 未给具体截止日，请查官网）"，并把 deadline 设为 null。
- 涉及金额可以写在 action 里（"缴纳留位费 HK$102,400"），但**日期一律只放 deadline 字段**。

⛔ 最重要规则：时间信息绝不丢失（产出 JSON 前**必须自检**）：
- 在最终输出 JSON 之前，**扫描整份 offer 原文**，列出每一个时间相关字符串：
  - 具体日期（"31 August 2026"、"19 Mar 2026"、"Aug 31, 2026"、"2026-08-31" 等）
  - 相对期限（"within 2 weeks"、"由 offer 起 2 周内"、"5 working days"、"30 days from..."）
  - 学期 / 学年（"Semester 1 of 2026/27"）
- **每一个具体日期**都必须出现在某个字段的 deadline 中（must_do.deadline / conditions.deadline / key_dates.date）。**漏掉任何一个具体日期都属于严重错误**。
- 一份合格的输出，应该让用户仅看抽取结果就能知道"我什么时候要做什么"，而不需要再回去翻 offer 原文。

币种 (currency) — 严格白名单:
- **必须**输出下面 10 个三字母 ISO 代码之一，不允许任何其它写法：
  HKD（港币）/ USD（美元）/ GBP（英镑）/ EUR（欧元）/ CNY（人民币）
  SGD（新加坡元）/ AUD（澳元）/ CAD（加元）/ JPY（日元）/ KRW（韩元）
- ❌ **绝对不要**输出 "RMB" / "Yuan" / "元" / "人民币" / "HK$" / "$" / "美金" / "港纸" / "Pounds" / "欧元" / "新币" / "澳币" / "韩币" / "$AUD" / "HK Dollar" 等任何非 ISO 写法。
- 常见映射（offer 原文里的写法 → 你应该输出的代码）：
  · "RMB" / "Yuan" / "元" / "人民币" / "￥" / "¥" + 中文金额 → CNY
  · "HK$" / "HKD$" / "港币" / "港纸" / "Hong Kong Dollar" → HKD
  · "$" / "US$" / "USD$" / "美金" / "美元" / "US Dollar" → USD
  · "£" / "GBP£" / "英镑" / "Pounds Sterling" / "British Pound" → GBP
  · "€" / "EUR€" / "欧元" / "Euros" → EUR
  · "S$" / "SG$" / "Singapore Dollar" / "新币" / "新加坡元" → SGD
  · "A$" / "AU$" / "AUD$" / "Aussie Dollar" / "澳元" / "澳币" → AUD
  · "C$" / "CA$" / "Canadian Dollar" / "加元" / "加币" → CAD
  · "JP¥" / "Japanese Yen" / "日元" / "日円" → JPY
  · "₩" / "Korean Won" / "韩元" / "韩币" / "원" → KRW
- "$" 单独出现时**必须**根据上下文判断（offer 学校所在国 / 文档其它地方的国家代码 / 抬头）：美国学校 → USD；港校 → HKD；澳校 → AUD；加校 → CAD；新校 → SGD。判断不出来时**优先用学校所在地**的币种。
- 如果 offer 上的币种**完全不在**上述 10 个里（极罕见，比如瑞士法郎、瑞典克朗），把 currency 字段设为 null（不要硬塞一个最近的代码），并在 info_gaps 里加一句"币种 [原文] 不在常见 10 种之内，请人工确认"。

学费抽取（**严格按以下优先级**，从高到低）：

优先级 1 — offer 上**明确写出了"项目总学费"数字** → 直接采用，is_estimate=false：
- 关键词："Composition fee of programme"、"Total Programme Tuition / Fee"、"Programme Fee"、"学费总额"、"全程学费"、"项目总学费"、"Total tuition"。
- ⚠️ **分期付款 ≠ 不可靠**："(payable in 3 instalments)" / "to be paid in three equal instalments" / "分 3 期缴纳" 描述**付款方式**，不影响总额的真实性。如果 offer 给了 total，**仍然采用 total**。
- 例子 1（来自真实 HKUST offer）：
  "Composition fee of programme: HK$420,000 (provisional and to be paid in three equal instalments) for 84 credit-units"
  → tuition = { amount: 420000, currency: "HKD", period: "total", is_estimate: false, note: "依据 offer 公布的项目总学费，分 3 期缴纳" }
- 例子 2： "Programme Fee: USD 80,000 in total" → amount = 80000, period = "total", is_estimate = false
- 例子 3： "学费总额：人民币 38 万元" → amount = 380000, currency = "CNY", period = "total", is_estimate = false

优先级 2 — offer 上**明确写**"按学分单价 + 项目总学分"，**且单价不在 Debit Note / 首期账单注释里** → 自己相乘，is_estimate=true：
- 例子："Tuition: HK$13,600 per credit, 84 credits in total"（写在项目费用总览段落里）
  → amount = 84 × 13600 = 1142400, is_estimate = true, note = "84 学分 × HK$13,600（依据 offer 估算）"

优先级 3 — offer 上的学费**仅来自 Debit Note / 首期账单 / 单学期金额** → tuition = null，让研究步骤补全：
- 例子（PolyU 那种）："Note on Tuition Fee: this debit note is calculated as 12 credits × HK$8,500/credit"
  → tuition = null, info_gaps 加一条 "学费仅显示首期账单折算价，请到学校官网查询正式费率"

优先级 4 — offer 完全没提学费 → tuition = null + info_gaps "学费未在 offer 上明确列出，请到 [学校] 官网查询"。

**关键判断技巧（防止把优先级 1 误判成 3）**：
- "分期付款 / instalment / 三期支付 / spread over X payments" = 付款方式说明，**不影响**总额真实性。
- "Debit Note 1: 12 credits × $X" / "Note on Tuition Fee" 注释段 = **首期账单临时折算价**，不可靠。
- 区分点：数字**前后是否给出了"项目总额"**？给了就是优先级 1；只有按学分单价、首期金额，没有总额数字，才是优先级 3。
- 优先级 1 是最常见也最高优先的情况。当 offer 同时给"总额 + 分期"，**永远选总额**，绝不要把它判成 null。

留位费 / Caution Money（沿用之前规则）：
- "Caution Money" / "留位费" / "Acceptance Deposit" / "Enrolment Deposit" / "Seat Deposit" 一律放 fees.deposit，不要塞进 tuition。

fees.deposit 的语义（沿用之前规则）：
- fees.deposit 的含义是"为了确认录取、必须在 deposit_deadline 之前缴纳的总金额"——也就是中介或学生口头说的"留位费 / 接受 offer 要交多少钱"。
- 如果 offer 上的"Debit Note 1 / 首期账单 / Initial Payment"包含若干小项（caution money + tuition first installment + 其它 fees），fees.deposit.amount 应该是它们的**合计 (Total Fee)**，而不是其中某一行。
- 例子：PolyU offer 的 Debit Note 1 写 "Caution Money 400 + Tuition fee 102,000 = Total 102,400, Payment Deadline 19-Mar-2026"，则 fees.deposit = { amount: 102400, currency: "HKD", note: "Caution Money 400 + 首期学费 102,000" }，并在 key_dates 中加 deposit_deadline=2026-03-19，在 must_do 中加高优先级"在 2026-03-19 前缴纳 HK$102,400 以确认录取"。
- 如果 offer 只有一个独立的 "refundable deposit" 数字（不含首期学费），那 fees.deposit 就是这个独立数字。

⚠️ **留位费不退还的提醒（极易遗漏，必须保留）**：
- 几乎所有 offer 都会写一句类似 "Fees once paid are non-refundable and non-transferable" / "已缴款项概不退还" / "deposit will not be refunded except for failure to fulfil conditions" —— 这种警告**必须**反映在两处之一：
  (a) fees.deposit.note 里加上 "已缴款项不退还"
  (b) notes[] 里加一条 "已缴留位费一律不退还也不可转让，除非未能满足录取条件"
- 学生第一次看 offer 时会以为留位费可以退（因为字面上是"押金"），所以这条警告**绝对不能省略**。即使 offer 只是简短一笔带过，也要忠实保留。

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
- 日期归一到 YYYY-MM-DD。"within 2 weeks" 这类无法解析就 null。

🚨🚨🚨 输出 JSON **之前**必须逐项确认（自检清单） 🚨🚨🚨
逐条对照下方清单。**任何一项遗漏 offer 上明明写着的内容都属于严重错误**。

☐ 1. school_zh 用的是该校**公认中文名**，不是机械字面翻译。
     - "Central South University" → "中南大学" ✅，**不是** "中央南大学" ❌
     - 不在中文名查表里、且想不出公认中文名时 —— **保留 null，不要硬翻**。

☐ 2. applicant_name 已抽（中文优先；"Mr. Wang Chenchen" → "Wang Chenchen"）。

☐ 3. faculty_zh 已抽（如 Faculty of Engineering → "工程学院"）。

☐ 4. student_category 已抽（Non-local student / 本地学生 等，offer 上有就一定要填）。

☐ 5. **每条 condition 的 details 字段已填完整**：
     - 如果 offer 同段落给了**学历认证 / 验证报告**的具体规格 → 必须把"学信网中英双语《学位证书在线验证报告》/《学历证书电子注册备案表》/《高等学校学生成绩单在线验证报告》、6 个月有效期、由教育部授权机构出具"等细节**逐字逐项**写进 details，不能简化为"附英文翻译"或"做认证"。
     - 如果 offer 给了**语言成绩具体分数**（TOEFL ≥ 80 iBT / IELTS ≥ 6.0 单项 ≥ 5.5、考试代码 9671、两年内有效、由考试机构直送）→ 必须**全部**写进对应 condition.details。
     - 写 "提交语言成绩" 而不写具体分数 = 错误。
     - 当 offer 给"OR 选项"（如成绩单可选官方原件 OR 学信网验证报告）时，**两个选项都必须**列在同一条 condition 的 details 里（参见前面 OR 选项示例）。漏掉任一选项 = 错误。

☐ 5b. **conditions[] 不含元条件 / 过渡句**：
     - "在 X 大学完成 X 硕士项目"、"须满足以下所有要求"、"录取条件如下" 这类**不是**具体条件，应直接从 conditions[] 中删掉。conditions[] 第一条必须是真实的资格 / 文件 / 学位要求。

☐ 6. **每条 must_do 的 details 字段已填完整**：
     - 如果 offer 给了上传 / 缴费的 URL → 写进 details。
     - 如果首期付款是 "HK$X = 首期学费 + 留位费 + 学生活动费" 这种合计 → details 里写明金额构成。
     - 如果 offer 写了"逾期视为放弃录取" / "款项不退" → 必须写进 details 或 notes[]。

☐ 7. **notes[] 数组已抽**：扫一遍 offer 的 "Notes on..." / "Important Notes" / "Authenticity" / "Visa Arrangement" / "Concurrent Registration" / "Refund Policy" / "Caution Money is non-refundable" 等所有附加说明段落 —— **每条**都要单独成为一条 note，不能合并、不能省略。

☐ 8. **留位费不退还的提醒**：fees.deposit.note 或 notes[] 至少有一处说"已缴款项不退还也不可转让，除非未能满足录取条件"（前提是 offer 上确实写了类似的话；如果 offer 没写就不要编造）。

☐ 9. 学费抽取符合优先级（offer 明示 total → 直接用，分期不影响）。

☐ 10. 每个具体日期都已落到某个 deadline / date 字段，没有日期被丢弃。

☐ 11. action / item 文本里**没有**填充语 ("在指定时间内" / "按规定时间" / "by the prescribed time")。

☐ 12. **summary 已写、达到 250-350 字、且把上面 conditions / must_do / notes 任何字段会漏掉的细节都补进去了**——如果只有 conditions 列表能告诉学生这份 offer 的全部，就不需要 summary；现在需要 summary 是因为它要兜住所有结构化字段塞不下的内容。光抽好结构化字段、summary 写两句客套话 = 严重错误。

如果以上任何一项你只做了一半（例如填了 conditions 但没填 details，或抽了部分 notes 但漏了"不退款"和"Concurrent Registration"），那就回去补全再输出。`;

export interface ExtractOptions {
  apiKey: string;
  provider?: Provider;
  model?: string;
  signal?: AbortSignal;
  /** Called when the chain falls back to a different model or sleeps for a
   * retry, so the UI can keep the user informed instead of looking frozen. */
  onProgress?: (message: string) => void;
}

/** Bumping this string invalidates every cached extraction so users pick up
 * a new prompt immediately without manually clearing storage. Bump whenever
 * SYSTEM_PROMPT changes in a way that would yield a meaningfully different
 * output (new field, stricter rules, etc.). */
export const PROMPT_VERSION = "v8-verified-source";

/** Build the L2 (extraction) cache key. Includes the provider + model so
 * different LLM combos don't share — picking a different provider should
 * mean a fresh extraction, not a stale cached result from a previous one.
 * Bumping PROMPT_VERSION still invalidates the whole cache as a wholesale
 * eviction. */
export function extractionCacheKey(
  fileHash: string,
  provider: Provider,
  model: string,
): string {
  return `${fileHash}:${PROMPT_VERSION}:${provider}:${model}`;
}

/** HTTP statuses that mean "try again later or with a different model". */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_MODEL = 2;

class TransientLLMError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "TransientLLMError";
  }
}

function isTransientError(err: unknown): boolean {
  if (err instanceof TransientLLMError) return true;
  // fetch() throws TypeError on network failure / DNS / CORS preflight
  if (
    err instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(err.message)
  ) {
    return true;
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Run the LLM extraction. Cache lookups + writes are now the *caller's*
 * responsibility (App.tsx) so the loading-bar UX can branch on cache-hit
 * before kicking off any work. extractOffer always calls the model.
 */
export async function extractOffer(
  input: ParsedInput,
  opts: ExtractOptions
): Promise<ExtractedOffer> {
  const provider = opts.provider ?? DEFAULT_PROVIDER;
  const config = PROVIDERS[provider];
  const userModel = opts.model || config.defaultModel;

  // Try the user's chosen model first, then escalate through siblings on the
  // same provider when the chosen one is overloaded / rate-limited. Each model
  // sits in its own quota bucket (e.g. gemini-2.5-flash vs flash-lite), so this
  // genuinely buys availability without changing the user's API key.
  const fallbackChain = [
    userModel,
    ...config.models.map((m) => m.id).filter((m) => m !== userModel),
  ];

  let lastError: unknown = null;
  for (let i = 0; i < fallbackChain.length; i++) {
    const model = fallbackChain[i];
    if (i > 0) {
      const label = config.models.find((m) => m.id === model)?.label ?? model;
      opts.onProgress?.(`上一个模型暂不可用，已切到 ${label}…`);
    }
    try {
      return await extractWithRetry(input, opts, provider, config, model);
    } catch (err) {
      lastError = err;
      if (!isTransientError(err)) throw err;
      // try the next sibling model
    }
  }

  if (lastError instanceof TransientLLMError) {
    throw new Error(
      `${PROVIDERS[provider] === PROVIDERS.google ? "Google AI Studio" : "OpenRouter"} 上能用的模型都暂时拥堵或限流（最后状态 ${lastError.status}）。请稍后重试，或在右上角「设置」中换一家服务商。`,
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All models exhausted");
}

async function extractWithRetry(
  input: ParsedInput,
  opts: ExtractOptions,
  provider: Provider,
  config: ProviderConfig,
  model: string,
): Promise<ExtractedOffer> {
  let delayMs = 800;
  for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
    try {
      return await extractOnce(input, opts, provider, config, model);
    } catch (err) {
      if (!isTransientError(err) || attempt === MAX_RETRIES_PER_MODEL) {
        throw err;
      }
      const wait = delayMs + Math.floor(Math.random() * 250);
      const status =
        err instanceof TransientLLMError ? `${err.status} ` : "";
      opts.onProgress?.(`${status}稍等再试…（${Math.round(wait / 100) / 10}s）`);
      await sleep(wait, opts.signal);
      delayMs *= 2;
    }
  }
  throw new Error("unreachable");
}

async function extractOnce(
  input: ParsedInput,
  opts: ExtractOptions,
  provider: Provider,
  config: ProviderConfig,
  model: string,
): Promise<ExtractedOffer> {
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

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0,
  };
  // Per-provider quirks: see ProviderConfig comments above and the
  // 智谱 entry in PROVIDERS for why these are flagged off there.
  if (config.jsonMode !== false) {
    requestBody.response_format = { type: "json_object" };
  }
  if (config.greedyTopP !== false) {
    requestBody.top_p = 0;
  }

  const res = await fetch(config.endpoint, {
    method: "POST",
    signal: opts.signal,
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "API key 无效或被拒绝。请在右上角「设置」中确认 key 正确，并已启用对应模型权限。",
      );
    }
    if (RETRYABLE_STATUS.has(res.status)) {
      const reason =
        res.status === 429
          ? "额度或并发限流"
          : res.status === 503
          ? "模型当前拥堵"
          : `临时错误 ${res.status}`;
      throw new TransientLLMError(
        res.status,
        `${reason}（${provider} / ${model}）`,
      );
    }
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    console.error("[OfferLens] LLM returned empty content", {
      provider,
      model,
      response: json,
    });
    recordExtractionLog({
      provider,
      model,
      looksOk: false,
      rawContent: JSON.stringify(json).slice(0, 6000),
      normalized: null,
    });
    throw new Error("LLM returned empty content");
  }

  const parsed = safeJsonParse(content);
  const normalized = normalizeExtracted(parsed);
  const looksOk =
    normalized.school !== "Unknown school" &&
    !!normalized.school &&
    !!normalized.program;

  // Always record — both the failure path and the success path. The
  // debug button shows the most recent few; users hand this to support
  // when an extraction looked wrong, without needing DevTools.
  recordExtractionLog({
    provider,
    model,
    looksOk,
    rawContent: content,
    normalized,
  });

  if (!looksOk) {
    console.warn(
      "[OfferLens] Extraction returned without a school name. Raw response below — paste this if reporting a bug.",
    );
    console.warn("provider/model:", provider, model);
    console.warn("raw content:", content);
    console.warn("parsed JSON:", parsed);
    console.warn("normalized:", normalized);
  }

  return normalized;
}

function safeJsonParse(text: string): unknown {
  // Try strict parse first.
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  // Some models wrap the JSON in ```json ... ``` despite the system prompt
  // forbidding markdown — peel the fence and try again.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through to repair */
    }
  }
  // Slice down to the outermost {...} window in case there's stray prose.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  const sliced =
    first >= 0 && last > first ? text.slice(first, last + 1) : text;
  // Last resort: jsonrepair handles the typical LLM mistakes that bite us
  // with the long free-form `summary` field — unescaped quotes inside
  // strings, raw newlines, single quotes, trailing commas, etc.
  return JSON.parse(jsonrepair(sliced));
}

function normalizeExtracted(raw: unknown): ExtractedOffer {
  // Smaller multimodal models (notably GLM-4V-Flash) sometimes wrap their
  // output in a JSON array — `[{...real fields...}, {...garbage...}]` — even
  // when the prompt explicitly asks for a single object. Take the first
  // element if it looks like an offer-shaped object so we don't wholesale
  // fall back to "Unknown school" when there's salvageable data.
  let candidate: unknown = raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (
      first &&
      typeof first === "object" &&
      !Array.isArray(first) &&
      typeof (first as { school?: unknown }).school === "string"
    ) {
      candidate = first;
    }
  }
  const r = candidate as Partial<ExtractedOffer> | null | undefined;
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
    applicant_name: r?.applicant_name ?? undefined,
    faculty: r?.faculty ?? undefined,
    faculty_zh: r?.faculty_zh ?? undefined,
    student_category: r?.student_category ?? undefined,
    term_start_text: r?.term_start_text ?? undefined,
    key_dates: Array.isArray(r?.key_dates) ? r!.key_dates : [],
    fees: normalizeFees(r?.fees),
    conditions: Array.isArray(r?.conditions)
      ? (r!.conditions as Condition[])
          .map((c) => ({
            ...c,
            item: stripMarkdown(c?.item),
            details: c?.details ? stripMarkdown(c.details) : c?.details,
          }))
          .filter((c) => !!c.item)
      : [],
    must_do: Array.isArray(r?.must_do)
      ? (r!.must_do as MustDo[])
          .map((m) => ({
            ...m,
            action: stripMarkdown(m?.action),
            details: m?.details ? stripMarkdown(m.details) : m?.details,
          }))
          .filter((m) => !!m.action)
      : [],
    raw_highlights: Array.isArray(r?.raw_highlights) ? r!.raw_highlights : [],
    notes: Array.isArray(r?.notes)
      ? r!.notes
          .filter((s): s is string => typeof s === "string" && !!s.trim())
          .map(stripMarkdown)
          .filter(Boolean)
      : [],
    info_gaps: Array.isArray(r?.info_gaps)
      ? r!.info_gaps
          .filter((s): s is string => typeof s === "string" && !!s.trim())
          .map(stripMarkdown)
          .filter(Boolean)
      : [],
    summary:
      typeof r?.summary === "string" && r!.summary.trim()
        ? r!.summary.trim()
        : undefined,
    // Fresh extractions always start with no researched fields — only
    // applyResearch promotes a field into this set later.
    researched_fields: [],
  };
  out.info_gaps = pruneInfoGaps(out);
  return out;
}

/**
 * Heuristic: does the program / program_zh fields contain a recognizable
 * degree marker? If both languages are missing one, we treat the program
 * as incomplete and let researchOffer go look up the official name.
 * Used by App.tsx to decide whether to trigger the research step.
 */
const EN_DEGREE_RE =
  /\b(Master|Bachelor|Doctor(?:ate|ial)?|PhD|MPhil|MSc|MA|MBA|BSc|BA|BBA|MEng|BEng|MFA|LLM|LLB|MPP|MEd|EdD|JD|DPhil|EngD|MArch|MPH|MAcc|MFin|MIM|MIS|MComm|MRes)\b/i;
const ZH_DEGREE_RE = /(硕士|博士|学士|工学|理学|文学|商学|教育学|哲学|医学|法学|管理学|工程师|本科|研究生)/;

export function programIsComplete(offer: ExtractedOffer): boolean {
  const en = offer.program ?? "";
  const zh = offer.program_zh ?? "";
  // Both surfaces (English original + Chinese translation) need a degree
  // marker so the share card never shows a degree-less subtitle.
  return EN_DEGREE_RE.test(en) && ZH_DEGREE_RE.test(zh);
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
/**
 * Token set used to verify a source URL actually belongs to the school
 * being researched. Mixes:
 *   - Significant words from the school name (length ≥ 4)
 *   - Acronym from initials of non-stop words (handles UCL / LSE / ICL)
 *   - Reordered "X of Y" → "Y X" acronym (handles HKU = Hong Kong
 *     University, despite the offer writing "The University of Hong
 *     Kong" with the words in the other order)
 */
function extractSchoolTokens(name: string): string[] {
  const STOP = new Set([
    "the", "of", "in", "for", "at", "on", "and", "an", "a",
  ]);
  const all = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const nonStop = all.filter((w) => !STOP.has(w));

  const tokens = new Set<string>();
  for (const w of nonStop) {
    if (w.length >= 4) tokens.add(w);
  }
  if (nonStop.length >= 2) {
    tokens.add(nonStop.map((w) => w[0]).join(""));
  }
  // Reorder around "of": "X of Y" → "Y X" so HKU = "Hong Kong [Univ]"
  // not "Univ Hong Kong".
  const ofIdx = all.indexOf("of");
  if (ofIdx > 0 && ofIdx < all.length - 1) {
    const before = all.slice(0, ofIdx).filter((w) => !STOP.has(w));
    const after = all.slice(ofIdx + 1).filter((w) => !STOP.has(w));
    if (before.length && after.length) {
      tokens.add([...after, ...before].map((w) => w[0]).join(""));
    }
  }
  return Array.from(tokens).filter((t) => t.length >= 3);
}

/** True when `url`'s host plausibly belongs to the school. Hard-rejects
 * Google grounding redirect domains (those URLs are mediator links, not
 * real destinations) and any URL whose host shares no token with the
 * school's name. */
function hostMatchesSchool(url: string, tokens: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (
    host === "google.com" ||
    host.endsWith(".google.com") ||
    host.endsWith(".googleusercontent.com") ||
    host.includes("vertexaisearch")
  ) {
    return false;
  }
  return tokens.some((t) => host.includes(t));
}

export interface ResearchResult {
  tuition?: NonNullable<ExtractedOffer["fees"]>["tuition"];
  scholarship?: NonNullable<ExtractedOffer["fees"]>["scholarship"];
  duration?: string;
  /** Full programme name with degree type, looked up from the school's
   * official programme listing page. Filled in only when the extraction's
   * program is bare (no degree marker like "Master", "MSc", "PhD", etc.). */
  program?: { en?: string; zh?: string };
  sources: string[];
}

const RESEARCH_SUPPORTED_MODEL = "gemini-2.5-flash";

export async function researchOffer(
  offer: ExtractedOffer,
  opts: { apiKey: string; signal?: AbortSignal },
): Promise<ResearchResult | null> {
  const termStart = offer.key_dates?.find((k) => k.type === "term_start")?.date;
  const programNeedsLookup = !programIsComplete(offer);
  const prompt = `用户拿到了一份 ${offer.school} 的录取通知，但 offer 上有些关键信息不全，需要你访问学校官方网站补全。

学校：${offer.school}
项目（offer 原文）：${offer.program}${offer.degree ? ` (${offer.degree})` : ""}
项目中文名（已知）：${offer.program_zh ?? "未知"}
学制：${offer.duration ?? "未知"}
入学时间：${termStart ?? "未知"}
专业名是否已含学位：${programNeedsLookup ? "否（请补全）" : "是"}

请补全以下字段。规则：
1. **只能用学校官方网站**（如 .edu.hk、.edu、.ac.uk、.edu.au、.edu.cn 等学校自己的域名），不要用第三方留学网站、论坛、知乎、小红书等。
2. **绝对不要复用 offer 文件里写的 per-credit / 单学期 / 首期账单的金额**——那些通常是临时折算值。所有数字**必须**直接来自学校官网当前公布的费率页（"Tuition Fee" / "Programme Fee" / "Fees and Funding" 类页面）。
3. 如果官网公布"项目总学费 X"（如 "HK$530,400 per programme"），直接使用 X。
4. 如果官网只公布"per-credit Y"和"项目总学分要求 Z"，那么 amount = Z * Y；如果有 1-credit Academic Integrity 等明确不收学费的学分，请在乘法中扣除并在 note 里说明。
5. **特别留意可能的减免规则**——学分豁免、奖学金内置折扣、首学期减免、本地 vs 非本地费率差异。看到 "fee waiver / exempt / non-tuition / scholarship-discounted" 字样时必须读完整段并反映到 amount 或 note。
6. 学费必须明确币种，**只能**输出以下 10 个三字母 ISO 代码之一：HKD / USD / GBP / EUR / CNY / SGD / AUD / CAD / JPY / KRW。**不要**输出 "RMB" / "Yuan" / "元" / "$" / "¥" / "£" / "S$" 等非 ISO 写法。
7. 入学时间用于确认你查到的是该届新生的费率（如 2026/27 入学）。如果只能查到旧届费率，请在 note 里注明并返回 null amount，让用户自己核对。

🚫 **金额可信度（最高优先级，违反 = 严重错误）**：
8. 如果 Google Search 工具返回的搜索摘要片段里**没有**出现明确的金额数字（带货币单位的具体数字，如 "HK$420,000" / "£32,500"），tuition 和 scholarship 字段**必须**返回 null。
9. **绝对不要根据预训练数据推断金额**。"我记得 HKU CS 大概 30 万港币" / "类似项目通常 X" / "按平均水平估算" — 这些**全部禁止**。
10. **宁可返回 null，绝对不要凭印象填数字**。代码层会校验你给的 source URL 是否真属于该校域名——如果你乱填一个数字配一个不相关的 URL，校验失败后整个字段会被丢掉，相当于白做。
11. 你给的 source URL 必须是 Google Search 工具实际找到的页面之一，且 host 必须是该校自己的域名（hku.hk / polyu.edu.hk / ucl.ac.uk 等），不能是 collegevine / quora / mastersportal / topuniversities 这类第三方。

📚 **专业名补全（program）**：
- 当且仅当上面"专业名是否已含学位 = 否"时才需要查。已经完整了就在 program 字段返回 null。
- 去学校官网的 Programme List / Postgraduate Studies / Admissions 页面找这个专业的**官方完整名称**——必须含学位类型（Master of / MSc in / MA in / PhD in / 等）。
- 同时给出官方公布的中文名（学校的中英双语项目页通常都有）。学校没有公布中文名就用业界通用译法（如 "Master of Public Policy" → "公共政策硕士"）。
- ❌ 不要硬猜。如果官网项目页搜不到、或者搜到的名字也不含学位类型，program 返回 null。

请输出一段 JSON（包在 \`\`\`json 代码块里）：

{
  "tuition": { "amount": <number>, "currency": "<3-letter ISO>", "period": "total"|"year", "note": "<中文，说明依据，例如 '30 学分 × HK$8,500，依据 polyu.edu.hk 公布的 2026/27 入学费率'>", "source": "<具体页面 URL>" } | null,
  "duration": "<例如 '1.5 年' 或 '30 学分'>" | null,
  "scholarship": { "amount": <number>, "currency": "<ISO>", "note": "<中文条件说明>", "source": "<URL>" } | null,
  "program": { "en": "<例如 'Master of Public Policy'>", "zh": "<例如 '公共政策硕士'>" } | null
}

注意：
- 如果你找不到任何官网信息，所有字段都返回 null。
- 已经清楚的字段就不必再查，直接返回 null 即可。`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${RESEARCH_SUPPORTED_MODEL}:generateContent` +
    `?key=${encodeURIComponent(opts.apiKey)}`;

  const json = await researchFetchWithRetry(url, prompt, opts.signal);
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
    "";
  if (!text.trim()) return null;

  const parsed = safeJsonParse(text) as Partial<ResearchResult> | null;
  if (!parsed || typeof parsed !== "object") return null;

  // The model's freeform `source` URLs in the JSON are not trustworthy — it
  // tends to write a plausible-looking school path that 404s. Use only the
  // grounded URIs (URLs Google Search actually returned), AND filter them
  // by host to make sure we don't surface a Gemini grounding-redirect link
  // or a third-party page like collegevine / quora as if it were the
  // school's own page.
  const groundingChunks: { web?: { uri?: string; title?: string } }[] =
    json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundedSources = groundingChunks
    .map((c) => c.web?.uri)
    .filter((u): u is string => !!u);
  const schoolTokens = extractSchoolTokens(offer.school);
  // Pick the FIRST grounded URL whose host plausibly belongs to the
  // school. If none does, source is undefined — UI surfaces that as
  // "未找到可靠来源" rather than a broken link.
  const verifiedSource = groundedSources.find((url) =>
    hostMatchesSchool(url, schoolTokens),
  );

  // Validate the program payload — both languages, both must have content.
  let programOut: { en?: string; zh?: string } | undefined;
  if (parsed.program && typeof parsed.program === "object") {
    const en =
      typeof parsed.program.en === "string" && parsed.program.en.trim()
        ? parsed.program.en.trim()
        : undefined;
    const zh =
      typeof parsed.program.zh === "string" && parsed.program.zh.trim()
        ? parsed.program.zh.trim()
        : undefined;
    // Only accept the lookup if the proposed English name actually contains
    // a degree marker — that's the whole point of going to the website.
    if (en && EN_DEGREE_RE.test(en)) {
      programOut = { en, zh };
    }
  }

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
    program: programOut,
    sources: groundedSources,
  };
}

async function researchFetchWithRetry(
  url: string,
  prompt: string,
  signal?: AbortSignal,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let delayMs = 800;
  for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 },
        }),
      });
      if (res.ok) return await res.json();
      const body = await res.text();
      if (
        RETRYABLE_STATUS.has(res.status) &&
        attempt < MAX_RETRIES_PER_MODEL
      ) {
        throw new TransientLLMError(
          res.status,
          `Research transient (${res.status})`,
        );
      }
      throw new Error(
        `Research request failed (${res.status}): ${body.slice(0, 300)}`,
      );
    } catch (err) {
      if (
        (isTransientError(err)) &&
        attempt < MAX_RETRIES_PER_MODEL
      ) {
        await sleep(delayMs + Math.floor(Math.random() * 250), signal);
        delayMs *= 2;
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
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

/** ISO codes the UI knows how to format. Keep in sync with format.ts
 * CURRENCY_SYMBOLS and MoneyEditor's dropdown. */
export const CURRENCY_WHITELIST = [
  "HKD", "USD", "GBP", "EUR", "CNY",
  "SGD", "AUD", "CAD", "JPY", "KRW",
] as const;

/** Map common non-ISO writeups the model might leak through (despite the
 * prompt) to a canonical ISO code. Returns null when nothing matches. */
function coerceCurrency(raw: string): string | null {
  const norm = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!norm) return null;
  if ((CURRENCY_WHITELIST as readonly string[]).includes(norm)) return norm;
  // Common aliases the LLM tends to fall back on.
  const aliases: Record<string, string> = {
    RMB: "CNY",
    YUAN: "CNY",
    "人民币": "CNY",
    "元": "CNY",
    "￥": "CNY",
    "¥": "CNY",
    "HK$": "HKD",
    HKDOLLAR: "HKD",
    "HONGKONGDOLLAR": "HKD",
    "港币": "HKD",
    "港元": "HKD",
    "港纸": "HKD",
    "US$": "USD",
    USDOLLAR: "USD",
    "美元": "USD",
    "美金": "USD",
    "$": "USD",
    "£": "GBP",
    POUND: "GBP",
    POUNDS: "GBP",
    STERLING: "GBP",
    GBPOUND: "GBP",
    "英镑": "GBP",
    "€": "EUR",
    EURO: "EUR",
    EUROS: "EUR",
    "欧元": "EUR",
    "S$": "SGD",
    SGDOLLAR: "SGD",
    SINGAPOREDOLLAR: "SGD",
    "新加坡元": "SGD",
    "新币": "SGD",
    "A$": "AUD",
    "AU$": "AUD",
    AUDOLLAR: "AUD",
    AUSSIEDOLLAR: "AUD",
    AUSTRALIANDOLLAR: "AUD",
    "澳元": "AUD",
    "澳币": "AUD",
    "C$": "CAD",
    "CA$": "CAD",
    CANADIANDOLLAR: "CAD",
    "加元": "CAD",
    "加币": "CAD",
    "JP¥": "JPY",
    "JPY¥": "JPY",
    YEN: "JPY",
    JAPANESEYEN: "JPY",
    "日元": "JPY",
    "日円": "JPY",
    "₩": "KRW",
    WON: "KRW",
    KOREANWON: "KRW",
    "韩元": "KRW",
    "韩币": "KRW",
    "원": "KRW",
  };
  return aliases[norm] ?? null;
}

function cleanMoney<T extends { amount?: unknown; currency?: unknown }>(
  m: T | null | undefined,
): T | undefined {
  if (!m || typeof m !== "object") return undefined;
  if (typeof m.amount !== "number" || !Number.isFinite(m.amount)) return undefined;
  if (typeof m.currency !== "string" || !m.currency.trim()) return undefined;
  const canonical = coerceCurrency(m.currency);
  if (!canonical) return undefined;
  return { ...m, currency: canonical };
}

/** Pass each Money field of fees through the currency coercer so a model
 * that emits "RMB" / "$" / "人民币" still lands as a clean ISO code. */
function normalizeFees(
  fees: unknown,
): ExtractedOffer["fees"] | undefined {
  if (!fees || typeof fees !== "object") return undefined;
  const f = fees as Partial<NonNullable<ExtractedOffer["fees"]>>;
  function coerce<T extends { currency?: string } | undefined | null>(
    slot: T,
  ): T | undefined {
    if (!slot || typeof slot !== "object") return undefined;
    if (typeof slot.currency === "string") {
      const canonical = coerceCurrency(slot.currency);
      if (canonical) return { ...slot, currency: canonical };
    }
    return slot;
  }
  return {
    tuition: coerce(f.tuition),
    deposit: coerce(f.deposit),
    scholarship: coerce(f.scholarship),
    other: Array.isArray(f.other)
      ? (f.other.map(coerce).filter(Boolean) as NonNullable<typeof f.other>)
      : undefined,
  };
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
  // Track which fields the research step actually filled in. The UI uses
  // this set to render a "参考值 · 来自官网" trust label so the student
  // can tell offer-extracted numbers from school-website-looked-up ones.
  const researched = new Set<string>(merged.researched_fields ?? []);

  if (research.tuition) {
    const existing = merged.fees!.tuition;
    // Once the offer itself names a tuition number — even an annual
    // estimate or a "first installment" figure — that's the source of
    // truth the student wants to see. Research only fills the gap when
    // the offer has nothing.
    const offerProvidedAmount = !!existing && existing.amount > 0;
    const userVerified = existing?.manually_edited === true;
    if (!userVerified && !offerProvidedAmount) {
      merged.fees!.tuition = {
        ...research.tuition,
        is_partial: false,
        // Honest is_estimate: when researchOffer's host-verification
        // dropped the source URL (third-party / Google redirect / no
        // school-domain match), we have a number but no way to verify
        // where it came from. Keep the number, mark it as estimate so
        // UI shows the "参考值" treatment instead of the same weight
        // as a real offer-stated figure.
        is_estimate: !research.tuition.source,
      };
      researched.add("tuition");
    } else {
      // The offer itself supplied the number — make sure a previous run
      // hadn't marked it as "researched".
      researched.delete("tuition");
    }
  }
  if (research.scholarship && !merged.fees!.scholarship) {
    merged.fees!.scholarship = {
      ...research.scholarship,
      is_estimate: !research.scholarship.source,
    };
    researched.add("scholarship");
  }
  if (research.duration && !merged.duration) {
    merged.duration = research.duration;
    researched.add("duration");
  }
  // Only overwrite the program when the existing one is degree-less. This
  // keeps a perfectly-good extraction from being clobbered by a noisy
  // research lookup, while still rescuing the bare "Public Policy" cases.
  if (research.program?.en && !programIsComplete(merged)) {
    merged.program = research.program.en;
    if (research.program.zh) merged.program_zh = research.program.zh;
    researched.add("program");
  }
  merged.researched_fields = [...researched];
  merged.info_gaps = pruneInfoGaps(merged);
  return merged;
}
