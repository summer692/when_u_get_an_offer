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

export function uuid(): string {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
