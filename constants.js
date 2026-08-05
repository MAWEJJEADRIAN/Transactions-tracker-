/*
  constants.js
  ------------
  Single source of truth for values used across multiple modules:
  IndexedDB configuration and the supported currency lists. Keeping
  these here means changing a currency list or bumping the DB version
  only ever needs to happen in one place.
*/

export const DB_NAME = 'fx_ledger_db';
export const DB_VERSION = 1;
export const STORE_TRIPS = 'trips';
export const STORE_SYNC_QUEUE = 'sync_queue';

// Legacy localStorage key from before the app moved to IndexedDB.
// migrateLegacyData() in storage.js checks this once on startup.
export const OLD_STORAGE_KEY = 'fx_dispatch_trips_v1';

// Foreign currencies the bureau trades.
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'KES'];

// Currencies a deposit/assist trip can be expected in or brought back as
// (includes UGX, since those trip types often involve UGX directly).
export const EXPECTED_CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES'];
