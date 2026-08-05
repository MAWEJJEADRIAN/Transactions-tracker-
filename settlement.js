/*
  settlement.js
  -------------
  Everything to do with settling a trip that's out with a teller
  (recording what actually came back and reconciling it against what
  was expected), plus collecting an underpaid balance after the fact.

  See the note at the top of ui.js about the intentional circular
  import between these two modules — render() needs the preview
  functions here, and these functions need render()/state setters
  from ui.js. Both sides only call each other from inside functions
  triggered by user interaction, well after the whole module graph
  has finished loading, so the cycle is safe.
*/

import { findTrip } from './storage.js';
import { stampUpdate } from './storage.js';
import { persistTrip } from './sync.js';
import { money, numVal, rawStr } from './helpers.js';
import {
  render, updateSyncBadge,
  getSettlingId, setSettlingId,
  getCollectingId, setCollectingId
} from './ui.js';

/** Opens the settle form for an out trip. */
export function openSettle(id) {
  setSettlingId(id);
  render();
}

/** Closes the settle form without saving. */
export function cancelSettle() {
  setSettlingId(null);
  render();
}

/**
 * Live-updates the settle preview box for a "sale" trip as the person
 * types. Splits the total amount taken back into how much of the main
 * amount vs. the swap buffer was used, and compares expected UGX
 * against what's been entered as received so far.
 */
export function settlePreview(trip) {
  const rate = numVal('s_rate_' + trip.id);
  const totalTakenInput = rawStr('s_totaltaken_' + trip.id);
  const receivedInput = rawStr('s_received_' + trip.id);
  const previewEl = document.getElementById('s_preview_' + trip.id);
  if (totalTakenInput === '' || !rate) { previewEl.innerHTML = ''; return; }

  const totalTaken = numVal('s_totaltaken_' + trip.id);
  let mainBalance = 0;
  let swapUsed = 0;
  let swapReturned = trip.swap;

  if (totalTaken <= trip.amountTaken) {
    mainBalance = trip.amountTaken - totalTaken;
  } else {
    swapUsed = totalTaken - trip.amountTaken;
    swapReturned = trip.swap - swapUsed;
  }
  const expectedUgx = totalTaken * rate;

  let html = '';
  if (mainBalance > 0) html += `<div class="neutral">Main balance returned: ${money(mainBalance)} ${trip.currency}</div>`;
  if (trip.swap > 0) {
    html += swapUsed > 0
      ? `<div class="owe">Swap used by customer: ${money(swapUsed)} ${trip.currency} — added to total sold</div>`
      : `<div class="neutral">Swap returned untouched: ${money(swapReturned)} ${trip.currency}</div>`;
  }
  if (swapReturned < 0) html += `<div class="warn">⚠ swap used exceeds what was carried by ${money(-swapReturned)} ${trip.currency}</div>`;
  html += `<div class="neutral">UGX to be submitted: ${money(expectedUgx)}</div>`;

  if (receivedInput !== '') {
    const receivedNum = numVal('s_received_' + trip.id);
    const ugxBal = expectedUgx - receivedNum;
    html += `<div class="${ugxBal > 0 ? 'owe' : ugxBal < 0 ? 'warn' : 'neutral'}">${ugxBal === 0 ? 'UGX fully settled' : ugxBal > 0 ? `Underpaid: ${money(ugxBal)} UGX` : `Overpaid: ${money(-ugxBal)} UGX`}</div>`;
  }
  previewEl.innerHTML = html;
}

/** Confirms settlement of a "sale" trip: computes final balances and persists it. */
export async function confirmSettle(id) {
  const trip = findTrip(id);
  const rate = numVal('s_rate_' + id);
  const totalTaken = numVal('s_totaltaken_' + id);
  const received = numVal('s_received_' + id);
  const remarks = document.getElementById('s_remarks_' + id).value;

  const swapUsed = totalTaken > trip.amountTaken ? totalTaken - trip.amountTaken : 0;

  trip.status = 'settled';
  trip.timeIn = Date.now();
  trip.rate = rate;
  trip.delivered = totalTaken;
  trip.swapUsed = swapUsed;
  trip.received = received;
  trip.fxBalance = (trip.amountTaken + trip.swap) - totalTaken;
  trip.ugxBalance = (totalTaken * rate) - received;
  trip.remarks = remarks;
  stampUpdate(trip);

  setSettlingId(null);
  await persistTrip(trip, 'update');
  await updateSyncBadge();
  render();
}

/**
 * Live-updates the settle preview box for a deposit/assist trip —
 * simpler than a sale, since there's no rate or swap math, just what
 * came back vs. what was expected.
 */
export function settleOtherPreview(trip) {
  const broughtInput = rawStr('s_brought_' + trip.id);
  const previewEl = document.getElementById('s_preview_' + trip.id);
  if (broughtInput === '') { previewEl.innerHTML = ''; return; }

  const broughtNum = numVal('s_brought_' + trip.id);
  const ccy = document.getElementById('s_broughtccy_' + trip.id).value;
  let html = `<div class="neutral">Brought back: ${money(broughtNum)} ${ccy}</div>`;

  if (trip.expectedAmount > 0 && ccy === trip.expectedCurrency) {
    const diff = broughtNum - trip.expectedAmount;
    html += diff === 0
      ? `<div class="neutral">Matches expected amount</div>`
      : diff < 0
        ? `<div class="warn">Short by ${money(-diff)} ${ccy}</div>`
        : `<div class="owe">Extra ${money(diff)} ${ccy}</div>`;
  }
  previewEl.innerHTML = html;
}

/** Confirms settlement of a deposit/assist trip. */
export async function confirmSettleOther(id) {
  const trip = findTrip(id);
  const brought = numVal('s_brought_' + id);
  const ccy = document.getElementById('s_broughtccy_' + id).value;
  const remarks = document.getElementById('s_remarks_' + id).value;

  trip.status = 'settled';
  trip.timeIn = Date.now();
  trip.broughtAmount = brought;
  trip.broughtCurrency = ccy;
  trip.received = ccy === 'UGX' ? brought : 0;
  trip.remarks = remarks;
  stampUpdate(trip);

  setSettlingId(null);
  await persistTrip(trip, 'update');
  await updateSyncBadge();
  render();
}

/** Opens the "collect balance owed" form on a settled, underpaid trip. */
export function openCollect(id) {
  setCollectingId(id);
  setSettlingId(null);
  render();
}

/** Closes the collect-balance form without saving. */
export function cancelCollect() {
  setCollectingId(null);
  render();
}

/**
 * Records a follow-up collection of a previously-underpaid balance.
 * Appends to the trip's followups history rather than overwriting
 * anything, so multiple partial collections all stay on record.
 */
export async function confirmCollect(id) {
  const trip = findTrip(id);
  const amount = numVal('c_amount_' + id);
  const remarks = document.getElementById('c_remarks_' + id).value;
  if (amount <= 0) return;

  if (!trip.followups) trip.followups = [];
  trip.followups.push({ amount, remarks, time: Date.now() });
  trip.received += amount;
  trip.ugxBalance -= amount;
  stampUpdate(trip);

  setCollectingId(null);
  await persistTrip(trip, 'update');
  await updateSyncBadge();
  render();
}
