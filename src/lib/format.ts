import type { Money } from "./schema";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  CNY: "¥",
  HKD: "HK$",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
  KRW: "₩",
};

export function formatMoney(m: Money | null | undefined): string {
  if (!m) return "—";
  const sym = CURRENCY_SYMBOLS[m.currency?.toUpperCase()] ?? m.currency ?? "";
  const num = new Intl.NumberFormat("en-US").format(m.amount);
  const period =
    m.period === "year" ? " / 年" : m.period === "term" ? " / 学期" : "";
  return `${sym}${num}${period}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Parse a user-entered calendar date and return the canonical YYYY-MM-DD
 * value used by the offer schema. Separators may be typed as -, /, ., or
 * Chinese year/month/day characters. Empty and invalid values return null.
 */
export function parseEditableDate(
  input: string | null | undefined,
): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  const match = raw.match(
    /^(\d{4})(?:[-/.]|年)(\d{1,2})(?:[-/.]|月)(\d{1,2})(?:日)?$/,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1990 || year > 2100) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Keep free-form timing notes while canonicalizing complete dates. */
export function normalizeDeadlineInput(
  input: string | null | undefined,
): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  return parseEditableDate(raw) ?? raw;
}

/** Strip the markdown formatting tokens we sometimes see leaked into
 * user-visible text fields (action / item / note / details). Models
 * occasionally wrap an emphasized phrase in **bold** even when the
 * prompt forbids markdown — this returns plain text so the renderer
 * can apply consistent font weights without literal asterisks
 * showing through. */
export function stripMarkdown(s: string | undefined | null): string {
  if (!s) return "";
  return s
    // **bold** / __bold__
    .replace(/\*\*([^*]+?)\*\*/g, "$1")
    .replace(/__([^_]+?)__/g, "$1")
    // *italic* / _italic_ — only when surrounded by non-alphanumeric or boundaries
    .replace(/(^|[\s（(《"'])\*([^*\n]+?)\*(?=[\s）)》"'.,。，！？!?:;]|$)/g, "$1$2")
    .replace(/(^|[\s（(《"'])_([^_\n]+?)_(?=[\s）)》"'.,。，！？!?:;]|$)/g, "$1$2")
    // leading "- " / "* " bullet markers
    .replace(/^\s*[-*]\s+/gm, "")
    // leading "1. " / "1) " ordered markers
    .replace(/^\s*\d+[.)]\s+/gm, "")
    // leading "# " / "## " etc. headings
    .replace(/^\s*#{1,6}\s+/gm, "")
    // collapse stray triple+ asterisks/underscores
    .replace(/\*{2,}/g, "")
    .replace(/_{2,}/g, "")
    .trim();
}

export function uuid(): string {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** SHA-256 of the raw bytes of a File. Used as the L1 / L2 cache key —
 * stable across renders and exact (any byte change → new hash → fresh
 * extraction). */
export async function hashFileBytes(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of an arbitrary string. Used for hashing pasted text where
 * there's no File object to hash. */
export async function hashString(s: string): Promise<string> {
  const buffer = new TextEncoder().encode(s);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build the L3 (research) cache key by normalizing school + program names.
 * Same school written "The University of Hong Kong" / "the university of
 * hong kong " / "THE  UNIVERSITY OF HONG KONG" should all hit the same
 * row. Same for program with extra whitespace, casing, or punctuation. */
export function researchCacheKey(school: string, program: string): string {
  return `${normalizeForKey(school)}|${normalizeForKey(program)}`;
}

function normalizeForKey(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, " ")
    // Strip punctuation that doesn't carry meaning for matching.
    .replace(/[.,/\\;:!?'"`(){}\[\]<>·、，。：；！？「」『』《》（）]/g, "")
    .trim();
}
