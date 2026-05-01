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
  priority: "high" | "medium" | "low";
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
}

export interface Offer extends ExtractedOffer {
  id: string;
  created_at: number;
  updated_at: number;
  source_kind: "pdf" | "image" | "text" | "docx";
  source_name?: string;
}

export type Provider = "google" | "openrouter";

export interface Settings {
  provider?: Provider;
  apiKey?: string;
  model?: string;
  theme?: "system" | "light" | "dark";
  agencyName?: string;
  agencyLogo?: string;
}
