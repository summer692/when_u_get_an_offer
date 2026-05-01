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
    "tuition":     { "amount": number, "currency": string, "period": "year"|"term"|"total", "note": string|null, "is_partial": boolean } | null,
    "deposit":     { "amount": number, "currency": string, "note": string|null } | null,
    "scholarship": { "amount": number, "currency": string, "note": string } | null
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

如果以上任何一项你只做了一半（例如填了 conditions 但没填 details，或抽了部分 notes 但漏了"不退款"和"Concurrent Registration"），那就回去补全再输出。`;

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
    if (res.status === 429) {
      throw new Error(
        `今日 ${provider === "google" ? "Google AI Studio" : "OpenRouter"} 免费层额度已用完。可在右上角「设置」中切到 Gemini 2.5 Flash-Lite（额度更高），或明天再试。`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "API key 无效或被拒绝。请在右上角「设置」中确认 key 正确，并已启用对应模型权限。",
      );
    }
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
    applicant_name: r?.applicant_name ?? undefined,
    faculty: r?.faculty ?? undefined,
    faculty_zh: r?.faculty_zh ?? undefined,
    student_category: r?.student_category ?? undefined,
    term_start_text: r?.term_start_text ?? undefined,
    key_dates: Array.isArray(r?.key_dates) ? r!.key_dates : [],
    fees: r?.fees ?? undefined,
    conditions: Array.isArray(r?.conditions) ? r!.conditions : [],
    must_do: Array.isArray(r?.must_do) ? r!.must_do : [],
    raw_highlights: Array.isArray(r?.raw_highlights) ? r!.raw_highlights : [],
    notes: Array.isArray(r?.notes)
      ? r!.notes.filter((s): s is string => typeof s === "string" && !!s.trim())
      : [],
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
    const existing = merged.fees!.tuition;
    // Don't overwrite values the user explicitly verified, or values the
    // offer itself stated authoritatively (no estimate / partial flags).
    const existingIsAuthoritative =
      existing &&
      existing.amount > 0 &&
      !existing.is_partial &&
      !existing.is_estimate &&
      !existing.manually_edited;
    const userVerified = existing?.manually_edited === true;
    if (!userVerified && !existingIsAuthoritative) {
      merged.fees!.tuition = {
        ...research.tuition,
        is_partial: false,
        is_estimate: false,
      };
    }
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
