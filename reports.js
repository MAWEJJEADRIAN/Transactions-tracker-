/*
  reports.js
  ----------
  Everything behind the Report tab: the date-range filter (today/7
  days/30 days/all time), the summary stat cards, and the three
  breakdown lists (by purpose, by currency, by teller). Also reports
  on the local database itself — record count and pending-sync count —
  since that's genuinely useful operational information now that data
  lives in IndexedDB rather than a size-limited localStorage blob.
*/

import { getTrips } from './storage.js';
import { dbGetAll } from './database.js';
import { STORE_TRIPS } from './constants.js';
import { money } from './helpers.js';
import { DEVICE_ID } from './storage.js';

let reportFilter = 'today';

/** Switches the active date-range filter and re-renders the report. */
export function setReportFilter(filter, btn) {
  reportFilter = filter;
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  renderReport();
}

function filterCutoff() {
  const now = new Date();
  if (reportFilter === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (reportFilter === '7d') return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (reportFilter === '30d') return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

/** Recomputes and redraws every section of the Report tab. */
export async function renderReport() {
  const cutoff = filterCutoff();
  const trips = getTrips();
  const settled = trips.filter((t) => t.status === 'settled' && t.timeIn >= cutoff);
  const outTrips = trips.filter((t) => t.status === 'out');

  renderSummaryCards(settled, outTrips, trips);
  renderByPurpose(settled);
  renderByCurrency(settled);
  renderByTeller(settled);
  await renderDatabaseStats();
}

function renderSummaryCards(settled, outTrips, allTrips) {
  const totalUgx = settled.reduce((s, t) => s + (t.received || 0), 0);
  document.getElementById('r_totalUgx').textContent = money(totalUgx);
  document.getElementById('r_totalTxns').textContent = settled.length;
  document.getElementById('r_currentlyOut').textContent = outTrips.length;

  // Outstanding balances are shown regardless of the date filter — money
  // still owed is still owed, whenever the original trip happened.
  const allSettled = allTrips.filter((t) => t.status === 'settled');
  const outstandingUgx = allSettled.reduce(
    (s, t) => s + ((t.purpose || 'sale') === 'sale' && t.ugxBalance > 0 ? t.ugxBalance : 0),
    0
  );
  document.getElementById('r_outstanding').textContent = money(outstandingUgx);
}

function renderByPurpose(settled) {
  const purposes = {
    sale: { label: 'Sale', count: 0, ugx: 0 },
    deposit: { label: 'UGX Deposit', count: 0, ugx: 0 },
    assist: { label: 'Assist', count: 0, ugx: 0 }
  };
  settled.forEach((t) => {
    const p = t.purpose || 'sale';
    if (purposes[p]) { purposes[p].count++; purposes[p].ugx += (t.received || 0); }
  });

  document.getElementById('r_byPurpose').innerHTML = Object.values(purposes).map((p) => `
    <div class="report-row"><span>${p.label} <span class="report-sub">(${p.count})</span></span><span class="mono">${money(p.ugx)} UGX</span></div>
  `).join('') || '<div class="small">No data for this period.</div>';
}

function renderByCurrency(settled) {
  const ccyMap = {};
  settled.filter((t) => (t.purpose || 'sale') === 'sale').forEach((t) => {
    if (!ccyMap[t.currency]) ccyMap[t.currency] = { taken: 0, delivered: 0, swapUsed: 0, count: 0 };
    ccyMap[t.currency].taken += t.amountTaken || 0;
    ccyMap[t.currency].delivered += t.delivered || 0;
    ccyMap[t.currency].swapUsed += t.swapUsed || 0;
    ccyMap[t.currency].count++;
  });

  const ccyKeys = Object.keys(ccyMap);
  document.getElementById('r_byCurrency').innerHTML = ccyKeys.length
    ? ccyKeys.map((c) => `
      <div class="report-row">
        <span>${c} <span class="report-sub">(${ccyMap[c].count} trips)</span></span>
        <span class="mono">delivered ${money(ccyMap[c].delivered)}${ccyMap[c].swapUsed ? ` <span class="owe">(+${money(ccyMap[c].swapUsed)} swap)</span>` : ''}</span>
      </div>
    `).join('')
    : '<div class="small">No sales in this period.</div>';
}

function renderByTeller(settled) {
  const tellerMap = {};
  settled.forEach((t) => {
    const name = t.teller || 'Unknown';
    if (!tellerMap[name]) tellerMap[name] = { count: 0, ugx: 0 };
    tellerMap[name].count++;
    tellerMap[name].ugx += (t.received || 0);
  });

  const tellerKeys = Object.keys(tellerMap).sort((a, b) => tellerMap[b].ugx - tellerMap[a].ugx);
  document.getElementById('r_byTeller').innerHTML = tellerKeys.length
    ? tellerKeys.map((name) => `
      <div class="report-row"><span>${name} <span class="report-sub">(${tellerMap[name].count})</span></span><span class="mono">${money(tellerMap[name].ugx)} UGX</span></div>
    `).join('')
    : '<div class="small">No data for this period.</div>';
}

async function renderDatabaseStats() {
  const allRecords = await dbGetAll(STORE_TRIPS);
  const activeRecords = allRecords.filter((t) => !t.deleted_at);
  document.getElementById('r_dbCount').textContent = activeRecords.length;
  document.getElementById('r_dbPending').textContent = activeRecords.filter((t) => t.sync_status === 'pending').length;
  document.getElementById('r_deviceId').textContent = DEVICE_ID.slice(0, 13) + '…';
}
