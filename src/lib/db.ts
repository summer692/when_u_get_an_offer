import { openDB, type IDBPDatabase } from "idb";
import type { ExtractedOffer, Offer, Settings } from "./schema";

const DB_NAME = "offerlens";
const DB_VERSION = 2;
const STORE_OFFERS = "offers";
const STORE_SETTINGS = "settings";
const STORE_EXTRACTIONS = "extractions";

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
          db.createObjectStore(STORE_EXTRACTIONS, { keyPath: "hash" });
        }
      },
    });
  }
  return dbPromise;
}

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

const SETTING_KEYS: (keyof Settings)[] = [
  "provider",
  "apiKey",
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

/**
 * Content-hash cache for LLM extractions. Same input bytes → same hash →
 * same cached output, so re-uploading the same offer file always returns
 * an identical reading instead of a fresh "gacha pull" from the model.
 */
interface CachedExtraction {
  hash: string;
  extracted: ExtractedOffer;
  model: string;
  saved_at: number;
}

export async function getCachedExtraction(
  hash: string,
): Promise<ExtractedOffer | undefined> {
  const db = await getDB();
  const row: CachedExtraction | undefined = await db.get(
    STORE_EXTRACTIONS,
    hash,
  );
  return row?.extracted;
}

export async function saveCachedExtraction(
  hash: string,
  extracted: ExtractedOffer,
  model: string,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_EXTRACTIONS, {
    hash,
    extracted,
    model,
    saved_at: Date.now(),
  } satisfies CachedExtraction);
}

export async function clearCachedExtraction(hash: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_EXTRACTIONS, hash);
}
