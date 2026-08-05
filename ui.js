/*
  ui.js
  -----
  Owns two things: the UI interaction state (which trip, if any, is
  currently being settled/edited/collected-against/confirmed-for-deletion,
  and which report filter is active), and render() — the function that
  turns the current trip list + that state into the actual HTML for the
  Ledger tab.

  Note on the circular import with settlement.js: render() needs to call
  settlePreview()/settleOtherPreview() to refresh the live calculation
  box after re-rendering a trip that's mid-settlement, and settlement.js
  needs render() (to redraw after every action) plus this module's state
  setters. Both sides only call into each other from inside function
  bodies that run after the whole app has loaded (never at module
  top-level), which is exactly the case ES modules support safely.
*/

import { getTrips, findTrip } from './storage.js';
import { getPendingSyncCount } from './sync.js';
import { money, fmtTime, elapsed } from './helpers.js';
import { settlePreview, settleOtherPreview } from './settlement.js';
import { renderReport } from './reports.js';

// --- UI interaction state ---------------------------------------------------
// Which trip (if any) currently has an open inline form of each kind.
let settlingId = null;
let collectingId = null;
let editingId = null;
let confirmingDeleteId = null;

export function getSettlingId() { return settlingId; }
export function setSettlingId(id) { settlingId = id; }
export function getCollectingId() { return collectingId; }
export function setCollectingId(id) { collectingId = id; }
export function getEditingId() { return editingId; }
export function setEditingId(id) { editingId = id; }
export function getConfirmingDeleteId() { return confirmingDeleteId; }
export function setConfirmingDeleteId(id) { confirmingDeleteId = id; }

/** Switches between the Ledger and Report tabs. */
export function switchTab(tab) {
  document.getElementById('ledgerView').style.display = tab === 'ledger' ? 'block' : 'none';
  document.getElementById('reportView').style.display = tab === 'report' ? 'block' : 'none';
  document.getElementById('tab_ledger').classList.toggle('active', tab === 'ledger');
  document.getElementById('tab_report').classList.toggle('active', tab === 'report');
  if (tab === 'report') renderReport();
}

/** Updates the small "pending sync" badge in the header. */
export async function updateSyncBadge() {
  const pending = await getPendingSyncCount();
  const badge = document.getElementById('syncBadge');
  if (badge) {
    badge.textContent = pending > 0 ? `${pending} pending sync` : 'saved locally';
    badge.classList.toggle('pending', pending > 0);
  }
}

/**
 * Re-renders the entire Ledger tab (stat cards, currency chips, the
 * "out with teller" list, and the settled list) from the current trip
 * data and UI state. Called after every dispatch/settle/edit/delete
 * action so the screen always reflects what's actually saved.
 */
export function render() {
  const trips = getTrips();
  const outTrips = trips.filter((t) => t.status === 'out');
  const settledTrips = trips.filter((t) => t.status === 'settled');

  document.getElementById('tripsOut').textContent = outTrips.length;
  document.getElementById('totalUgx').textContent = money(settledTrips.reduce((s, t) => s + t.received, 0));

  const ccyTotals = {};
  outTrips.forEach((t) => { ccyTotals[t.currency] = (ccyTotals[t.currency] || 0) + t.amountTaken + t.swap; });
  const chipsEl = document.getElementById('outstandingChips');
  chipsEl.innerHTML = Object.entries(ccyTotals).map(([c, q]) => `<span class="chip mono">${c} ${money(q)} out</span>`).join('');

  renderOutSection(outTrips);
  renderSettledSection(settledTrips);
}

function renderOutSection(outTrips) {
  const outEl = document.getElementById('outSection');

  if (outTrips.length === 0) {
    outEl.innerHTML = '';
    return;
  }

  outEl.innerHTML = `<div class="label" style="margin-bottom:8px;">Out With Teller (${outTrips.length})</div>` +
    outTrips.map((t) => `
      <div class="card card-out" onclick="if(settlingId!=='${t.id}') openDetail('${t.id}')">
        <div class="flex-between">
          <div>
            <div style="font-size:14px; font-weight:500;">${t.teller}${t.purpose && t.purpose !== 'sale' ? ` <span class="small">· ${t.purpose === 'deposit' ? 'UGX deposit' : 'assist'}</span>` : ''}</div>
            ${t.purpose === 'sale' ? `
              <div class="small" style="margin-top:2px;">${t.currency} ${money(t.amountTaken)}${t.swap ? ` (+${money(t.swap)} swap)` : ''} → ${t.customer || 'customer'}</div>
              ${t.expectedUgx > 0 ? `<div class="small mono" style="margin-top:2px;">expected: ${money(t.expectedUgx)} UGX</div>` : ''}
            ` : `
              <div class="small" style="margin-top:2px;">→ ${t.customer || 'customer / colleague'}</div>
              ${t.expectedAmount > 0 ? `<div class="small mono" style="margin-top:2px;">expected: ${money(t.expectedAmount)} ${t.expectedCurrency}</div>` : ''}
            `}
            <div class="small" style="margin-top:4px;">out ${fmtTime(t.timeOut)} · ${elapsed(t.timeOut)} ago</div>
          </div>
          <button class="btn-icon" onclick="event.stopPropagation(); deleteTrip('${t.id}')">✕</button>
        </div>
        ${settlingId === t.id ? renderSettleBox(t) : `<button class="btn-ghost" style="margin-top:8px;" onclick="event.stopPropagation(); openSettle('${t.id}')">Mark Returned →</button>`}
      </div>
    `).join('');

  if (settlingId) {
    setTimeout(() => {
      const t = findTrip(settlingId);
      if (t) { t.purpose === 'sale' ? settlePreview(t) : settleOtherPreview(t); }
    }, 0);
  }
}

function renderSettleBox(t) {
  if (t.purpose === 'sale') {
    return `
      <div class="settle-box" onclick="event.stopPropagation()">
        <div class="small" style="margin-bottom:8px;">carried: ${money(t.amountTaken + t.swap)} ${t.currency} (amount taken + swap)${t.expectedUgx > 0 ? ` · originally expected ${money(t.expectedUgx)} UGX` : ''}</div>
        <div class="row">
          <input id="s_rate_${t.id}" type="text" inputmode="decimal" placeholder="rate used" value="${t.rate ? money(t.rate) : ''}" oninput="formatWithCommas(this); settlePreview(findTrip('${t.id}'))">
          <input id="s_totaltaken_${t.id}" type="text" inputmode="decimal" placeholder="total amount taken" value="${money(t.amountTaken)}" oninput="formatWithCommas(this); settlePreview(findTrip('${t.id}'))">
        </div>
        <input id="s_received_${t.id}" type="text" inputmode="decimal" placeholder="UGX received" oninput="formatWithCommas(this); settlePreview(findTrip('${t.id}'))">
        <div class="preview" id="s_preview_${t.id}"></div>
        <input id="s_remarks_${t.id}" placeholder="remarks (e.g. balance due next visit)">
        <div class="row">
          <button class="btn-buy" onclick="confirmSettle('${t.id}')">✓ Confirm Submission</button>
          <button class="btn-ghost" onclick="cancelSettle()" style="flex:0 0 80px;">Cancel</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="settle-box" onclick="event.stopPropagation()">
      ${t.expectedAmount > 0 ? `<div class="small" style="margin-bottom:8px;">expected: ${money(t.expectedAmount)} ${t.expectedCurrency}</div>` : ''}
      <div class="row">
        <input id="s_brought_${t.id}" type="text" inputmode="decimal" placeholder="amount brought back" oninput="formatWithCommas(this); settleOtherPreview(findTrip('${t.id}'))">
        <select id="s_broughtccy_${t.id}" onchange="settleOtherPreview(findTrip('${t.id}'))">
          <option${t.expectedCurrency === 'UGX' ? ' selected' : ''}>UGX</option>
          <option${t.expectedCurrency === 'USD' ? ' selected' : ''}>USD</option>
          <option${t.expectedCurrency === 'EUR' ? ' selected' : ''}>EUR</option>
          <option${t.expectedCurrency === 'GBP' ? ' selected' : ''}>GBP</option>
          <option${t.expectedCurrency === 'KES' ? ' selected' : ''}>KES</option>
        </select>
      </div>
      <div class="preview" id="s_preview_${t.id}"></div>
      <input id="s_remarks_${t.id}" placeholder="remarks (optional)">
      <div class="row">
        <button class="btn-buy" onclick="confirmSettleOther('${t.id}')">✓ Confirm Submission</button>
        <button class="btn-ghost" onclick="cancelSettle()" style="flex:0 0 80px;">Cancel</button>
      </div>
    </div>
  `;
}

function renderSettledSection(settledTrips) {
  const settledEl = document.getElementById('settledSection');

  if (settledTrips.length === 0) {
    settledEl.innerHTML = '<div class="empty">No trips settled yet.</div>';
    return;
  }

  settledEl.innerHTML = settledTrips.map((t) => `
    <div class="card" onclick="if(collectingId!=='${t.id}' && editingId!=='${t.id}' && confirmingDeleteId!=='${t.id}') openDetail('${t.id}')">
      <div class="flex-between">
        <div style="font-size:14px;"><b>${t.teller}</b> <span class="small">· ${t.customer || '—'}${t.purpose && t.purpose !== 'sale' ? ` · ${t.purpose === 'deposit' ? 'UGX deposit' : 'assist'}` : ''}</span></div>
        <div class="small mono">${fmtTime(t.timeOut)} → ${fmtTime(t.timeIn)}</div>
      </div>
      ${editingId === t.id ? renderEditBox(t) : renderSettledBody(t)}
    </div>
  `).join('');
}

function renderEditBox(t) {
  if ((t.purpose || 'sale') === 'sale') {
    return `
      <div class="settle-box" onclick="event.stopPropagation()">
        <input id="e_teller_${t.id}" placeholder="teller name" value="${t.teller}">
        <input id="e_customer_${t.id}" placeholder="customer name" value="${t.customer || ''}">
        <div class="row">
          <input id="e_amounttaken_${t.id}" type="text" inputmode="decimal" placeholder="amount taken" value="${money(t.amountTaken)}" oninput="formatWithCommas(this)">
          <input id="e_swap_${t.id}" type="text" inputmode="decimal" placeholder="swap" value="${t.swap ? money(t.swap) : ''}" oninput="formatWithCommas(this)">
        </div>
        <div class="row">
          <input id="e_rate_${t.id}" type="text" inputmode="decimal" placeholder="rate" value="${money(t.rate)}" oninput="formatWithCommas(this)">
          <input id="e_delivered_${t.id}" type="text" inputmode="decimal" placeholder="total delivered" value="${money(t.delivered)}" oninput="formatWithCommas(this)">
        </div>
        <input id="e_received_${t.id}" type="text" inputmode="decimal" placeholder="UGX received" value="${money(t.received)}" oninput="formatWithCommas(this)">
        <input id="e_remarks_${t.id}" placeholder="remarks" value="${t.remarks || ''}">
        <div class="row">
          <button class="btn-buy" onclick="saveEdit('${t.id}')">✓ Save Changes</button>
          <button class="btn-ghost" onclick="cancelEdit()" style="flex:0 0 80px;">Cancel</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="settle-box" onclick="event.stopPropagation()">
      <input id="e_teller_${t.id}" placeholder="teller name" value="${t.teller}">
      <input id="e_customer_${t.id}" placeholder="customer / colleague" value="${t.customer || ''}">
      <input id="e_expected_${t.id}" type="text" inputmode="decimal" placeholder="expected amount" value="${t.expectedAmount ? money(t.expectedAmount) : ''}" oninput="formatWithCommas(this)">
      <div class="row">
        <input id="e_brought_${t.id}" type="text" inputmode="decimal" placeholder="amount brought back" value="${money(t.broughtAmount)}" oninput="formatWithCommas(this)">
        <select id="e_broughtccy_${t.id}">
          <option${t.broughtCurrency === 'UGX' ? ' selected' : ''}>UGX</option>
          <option${t.broughtCurrency === 'USD' ? ' selected' : ''}>USD</option>
          <option${t.broughtCurrency === 'EUR' ? ' selected' : ''}>EUR</option>
          <option${t.broughtCurrency === 'GBP' ? ' selected' : ''}>GBP</option>
          <option${t.broughtCurrency === 'KES' ? ' selected' : ''}>KES</option>
        </select>
      </div>
      <input id="e_remarks_${t.id}" placeholder="remarks" value="${t.remarks || ''}">
      <div class="row">
        <button class="btn-buy" onclick="saveEdit('${t.id}')">✓ Save Changes</button>
        <button class="btn-ghost" onclick="cancelEdit()" style="flex:0 0 80px;">Cancel</button>
      </div>
    </div>
  `;
}

function renderSettledBody(t) {
  return `
    ${t.purpose === 'sale' ? `
    <div class="grid2 mono" style="font-size:12px; color:#9A9A9E; margin-top:6px;">
      <span>Carried</span><span style="text-align:right;">${t.currency} ${money(t.amountTaken)}${t.swap ? ` (+${money(t.swap)} swap)` : ''}</span>
      <span>Delivered</span><span style="text-align:right;">${t.currency} ${money(t.delivered)}</span>
      <span>Rate</span><span style="text-align:right;">${t.rate}</span>
      <span>UGX received</span><span style="text-align:right; color:#E8E8E8;">${money(t.received)}</span>
    </div>
    ` : `
    <div class="grid2 mono" style="font-size:12px; color:#9A9A9E; margin-top:6px;">
      ${t.expectedAmount > 0 ? `<span>Expected</span><span style="text-align:right;">${money(t.expectedAmount)} ${t.expectedCurrency}</span>` : ''}
      <span>Brought back</span><span style="text-align:right; color:#E8E8E8;">${money(t.broughtAmount)} ${t.broughtCurrency}</span>
    </div>
    `}
    ${t.remarks ? `<div class="small italic" style="margin-top:6px;">"${t.remarks}"</div>` : ''}
    ${t.swapUsed > 0 ? `<div class="small owe" style="margin-top:6px;">Swap used by customer: ${money(t.swapUsed)} ${t.currency} (added to sale)</div>` : ''}
    ${t.fxBalance !== 0 ? `<div class="small ${t.fxBalance < 0 ? 'warn' : 'neutral'}" style="margin-top:4px;">${t.fxBalance >= 0 ? `FX balance returned: ${money(t.fxBalance)} ${t.currency}` : `⚠ Delivered ${money(-t.fxBalance)} ${t.currency} beyond what was carried`}</div>` : ''}
    ${t.purpose === 'sale' && t.ugxBalance !== 0 ? `<div class="small ${t.ugxBalance > 0 ? 'owe' : 'warn'}" style="margin-top:4px;">${t.ugxBalance > 0 ? `Underpaid: ${money(t.ugxBalance)} UGX` : `Overpaid: ${money(-t.ugxBalance)} UGX`}</div>` : ''}
    ${t.purpose !== 'sale' && t.expectedAmount > 0 && t.broughtCurrency === t.expectedCurrency && t.broughtAmount !== t.expectedAmount ? `<div class="small ${t.broughtAmount < t.expectedAmount ? 'warn' : 'owe'}" style="margin-top:4px;">${t.broughtAmount < t.expectedAmount ? `Short by ${money(t.expectedAmount - t.broughtAmount)} ${t.expectedCurrency}` : `Extra ${money(t.broughtAmount - t.expectedAmount)} ${t.expectedCurrency}`}</div>` : ''}
    ${(t.followups && t.followups.length) ? t.followups.map((f) => `<div class="small neutral" style="margin-top:4px;">+ balance collected: ${money(f.amount)} UGX on ${new Date(f.time).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' })}${f.remarks ? ` — "${f.remarks}"` : ''}</div>`).join('') : ''}
    ${t.ugxBalance > 0 ? renderCollectSection(t) : ''}
    <div class="row" style="margin-top:8px;">
      ${confirmingDeleteId === t.id ? `
        <span class="small warn" style="flex:1; align-self:center;">Delete this record?</span>
        <button class="btn-danger btn-sm" onclick="event.stopPropagation(); reallyDeleteSettled('${t.id}')">Yes, delete</button>
        <button class="btn-ghost btn-sm" onclick="event.stopPropagation(); cancelDelete()">Cancel</button>
      ` : `
        <button class="btn-ghost btn-sm" onclick="event.stopPropagation(); openEdit('${t.id}')">Edit</button>
        <button class="btn-danger btn-sm" onclick="event.stopPropagation(); deleteSettled('${t.id}')">Delete</button>
      `}
    </div>
  `;
}

function renderCollectSection(t) {
  if (collectingId === t.id) {
    return `
      <div class="settle-box" onclick="event.stopPropagation()">
        <input id="c_amount_${t.id}" type="text" inputmode="decimal" placeholder="amount collected (UGX)" value="${money(t.ugxBalance)}" oninput="formatWithCommas(this)">
        <input id="c_remarks_${t.id}" placeholder="remarks (optional)">
        <div class="row">
          <button class="btn-buy" onclick="confirmCollect('${t.id}')">✓ Record Collection</button>
          <button class="btn-ghost" onclick="cancelCollect()" style="flex:0 0 80px;">Cancel</button>
        </div>
      </div>
    `;
  }
  return `<button class="btn-ghost" style="margin-top:8px;" onclick="event.stopPropagation(); openCollect('${t.id}')">Collect Balance Owed →</button>`;
}
