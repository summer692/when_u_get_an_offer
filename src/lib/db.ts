import { openDB, type IDBPDatabase } from "idb";
import type { Offer, Settings } from "./schema";

const DB_NAME = "offerlens";
const DB_VERSION = 1;
const STORE_OFFERS = "offers";
const STORE_SETTINGS = "settings";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_OFFERS)) {
          const store = db.createObjectStore(STORE_OFFERS, { keyPath: "id" });
          store.createIndex("by_created", "created_at");
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
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

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const apiKey = await db.get(STORE_SETTINGS, "apiKey");
  const model = await db.get(STORE_SETTINGS, "model");
  const theme = await db.get(STORE_SETTINGS, "theme");
  return { apiKey, model, theme };
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
