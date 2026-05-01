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
  status: "required" | "optional" | "met";
  deadline?: string | null;
}

export interface MustDo {
  action: string;
  deadline?: string | null;
  priority: "high" | "medium" | "low";
}

export interface ExtractedOffer {
  school: string;
  program: string;
  degree?: string;
  country?: string;
  language?: string;
  /** Programme duration as written on the offer, e.g. "1.5 年", "2 years",
   * "30 credits". Optional but the LLM is instructed to always try. */
  duration?: string;
  key_dates: KeyDate[];
  fees?: Fees;
  conditions?: Condition[];
  must_do?: MustDo[];
  raw_highlights?: string[];
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
