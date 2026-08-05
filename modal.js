/*
  modal.js
  --------
  The bottom-sheet "tap any transaction to see everything" detail
  view. Builds a plain list of label/value rows from a trip's fields
  (different rows depending on purpose and status), plus a Record Info
  section showing the sync metadata (id, created/updated timestamps,
  version) that storage.js and sync.js maintain.
*/

import { findTrip } from './storage.js';
import { money, fmtTime, fmtDateTime, elapsed } from './helpers.js';

/** Opens the detail sheet for a given trip id. */
export function openDetail(id) {
  const t = findTrip(id);
  if (!t) return;

  const purpose = t.purpose || 'sale';
  const purposeLabel = purpose === 'sale'
    ? 'Sell FX to customer'
    : purpose === 'deposit'
      ? 'Collect UGX deposit'
      : 'Assist — transport cash in';

  const rows = buildDetailRows(t, purpose, purposeLabel);

  const html = `
    <div class="modal-close" onclick="closeDetail()">✕</div>
    <span class="status-pill ${t.status === 'out' ? 'status-out' : 'status-settled'}">${t.status === 'out' ? 'Out' : 'Settled'}</span>
    <span class="status-pill ${t.sync_status === 'pending' ? 'status-pending' : 'status-synced'}">${t.sync_status === 'pending' ? 'Pending sync' : 'Synced'}</span>
    <div class="modal-title">${t.teller} — ${t.customer || 'no customer name'}</div>
    <div class="small" style="margin-bottom:14px;">${new Date(t.timeOut).toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
    ${rows.map(([label, val]) => `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-val mono">${val}</span></div>`).join('')}
    <div class="detail-section-label">Record Info</div>
    <div class="detail-row"><span class="detail-label">Record ID</span><span class="detail-val mono">${t.id.slice(0, 8)}…</span></div>
    <div class="detail-row"><span class="detail-label">Created</span><span class="detail-val mono">${fmtDateTime(t.created_at)}</span></div>
    <div class="detail-row"><span class="detail-label">Last updated</span><span class="detail-val mono">${fmtDateTime(t.updated_at)}</span></div>
    <div class="detail-row"><span class="detail-label">Version</span><span class="detail-val mono">${t.version || 1}</span></div>
  `;

  document.getElementById('detailContent').innerHTML = html;
  document.getElementById('detailModal').classList.add('open');
}

/** Closes the detail sheet. */
export function closeDetail() {
  document.getElementById('detailModal').classList.remove('open');
}

function buildDetailRows(t, purpose, purposeLabel) {
  const rows = [];
  rows.push(['Status', t.status === 'out' ? 'Out with teller' : 'Settled']);
  rows.push(['Purpose', purposeLabel]);
  rows.push(['Teller', t.teller]);
  rows.push(['Customer / colleague', t.customer || '—']);

  if (purpose === 'sale') {
    rows.push(['Currency', t.currency]);
    rows.push(['Amount taken', `${money(t.amountTaken)} ${t.currency}`]);
    if (t.swap > 0) rows.push(['Swap carried', `${money(t.swap)} ${t.currency}`]);
    rows.push(['Rate', t.rate || '—']);
    if (t.expectedUgx > 0) rows.push(['Expected return', `${money(t.expectedUgx)} UGX`]);
  } else if (t.expectedAmount > 0) {
    rows.push(['Expected amount', `${money(t.expectedAmount)} ${t.expectedCurrency}`]);
  }

  rows.push(['Time out', fmtTime(t.timeOut)]);

  if (t.status === 'settled') {
    rows.push(...buildSettledRows(t, purpose));
  } else {
    rows.push(['Elapsed', elapsed(t.timeOut)]);
  }

  return rows;
}

function buildSettledRows(t, purpose) {
  const rows = [['Time in', fmtTime(t.timeIn)]];

  if (purpose === 'sale') {
    rows.push(['Delivered', `${money(t.delivered)} ${t.currency}`]);
    if (t.swapUsed > 0) rows.push(['Swap used', `${money(t.swapUsed)} ${t.currency}`]);
    rows.push(['FX balance', `${money(Math.abs(t.fxBalance))} ${t.currency} ${t.fxBalance >= 0 ? '(returned)' : '(over what was carried)'}`]);
    rows.push(['UGX received', `${money(t.received)}`]);
    if (t.ugxBalance !== 0) rows.push([t.ugxBalance > 0 ? 'Underpaid' : 'Overpaid', `${money(Math.abs(t.ugxBalance))} UGX`]);
    if (t.followups && t.followups.length) {
      t.followups.forEach((f, i) => {
        rows.push([`Balance collected #${i + 1}`, `${money(f.amount)} UGX — ${new Date(f.time).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' })}${f.remarks ? ' (' + f.remarks + ')' : ''}`]);
      });
    }
  } else {
    rows.push(['Brought back', `${money(t.broughtAmount)} ${t.broughtCurrency}`]);
    if (t.expectedAmount > 0 && t.broughtCurrency === t.expectedCurrency && t.broughtAmount !== t.expectedAmount) {
      const diff = t.broughtAmount - t.expectedAmount;
      rows.push([diff < 0 ? 'Short' : 'Extra', `${money(Math.abs(diff))} ${t.expectedCurrency}`]);
    }
  }

  if (t.remarks) rows.push(['Remarks', t.remarks]);
  return rows;
}
