/*
  app.js
  ------
  The composition root — the only module that imports from (almost)
  everywhere else. It does two jobs:

  1. Exposes the functions referenced by inline onclick/oninput
     attributes in index.html (and in the HTML that ui.js generates)
     onto `window`. Those attributes execute as plain global-scope
     JavaScript, which ES modules deliberately don't pollute — this is
     the standard, deliberate bridge between the two, and it's the
     only place that bridge happens.
  2. Runs init(): opens the local database, migrates any legacy data,
     loads trips into memory, and renders the first screen.
*/

import { getDB } from './database.js';
import { migrateLegacyData, loadTripsFromDb, findTrip } from './storage.js';
import { formatWithCommas } from './helpers.js';
import { render, switchTab, updateSyncBadge } from './ui.js';
import {
  updatePurposeFields, updateExpectedPreview, startTrip, deleteTrip,
  openEdit, cancelEdit, saveEdit,
  deleteSettled, cancelDelete, reallyDeleteSettled
} from './ledger.js';
import {
  openSettle, cancelSettle, settlePreview, confirmSettle,
  settleOtherPreview, confirmSettleOther,
  openCollect, cancelCollect, confirmCollect
} from './settlement.js';
import { openDetail, closeDetail } from './modal.js';
import { setReportFilter } from './reports.js';
import { exportBackup, importBackup } from './backup.js';

// Bridge for inline HTML event handlers — see module comment above.
Object.assign(window, {
  formatWithCommas,
  findTrip,
  switchTab,
  updatePurposeFields, updateExpectedPreview, startTrip, deleteTrip,
  openEdit, cancelEdit, saveEdit,
  deleteSettled, cancelDelete, reallyDeleteSettled,
  openSettle, cancelSettle, settlePreview, confirmSettle,
  settleOtherPreview, confirmSettleOther,
  openCollect, cancelCollect, confirmCollect,
  openDetail, closeDetail,
  setReportFilter,
  exportBackup, importBackup
});

/**
 * Boots the app: opens IndexedDB, migrates any pre-existing
 * localStorage data, loads trips into memory, and renders the first
 * screen. Runs once, immediately, when this module loads.
 */
async function init() {
  await getDB();

  const migratedCount = await migrateLegacyData();
  if (migratedCount > 0) {
    document.getElementById('migrateBanner').innerHTML =
      `<div class="migrate-banner">✓ Migrated ${migratedCount} record${migratedCount === 1 ? '' : 's'} from the old storage into the local database.</div>`;
  }

  await loadTripsFromDb();

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('ledgerContent').style.display = 'block';

  await updateSyncBadge();
  render();
  updatePurposeFields();
}

init();
