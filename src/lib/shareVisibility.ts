import type { Offer } from "./schema";

/**
 * Field path keys used by Offer.share_visibility. List items index into the
 * underlying array; if items get reordered or deleted, OfferDetail's edit
 * helpers shift the keys to stay aligned.
 */
export type ShareFieldKey =
  | "fees.tuition"
  | "fees.deposit"
  | "fees.scholarship"
  | "duration"
  | "faculty"
  | "term_start"
  | `conditions.${number}`
  | `must_do.${number}`
  | `notes.${number}`;

/** True when a field has user-supplied data worth showing. Used as the
 * default visibility — empty fields hide themselves until the user opts
 * to show them; populated fields show themselves until the user opts
 * to hide. Keep this purely data-driven so behavior is predictable. */
export function defaultShareVisible(offer: Offer, key: string): boolean {
  if (key === "fees.tuition") return (offer.fees?.tuition?.amount ?? 0) > 0;
  if (key === "fees.deposit") return (offer.fees?.deposit?.amount ?? 0) > 0;
  if (key === "fees.scholarship")
    return (offer.fees?.scholarship?.amount ?? 0) > 0;
  if (key === "duration") return !!offer.duration?.trim();
  if (key === "faculty")
    return !!(offer.faculty_zh?.trim() || offer.faculty?.trim() || offer.student_category?.trim());
  if (key === "term_start") {
    const ts =
      offer.key_dates?.find((k) => k.type === "term_start")?.date ||
      offer.term_start_text;
    return !!ts;
  }
  // List item keys (conditions.N / must_do.N / notes.N) — visible by
  // default whenever the item exists. Out-of-range keys fall back to false.
  const m = /^(conditions|must_do|notes)\.(\d+)$/.exec(key);
  if (m) {
    const arr =
      m[1] === "conditions"
        ? offer.conditions
        : m[1] === "must_do"
        ? offer.must_do
        : offer.notes;
    return Array.isArray(arr) && Number(m[2]) < arr.length;
  }
  return true;
}

export function isVisibleInShare(offer: Offer, key: string): boolean {
  const override = offer.share_visibility?.[key];
  if (typeof override === "boolean") return override;
  return defaultShareVisible(offer, key);
}

/** Apply a single visibility change without mutating the input offer. */
export function setShareVisibility(
  offer: Offer,
  key: string,
  visible: boolean,
): Offer {
  const next: Record<string, boolean> = { ...(offer.share_visibility ?? {}) };
  // Only persist when the override differs from the data-driven default,
  // otherwise the override is redundant noise.
  if (defaultShareVisible(offer, key) === visible) {
    delete next[key];
  } else {
    next[key] = visible;
  }
  return { ...offer, share_visibility: next };
}

/** "一键隐藏所有空字段": for every field whose default visibility is
 * false (i.e. has no data), record an explicit false override so that
 * later data appearing won't quietly turn the field back on. Idempotent. */
export function hideAllEmptyFields(offer: Offer): Offer {
  const candidates: string[] = [
    "fees.tuition",
    "fees.deposit",
    "fees.scholarship",
    "duration",
    "faculty",
    "term_start",
  ];
  let next = offer;
  for (const key of candidates) {
    if (!defaultShareVisible(offer, key)) {
      next = setShareVisibility(next, key, false);
    }
  }
  return next;
}

/** When a list item is removed at `removedIndex`, shift the keys of items
 * after it down by one so the visibility map stays aligned. */
export function shiftVisibilityAfterRemove(
  offer: Offer,
  section: "conditions" | "must_do" | "notes",
  removedIndex: number,
): Offer {
  const sv = offer.share_visibility;
  if (!sv) return offer;
  const next: Record<string, boolean> = {};
  const prefix = `${section}.`;
  for (const [k, v] of Object.entries(sv)) {
    if (!k.startsWith(prefix)) {
      next[k] = v;
      continue;
    }
    const idx = Number(k.slice(prefix.length));
    if (!Number.isFinite(idx)) {
      next[k] = v;
      continue;
    }
    if (idx === removedIndex) {
      // Drop the entry for the removed item.
      continue;
    }
    if (idx > removedIndex) {
      next[`${prefix}${idx - 1}`] = v;
    } else {
      next[k] = v;
    }
  }
  return { ...offer, share_visibility: next };
}
