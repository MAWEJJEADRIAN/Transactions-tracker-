/*
  sync.js
  -------
  This is the sync-readiness layer. persistTrip() is the single place
  every create/update/delete flows through: it saves the trip itself
  AND logs the change into an outbox queue (STORE_SYNC_QUEUE).

  No cloud backend is connected yet, so the queue currently just sits
  there — but the shape of it (entity_type, entity_id, operation,
  payload, status) is exactly what a future Phase 2 sync engine would
  read and replay against a server. Nothing here is a stub; every
  function is fully working today, it just doesn't have anywhere to
  push to yet.
*/

import { dbPut, dbGetAll } from './database.js';
import { STORE_TRIPS, STORE_SYNC_QUEUE } from './constants.js';
import { newId, nowISO } from './helpers.js';

/** Saves a trip locally and records the change in the sync outbox queue. */
export async function persistTrip(trip, operation) {
  await dbPut(STORE_TRIPS, trip);
  await dbPut(STORE_SYNC_QUEUE, {
    id: newId(),
    entity_type: 'trip',
    entity_id: trip.id,
    operation,
    payload: JSON.stringify(trip),
    created_at: nowISO(),
    status: 'pending'
  });
}

/** Counts how many (non-deleted) trips are still waiting to be synced. */
export async function getPendingSyncCount() {
  const all = await dbGetAll(STORE_TRIPS);
  return all.filter((t) => t.sync_status === 'pending' && !t.deleted_at).length;
}
