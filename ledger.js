/*
  ledger.js
  ---------
  The core ledger workflow: starting a new dispatch trip, deleting an
  out trip before it's settled, and editing or deleting a trip that's
  already settled. Settlement itself (marking a trip returned) lives
  in settlement.js — this module is everything around it.
*/

import { numVal } from './helpers.js';
import { isValidTellerName, isValidSaleAmount } from './validation.js';
import { findTrip, addTrip, removeTripFromMemory, stampNew, stampUpdate } from './storage.js';
import { persistTrip } from './sync.js';
import {
  render, updateSyncBadge,
  setEditingId, setCollectingId, setSettlingId,
  setConfirmingDeleteId
} from './ui.js';

/** Shows/hides the sale-specific vs. deposit/assist-specific dispatch fields. */
export function updatePurposeFields() {
  const purpose = document.getElementById('d_purpose').value;
  document.getElementById('saleFields').style.display = purpose === 'sale' ? 'block' : 'none';
  document.getElementById('otherFields').style.display = purpose === 'sale' ? 'none' : 'block';
  updateExpectedPreview();
}

/** Live-updates the "expected return" preview on the dispatch form as it's filled in. */
export function updateExpectedPreview() {
  const purpose = document.getElementById('d_purpose').value;
  const el = document.getElementById('d_expected_preview');

  if (purpose === 'sale') {
    const amount = numVal('d_amount');
    const rate = numVal('d_rate');
    if (amount > 0 && rate > 0) {
      el.style.display = 'block';
      el.innerHTML = `<span class="neutral">Expected return: ${(amount * rate).toLocaleString('en-UG')} UGX</span> <span class="small">(amount taken × rate — swap not included, it's not meant to be sold)</span>`;
    } else {
      el.style.display = 'none';
    }
  } else {
    const exp = numVal('d_expected_amount');
    const ccy = document.getElementById('d_expected_currency').value;
    if (exp > 0) {
      el.style.display = 'block';
      el.innerHTML = `<span class="neutral">Expected to bring back: ${exp.toLocaleString('en-UG')} ${ccy}</span>`;
    } else {
      el.style.display = 'none';
    }
  }
}

/** Validates and records a new dispatch trip, then resets the form. */
export async function startTrip() {
  const teller = document.getElementById('d_teller').value.trim();
  const purpose = document.getElementById('d_purpose').value;
  const errEl = document.getElementById('d_error');

  if (!isValidTellerName(teller)) {
    errEl.style.display = 'block';
    errEl.textContent = 'Enter the teller name.';
    return;
  }

  let trip;
  if (purpose === 'sale') {
    const amount = numVal('d_amount');
    if (!isValidSaleAmount(amount)) {
      errEl.style.display = 'block';
      errEl.textContent = 'Enter an amount taken greater than 0.';
      return;
    }
    errEl.style.display = 'none';
    trip = buildSaleTrip(teller, amount);
  } else {
    errEl.style.display = 'none';
    trip = buildOtherTrip(teller, purpose);
  }
  stampNew(trip);

  addTrip(trip);
  await persistTrip(trip, 'create');
  await updateSyncBadge();

  resetDispatchForm();
  showOkBanner();
  render();
}

function buildSaleTrip(teller, amount) {
  const trip = {
    status: 'out', purpose: 'sale',
    teller,
    currency: document.getElementById('d_currency').value,
    amountTaken: amount,
    swap: numVal('d_swap'),
    rate: numVal('d_rate'),
    customer: document.getElementById('d_customer').value,
    timeOut: Date.now(), timeIn: null,
    delivered: 0, received: 0, fxBalance: 0, ugxBalance: 0, remarks: ''
  };
  trip.expectedUgx = trip.amountTaken * trip.rate;
  return trip;
}

function buildOtherTrip(teller, purpose) {
  const expCcy = document.getElementById('d_expected_currency').value;
  return {
    status: 'out', purpose,
    teller,
    currency: expCcy,
    amountTaken: 0, swap: 0, rate: 0,
    expectedAmount: numVal('d_expected_amount'),
    expectedCurrency: expCcy,
    customer: document.getElementById('d_customer').value,
    timeOut: Date.now(), timeIn: null,
    broughtAmount: 0, broughtCurrency: expCcy,
    received: 0, remarks: ''
  };
}

function resetDispatchForm() {
  document.getElementById('d_amount').value = '';
  document.getElementById('d_swap').value = '';
  document.getElementById('d_rate').value = '';
  document.getElementById('d_customer').value = '';
  document.getElementById('d_expected_amount').value = '';
  document.getElementById('d_expected_preview').style.display = 'none';
}

function showOkBanner() {
  const banner = document.getElementById('okBanner');
  banner.style.display = 'flex';
  setTimeout(() => { banner.style.display = 'none'; }, 2500);
}

/** Soft-deletes a trip that's still out with a teller (before settlement). */
export async function deleteTrip(id) {
  const trip = findTrip(id);
  if (!trip) return;
  trip.deleted_at = new Date().toISOString();
  stampUpdate(trip);
  await persistTrip(trip, 'delete');
  await updateSyncBadge();
  removeTripFromMemory(id);
  render();
}

/** Opens the inline edit form on a settled trip. */
export function openEdit(id) {
  setEditingId(id);
  setCollectingId(null);
  setSettlingId(null);
  render();
}

/** Closes the edit form without saving. */
export function cancelEdit() {
  setEditingId(null);
  render();
}

/** Saves edits made to a settled trip, recalculating its balances from the new figures. */
export async function saveEdit(id) {
  const trip = findTrip(id);
  trip.teller = document.getElementById('e_teller_' + id).value.trim() || trip.teller;
  trip.customer = document.getElementById('e_customer_' + id).value;
  trip.remarks = document.getElementById('e_remarks_' + id).value;

  if ((trip.purpose || 'sale') === 'sale') {
    trip.amountTaken = numVal('e_amounttaken_' + id);
    trip.swap = numVal('e_swap_' + id);
    trip.rate = numVal('e_rate_' + id);
    trip.delivered = numVal('e_delivered_' + id);
    trip.received = numVal('e_received_' + id);
    trip.swapUsed = trip.delivered > trip.amountTaken ? trip.delivered - trip.amountTaken : 0;
    trip.fxBalance = (trip.amountTaken + trip.swap) - trip.delivered;
    trip.ugxBalance = (trip.delivered * trip.rate) - trip.received;
    trip.expectedUgx = trip.amountTaken * trip.rate;
  } else {
    trip.expectedAmount = numVal('e_expected_' + id);
    trip.broughtAmount = numVal('e_brought_' + id);
    trip.broughtCurrency = document.getElementById('e_broughtccy_' + id).value;
    trip.received = trip.broughtCurrency === 'UGX' ? trip.broughtAmount : 0;
  }
  stampUpdate(trip);

  setEditingId(null);
  await persistTrip(trip, 'update');
  await updateSyncBadge();
  render();
}

/** Shows the inline "delete this record?" confirmation on a settled trip. */
export function deleteSettled(id) {
  setConfirmingDeleteId(id);
  setEditingId(null);
  setCollectingId(null);
  render();
}

/** Dismisses the delete confirmation without deleting. */
export function cancelDelete() {
  setConfirmingDeleteId(null);
  render();
}

/** Soft-deletes a settled trip after confirmation. */
export async function reallyDeleteSettled(id) {
  const trip = findTrip(id);
  if (!trip) return;
  trip.deleted_at = new Date().toISOString();
  stampUpdate(trip);
  setConfirmingDeleteId(null);
  await persistTrip(trip, 'delete');
  await updateSyncBadge();
  removeTripFromMemory(id);
  render();
}
