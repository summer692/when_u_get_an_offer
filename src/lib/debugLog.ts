/**
 * Lightweight ring buffer in localStorage that records the last few LLM
 * extraction calls + their raw responses. Used by the "AI 抽取调试"
 * button in the top bar so users without DevTools can hand the raw model
 * output back to support without dealing with browser dev tooling.
 */

const KEY = "offerlens_extraction_log";
const MAX_ENTRIES = 5;

export interface ExtractionLogEntry {
  at: number; // unix ms
  provider: string;
  model: string;
  /** Whether the normalized result looked usable (had a real school name). */
  looksOk: boolean;
  /** Raw `content` string the API returned. Truncated to 6KB to keep
   * localStorage budget sane. */
  rawContent: string;
  /** What we ended up extracting (also truncated when JSONified). */
  normalized: unknown;
}

export function recordExtractionLog(entry: Omit<ExtractionLogEntry, "at">) {
  try {
    const existing = readExtractionLog();
    const next: ExtractionLogEntry = {
      at: Date.now(),
      ...entry,
      rawContent: entry.rawContent.slice(0, 6000),
    };
    const trimmed = [next, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be full or disabled; debug log is non-essential.
  }
}

export function readExtractionLog(): ExtractionLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExtractionLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearExtractionLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
