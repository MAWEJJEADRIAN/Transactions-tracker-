/*
  storage.js
  ----------
  The trip "repository" — everything that owns and manages the
  in-memory list of trips, and the record metadata (id, created_at,
  updated_at, version, sync_status, device_id) every trip carries.

  This is the only module that holds a reference to the trips array
  directly; everywhere else asks for trips through the functions
  exported here (getTrips, findTrip, addTrip, removeTripFromMemory,
  replaceAllTrips) instead of touching a shared array themselves. That
  keeps trip-list mutations in one predictable place.
*/

import { dbGetAll, dbPut } from './database.js';
import { STORE_TRIPS, OLD_STORAGE_KEY } from './constants.js';
import { newId, nowISO } from './helpers.js';

let trips = [];

/** Returns the current in-memory list of (non-deleted) trips. */
export function getTrips() {
  return trips;
}

/** Finds a single trip by id, or undefined if it isn't in memory. */
export function findTrip(id) {
  return trips.find((t) => t.id === id);
}

/** Adds a newly-dispatched trip to the front of the in-memory list. */
export function addTrip(trip) {
  trips.unshift(trip);
}

/** Removes a trip from the in-memory list (used after a soft-delete). */
export function removeTripFromMemory(id) {
  trips = trips.filter((t) => t.id !== id);
}

/** Replaces the entire in-memory trip list — used at startup and after a backup restore. */
export function replaceAllTrips(arr) {
  trips = arr;
}

/**
 * A stable per-device identifier, generated once and kept in localStorage.
 * This is small app configuration, not a business record, so localStorage
 * (rather than IndexedDB) is the right place for it.
 */
export function getDeviceId() {
  let id = localStorage.getItem('fx_device_id');
  if (!id) {
    id = newId();
    localStorage.setItem('fx_device_id', id);
  }
  return id;
}

export const DEVICE_ID = getDeviceId();

/** Stamps a brand-new record with a fresh id and sync-ready metadata. */
export function stampNew(record) {
  record.id = newId();
  record.created_at = nowISO();
  record.updated_at = record.created_at;
  record.deleted_at = null;
  record.version = 1;
  record.sync_status = 'pending';
  record.device_id = DEVICE_ID;
  record.user_id = null;
  record.last_synced_at = null;
  return record;
}

/** Stamps an existing record as changed: bumps version and marks it pending sync. */
export function stampUpdate(record) {
  record.updated_at = nowISO();
  record.version = (record.version || 1) + 1;
  record.sync_status = 'pending';
  return record;
}

/**
 * One-time migration for devices that still have data in the old
 * localStorage-based storage format. Each legacy record gets a fresh
 * UUID and full sync metadata via stampNew, then is written into
 * IndexedDB. The old key is removed once migration succeeds so this
 * only ever runs once per device.
 */
export async function migrateLegacyData() {
  const raw = localStorage.getItem(OLD_STORAGE_KEY);
  if (!raw) return 0;

  let legacy;
  try {
    legacy = JSON.parse(raw);
  } catch (e) {
    legacy = null;
  }

  if (!Array.isArray(legacy) || legacy.length === 0) {
    localStorage.removeItem(OLD_STORAGE_KEY);
    return 0;
  }

  for (const old of legacy) {
    const record = Object.assign({}, old);
    stampNew(record); // assigns a fresh uuid id, replacing the old numeric Date.now() id
    await dbPut(STORE_TRIPS, record);
  }

  localStorage.removeItem(OLD_STORAGE_KEY);
  return legacy.length;
}

/** Loads every non-deleted trip from IndexedDB into memory, newest dispatch first. */
export async function loadTripsFromDb() {
  const all = await dbGetAll(STORE_TRIPS);
  const active = all.filter((t) => !t.deleted_at).sort((a, b) => b.timeOut - a.timeOut);
  replaceAllTrips(active);
  return active;
}
