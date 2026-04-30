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
  key_dates: KeyDate[];
  fees?: Fees;
  conditions?: Condition[];
  must_do?: MustDo[];
  raw_highlights?: string[];
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
}
