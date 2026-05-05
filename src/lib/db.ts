import { openDB, type IDBPDatabase } from "idb";
import type { ExtractedOffer, Offer, Settings } from "./schema";

const DB_NAME = "offerlens";
const DB_VERSION = 3;
const STORE_OFFERS = "offers";
const STORE_SETTINGS = "settings";
const STORE_EXTRACTIONS = "extractions";
const STORE_OCR = "ocr_cache";
const STORE_RESEARCH = "research_cache";

const CACHE_LIMIT = 100;
const L2_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const L3_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE_OFFERS)) {
          const store = db.createObjectStore(STORE_OFFERS, { keyPath: "id" });
          store.createIndex("by_created", "created_at");
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains(STORE_EXTRACTIONS)) {
          db.createObjectStore(STORE_EXTRACTIONS, { keyPath: "key" });
        }
        if (oldVersion < 3) {
          // L1: OCR cache — keyed by raw file SHA-256, value is the
          // ParsedInput. Permanent (OCR is deterministic for a given
          // file) but bounded by CACHE_LIMIT + LRU.
          if (!db.objectStoreNames.contains(STORE_OCR)) {
            db.createObjectStore(STORE_OCR, { keyPath: "key" });
          }
          // L3: research cache — keyed by normalized school|program.
          if (!db.objectStoreNames.contains(STORE_RESEARCH)) {
            db.createObjectStore(STORE_RESEARCH, { keyPath: "key" });
          }
          // The v2 extraction store used `keyPath: "hash"` and stored
          // raw inputs hashed against the prompt version. v3 keys the
          // store by `${file_hash}:${prompt_version}` instead — wipe
          // the old contents so we don't read stale rows under the new
          // key shape.
          if (db.objectStoreNames.contains(STORE_EXTRACTIONS)) {
            db.deleteObjectStore(STORE_EXTRACTIONS);
          }
          db.createObjectStore(STORE_EXTRACTIONS, { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Offers ────────────────────────────────────────────────────────────

export async function listOffers(): Promise<Offer[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_OFFERS, "by_created");
  return all.reverse();
}

export async function getOffer(id: string): Promise<Offer | undefined> {
  const db = await getDB();
  return db.get(STORE_OFFERS, id);
}

export async function saveOffer(offer: Offer): Promise<void> {
  const db = await getDB();
  await db.put(STORE_OFFERS, offer);
}

export async function deleteOffer(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_OFFERS, id);
}

// ─── Settings ──────────────────────────────────────────────────────────

const SETTING_KEYS: (keyof Settings)[] = [
  "provider",
  "apiKey",
  "apiKeys",
  "model",
  "theme",
  "agencyName",
  "agencyLogo",
];

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const out: Settings = {};
  for (const key of SETTING_KEYS) {
    const v = await db.get(STORE_SETTINGS, key);
    if (v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K]
): Promise<void> {
  const db = await getDB();
  if (value === undefined || value === null) {
    await db.delete(STORE_SETTINGS, key);
  } else {
    await db.put(STORE_SETTINGS, value, key);
  }
}

// ─── Cache infrastructure (LRU + TTL) ──────────────────────────────────

interface CacheRow<T> {
  key: string;
  value: T;
  saved_at: number;
  last_accessed: number;
  /** When set, the row is considered stale once Date.now() > expires_at
   * and the read helpers will return undefined + delete the entry. */
  expires_at?: number;
}

async function readCache<T>(
  store: string,
  key: string,
): Promise<T | undefined> {
  const db = await getDB();
  const row: CacheRow<T> | undefined = await db.get(store, key);
  if (!row) return undefined;
  if (row.expires_at && Date.now() > row.expires_at) {
    await db.delete(store, key);
    return undefined;
  }
  // Touch last_accessed so LRU eviction protects recently-used rows.
  row.last_accessed = Date.now();
  await db.put(store, row);
  return row.value;
}

async function writeCache<T>(
  store: string,
  key: string,
  value: T,
  ttlMs?: number,
): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const row: CacheRow<T> = {
    key,
    value,
    saved_at: now,
    last_accessed: now,
    expires_at: ttlMs ? now + ttlMs : undefined,
  };
  await db.put(store, row);
  // Capacity check: evict the least-recently-accessed rows down to the
  // limit. Cheap because we only do it on writes, not on every read.
  const all = (await db.getAll(store)) as CacheRow<T>[];
  if (all.length > CACHE_LIMIT) {
    all.sort((a, b) => a.last_accessed - b.last_accessed);
    const overflow = all.length - CACHE_LIMIT;
    for (let i = 0; i < overflow; i++) {
      await db.delete(store, all[i].key);
    }
  }
}

async function clearStore(store: string): Promise<void> {
  const db = await getDB();
  await db.clear(store);
}

// ─── L1: OCR cache ─────────────────────────────────────────────────────

/** Output of parseFile() — kept loose since parseFile lives in
 * parsers.ts and importing the type creates a circular dependency. */
type ParsedInputCacheValue = {
  kind: "pdf" | "image" | "text" | "docx";
  text: string;
  images: string[];
  sourceName?: string;
};

export async function getCachedOcr(
  fileHash: string,
): Promise<ParsedInputCacheValue | undefined> {
  return readCache<ParsedInputCacheValue>(STORE_OCR, fileHash);
}

export async function saveCachedOcr(
  fileHash: string,
  parsed: ParsedInputCacheValue,
): Promise<void> {
  // Permanent (no TTL). OCR is deterministic for a given file.
  await writeCache(STORE_OCR, fileHash, parsed);
}

// ─── L2: extraction cache ──────────────────────────────────────────────

export async function getCachedExtraction(
  cacheKey: string,
): Promise<ExtractedOffer | undefined> {
  return readCache<ExtractedOffer>(STORE_EXTRACTIONS, cacheKey);
}

export async function saveCachedExtraction(
  cacheKey: string,
  extracted: ExtractedOffer,
): Promise<void> {
  await writeCache(STORE_EXTRACTIONS, cacheKey, extracted, L2_TTL_MS);
}

// ─── L3: research cache ────────────────────────────────────────────────

/** ResearchResult import would create a cycle — keep loose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResearchCacheValue = any;

export async function getCachedResearch(
  cacheKey: string,
): Promise<ResearchCacheValue | undefined> {
  return readCache<ResearchCacheValue>(STORE_RESEARCH, cacheKey);
}

export async function saveCachedResearch(
  cacheKey: string,
  research: ResearchCacheValue,
): Promise<void> {
  await writeCache(STORE_RESEARCH, cacheKey, research, L3_TTL_MS);
}

// ─── Cache management ──────────────────────────────────────────────────

export async function clearAllCaches(): Promise<void> {
  await Promise.all([
    clearStore(STORE_OCR),
    clearStore(STORE_EXTRACTIONS),
    clearStore(STORE_RESEARCH),
  ]);
}
