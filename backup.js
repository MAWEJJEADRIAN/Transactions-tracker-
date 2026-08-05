/*
  backup.js
  ---------
  A real, working local backup system: exportBackup() downloads every
  record in the database as a JSON file, and importBackup() reads one
  back in and merges it into the local database. This works completely
  independently of any future cloud sync — it's a safety net you
  control directly (email the file to yourself, copy it to another
  device, whatever).
*/

import { dbGetAll, dbPut } from './database.js';
import { STORE_TRIPS } from './constants.js';
import { nowISO } from './helpers.js';
import { DEVICE_ID, loadTripsFromDb } from './storage.js';
import { render, updateSyncBadge } from './ui.js';
import { renderReport } from './reports.js';

/** Downloads every record in the local database as a timestamped JSON file. */
export async function exportBackup() {
  const all = await dbGetAll(STORE_TRIPS);
  const backup = {
    app: 'fx-dispatch-ledger',
    exported_at: nowISO(),
    device_id: DEVICE_ID,
    record_count: all.length,
    records: all
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fx-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  document.getElementById('backupStatus').textContent = `Exported ${all.length} records.`;
}

/** Reads a backup JSON file and merges its records into the local database. */
export function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('backupStatus');
  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      const records = Array.isArray(data) ? data : data.records;
      if (!Array.isArray(records)) throw new Error('No records array found in file.');

      let count = 0;
      for (const r of records) {
        if (!r.id) continue;
        await dbPut(STORE_TRIPS, r);
        count++;
      }

      await loadTripsFromDb();
      statusEl.textContent = `Restored ${count} records from backup.`;
      await updateSyncBadge();
      render();
      renderReport();
    } catch (err) {
      statusEl.textContent = 'Could not read that backup file: ' + err.message;
    }
    event.target.value = '';
  };

  reader.readAsText(file);
}
