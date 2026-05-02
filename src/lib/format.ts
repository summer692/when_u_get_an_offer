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
