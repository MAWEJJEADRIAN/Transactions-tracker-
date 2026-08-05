/*
  database.js
  -----------
  The lowest layer of the data stack: raw IndexedDB access with no
  knowledge of what a "trip" is or what sync means. It just knows how
  to open the database and get/put records in a named object store.
  storage.js and sync.js build the actual business logic on top of
  these primitives — nothing outside this file should call
  `indexedDB.open` directly.
*/

import { DB_NAME, DB_VERSION, STORE_TRIPS, STORE_SYNC_QUEUE } from './constants.js';

let dbInstance = null;

/** Opens (and if needed, creates) the local database and its object stores. */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_TRIPS)) {
        const store = db.createObjectStore(STORE_TRIPS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Returns the open database connection, opening it once and reusing it after that. */
export async function getDB() {
  if (!dbInstance) dbInstance = await openDatabase();
  return dbInstance;
}

/** Retrieves every record from the given object store. */
export function dbGetAll(storeName) {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Inserts or overwrites a record (matched by its keyPath) in the given object store. */
export function dbPut(storeName, record) {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}
