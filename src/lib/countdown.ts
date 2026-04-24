import type { KeyDate, MustDo, Offer } from "./schema";

export interface UpcomingItem {
  offerId: string;
  school: string;
  label: string;
  date: string;
  daysLeft: number;
  priority: "high" | "medium" | "low";
}

const MS_DAY = 1000 * 60 * 60 * 24;

export function daysUntil(dateStr: string, now = new Date()): number {
  const target = new Date(dateStr + "T23:59:59");
  if (isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  const midnightNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return Math.ceil((target.getTime() - midnightNow) / MS_DAY);
}

export function collectUpcoming(offers: Offer[], limit = 3): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const offer of offers) {
    for (const kd of offer.key_dates ?? []) {
      if (!kd.date) continue;
      items.push({
        offerId: offer.id,
        school: offer.school,
        label: kd.label || labelForDateType(kd),
        date: kd.date,
        daysLeft: daysUntil(kd.date),
        priority: inferPriority(kd),
      });
    }
    for (const md of offer.must_do ?? []) {
      if (!md.deadline) continue;
      items.push({
        offerId: offer.id,
        school: offer.school,
        label: md.action,
        date: md.deadline,
        daysLeft: daysUntil(md.deadline),
        priority: md.priority,
      });
    }
  }

  return items
    .filter((i) => Number.isFinite(i.daysLeft))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, limit);
}

function labelForDateType(kd: KeyDate): string {
  switch (kd.type) {
    case "accept_deadline":
      return "接受 offer 截止";
    case "deposit_deadline":
      return "留位费截止";
    case "term_start":
      return "入学日期";
    case "tuition_deadline":
      return "学费截止";
    case "document_deadline":
      return "材料提交截止";
    default:
      return "重要日期";
  }
}

function inferPriority(kd: KeyDate): "high" | "medium" | "low" {
  switch (kd.type) {
    case "deposit_deadline":
    case "accept_deadline":
      return "high";
    case "tuition_deadline":
    case "document_deadline":
      return "medium";
    default:
      return "low";
  }
}

export function formatDaysLeft(days: number): { value: string; unit: string } {
  if (!Number.isFinite(days)) return { value: "—", unit: "" };
  if (days < 0) return { value: String(Math.abs(days)), unit: "天前已过" };
  if (days === 0) return { value: "今天", unit: "" };
  return { value: String(days), unit: "天" };
}

export type { KeyDate, MustDo };
