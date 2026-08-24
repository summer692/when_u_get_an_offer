export type DateType =
  | "accept_deadline"
  | "deposit_deadline"
  | "term_start"
  | "tuition_deadline"
  | "document_deadline"
  | "other";

export interface KeyDate {
  type: DateType;
  date: string;
  label: string;
}

export interface Money {
  amount: number;
  currency: string;
  period?: "year" | "term" | "total";
  note?: string;
  /** True if this figure is only a portion of the real total (e.g. first
   * installment, per-credit billing, per-semester) and the user must look up
   * the full amount elsewhere. */
  is_partial?: boolean;
  /** True if this number was computed by the AI (e.g. credits × per-credit
   * rate) rather than read directly. The math may be right but miss
   * programme-specific waivers, so it should be shown as an estimate. */
  is_estimate?: boolean;
  /** True once the user has reviewed and saved this value manually. Renders
   * a "已校对" affordance and overrides the partial / estimate badges. */
  manually_edited?: boolean;
  /** URL of the source page when this number was looked up from the school's
   * official website rather than read directly off the offer. */
  source?: string;
}

export interface Fees {
  tuition?: Money;
  deposit?: Money;
  scholarship?: Money;
  other?: Money[];
}

export interface Condition {
  item: string;
  /** Optional extended description (acceptable formats, alternatives,
   * verification report types, validity windows, score requirements, code
   * numbers, source institutions, etc.). Multi-line allowed. */
  details?: string;
  status: "required" | "optional" | "met";
  deadline?: string | null;
}

export interface MustDo {
  action: string;
  /** Optional extended description (URL to use, what exactly to upload,
   * payment composition, contact email, etc.). Multi-line allowed. */
  details?: string;
  deadline?: string | null;
  /** Prevent deterministic extraction fixups from restoring a date the user
   * deliberately changed or cleared in the editor. */
  deadline_manually_edited?: boolean;
  priority: "high" | "medium" | "low";
}

/**
 * Provenance for the acceptance deadline. Captures whether we re-derived
 * it deterministically (good) or had to fall back to the LLM's value
 * because we couldn't (less good). Stored on the offer so the UI / debug
 * log can show *why* a date is the date.
 */
export interface DeadlineCalculation {
  /** Date we offset from. ISO YYYY-MM-DD or null. */
  base_date: string | null;
  /** Where the base date came from. */
  base_source: "offer_issue_date" | "accept_deadline" | "text_anchor" | null;
  /** Numeric offset, e.g. 28. */
  offset_value: number | null;
  /** Unit of the offset, normalized. */
  offset_unit: "days" | "weeks" | null;
  /** What we computed. ISO YYYY-MM-DD. May differ from the LLM's
   * key_dates entry — when so, the key_dates entry is overridden. */
  computed_date: string | null;
  /** Why we trust (or don't) the computed_date.
   * - "computed": math was clean, accept_deadline now reflects this
   * - "missing_base": found an offset phrase but no base date → no override
   * - "ambiguous": multiple offset phrases or non-calendar units → no override */
  confidence: "computed" | "missing_base" | "ambiguous";
}

export type CoverageStatus =
  | "stated_full"
  | "stated_partial"
  | "stated_estimate"
  | "stated_date"
  | "stated_term_only"
  | "stated"
  | "required_with_amount"
  | "required_no_amount"
  | "explicitly_none"
  | "absent";

/**
 * Derived coverage states. NOT emitted by the LLM — set by enrichCoverage
 * after cross-validating LLM coverage against extracted/inferred data.
 *
 * - rule_detected_but_missing: LLM said "absent" but a field-filling step
 *   (or the structured extraction itself) ended up with a value. Means
 *   the LLM was inconsistent or our inference recovered the data.
 * - conflict: LLM coverage explicitly contradicts the structured fields
 *   (e.g. coverage.deposit = "explicitly_none" yet fees.deposit has an
 *   amount). User may want to verify.
 * - unsupported: LLM gave a value but no text evidence supports it.
 *   Reserved for the future source_quote validator. */
type DerivedCoverageState =
  | "rule_detected_but_missing"
  | "conflict"
  | "unsupported";

/**
 * What the offer itself says about each topic, regardless of what the
 * extractor managed to populate. The single source of truth that drives
 * the "需要核实" / 卡片显示 / "Offer 原文未提供" labels — instead of us trying
 * to infer presence from output JSON shape.
 *
 * Filled by the LLM during extraction (using only the LLM-emitted states).
 * Then enrichCoverage may upgrade entries to derived states based on
 * cross-validation. Legacy offers without coverage fall back to
 * heuristics in computeInfoGaps.
 */
export interface Coverage {
  /** stated_full = 给出明确的项目总学费; stated_partial = 只有首期/单学期等;
   *  stated_estimate = 标注是估算/年度估算; absent = offer 完全没提学费.
   *  Plus derived states from enrichCoverage. */
  tuition:
    | "stated_full"
    | "stated_partial"
    | "stated_estimate"
    | "absent"
    | DerivedCoverageState;
  /** required_with_amount = offer 写了金额; required_no_amount = 说要交但没写金额;
   *  explicitly_none = 明确说"无需"; absent = offer 完全没提.
   *  Plus derived states from enrichCoverage. */
  deposit:
    | "required_with_amount"
    | "required_no_amount"
    | "explicitly_none"
    | "absent"
    | DerivedCoverageState;
  /** Whether the offer states a deposit deadline. Only meaningful when
   *  deposit is required_*. */
  deposit_deadline: "stated" | "absent" | DerivedCoverageState;
  /** stated_date = 完整 ISO 日期; stated_term_only = "2026 年秋" 这种; absent = 完全没提 */
  term_start:
    | "stated_date"
    | "stated_term_only"
    | "absent"
    | DerivedCoverageState;
  duration: "stated" | "absent" | DerivedCoverageState;
  accept_deadline: "stated" | "absent" | DerivedCoverageState;
}

export interface ExtractedOffer {
  school: string;
  /** 学校的常见中文名，如 "香港理工大学"。若没有公认中文名则缺省。 */
  school_zh?: string;
  program: string;
  /** 项目的中文名，如 "可持续能源理学硕士"。 */
  program_zh?: string;
  degree?: string;
  /** 学位中文名："硕士" / "学士" / "博士" / "工程硕士" 等。 */
  degree_zh?: string;
  country?: string;
  /** 国家 / 地区中文名："中国香港" / "英国" / "美国" 等。 */
  country_zh?: string;
  language?: string;
  /** Faculty / school within the university, e.g. "Faculty of Engineering"
   * → faculty_zh "工程学院". */
  faculty?: string;
  faculty_zh?: string;
  /** Student category mentioned on the offer, e.g. "Non-local student",
   * "International student", "本地学生". */
  student_category?: string;
  /** Programme duration as written on the offer, e.g. "1.5 年", "2 years",
   * "30 credits". Optional but the LLM is instructed to always try. */
  duration?: string;
  /** Recipient's name as it appears on the offer ("Dear X" / "Applicant
   * Name: X" / "亲爱的 X"). Chinese form preferred when both are given.
   * Used to personalize the greeting line. */
  applicant_name?: string;
  /** Human-readable Chinese description of when the programme starts, e.g.
   * "2026/27 学年第一学期" or "2026 年 9 月". Set even when no exact ISO date
   * is available — many offers only specify the academic year + semester. */
  term_start_text?: string;
  key_dates: KeyDate[];
  fees?: Fees;
  conditions?: Condition[];
  must_do?: MustDo[];
  raw_highlights?: string[];
  /** Important Chinese notes / remarks from the offer that the student must
   * read but easily overlook (material non-refundable, visa self-arrangement,
   * authenticity warning, concurrent registration ban, etc.). Each entry
   * is one self-contained Chinese sentence. */
  notes?: string[];
  /** Short Chinese notes describing critical info that is missing, partial,
   * or that the user should verify against the school's official website. */
  info_gaps?: string[];
  /** A 250–350 character Chinese narrative that reads the offer the way a
   * good agent would explain it to the student in a single breath. This is
   * NOT a list — it's prose, written to capture everything important the
   * student needs to know that the rigid schema would otherwise drop or
   * truncate (tone, conditional warnings, payment quirks, language of
   * instruction, special arrangements, scholarship strings attached, etc.). */
  summary?: string;
  /** Names of top-level fields whose value did NOT come from the offer
   * itself but was filled in by the researchOffer step (Gemini + grounded
   * web search against the school's site). Recognized values today:
   * "tuition", "scholarship", "duration". UI uses this to render a
   * "参考值 · 来自官网" trust label so the student can tell at a glance
   * which numbers were transcribed vs. inferred. */
  researched_fields?: string[];
  /** Per-topic coverage as reported by the LLM (what the OFFER said about
   * each topic, not what we managed to extract). Drives info_gaps without
   * us having to infer "did the offer mention X" from output shape. */
  coverage?: Coverage;
  /** Date the offer letter was issued, ISO YYYY-MM-DD. Used as the base
   * for deterministic deadline arithmetic (so we don't trust the LLM
   * to do the addition itself). */
  offer_issue_date?: string;
  /** Provenance + result of the deterministic acceptance-deadline
   * recomputation. Set by recomputeAcceptDeadline. */
  deadline_calculation?: DeadlineCalculation;
}

export interface Offer extends ExtractedOffer {
  id: string;
  created_at: number;
  updated_at: number;
  source_kind: "pdf" | "image" | "text" | "docx";
  source_name?: string;
  /** Per-field overrides for whether a field should appear in the exported
   * share card. Keyed by stable field path, e.g. "fees.tuition", "duration",
   * "conditions.0", "must_do.2", "notes.1". Absent key = use the default
   * (data-bearing fields visible, empty fields hidden). Stored as overrides
   * only so the share card stays sensible if the underlying data changes. */
  share_visibility?: Record<string, boolean>;
}

export type Provider = "google" | "openrouter" | "zhipu";

export interface Settings {
  provider?: Provider;
  /** Legacy single-key field. Kept for backward compatibility — new code
   * writes to apiKeys[provider] but still falls back to this when no
   * per-provider key has been saved yet. */
  apiKey?: string;
  /** API key per provider, so switching provider doesn't lose other keys. */
  apiKeys?: Partial<Record<Provider, string>>;
  model?: string;
  theme?: "system" | "light" | "dark";
  agencyName?: string;
  agencyLogo?: string;
}
