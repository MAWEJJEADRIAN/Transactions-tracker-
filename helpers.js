/*
  helpers.js
  ----------
  Small, pure utility functions with no dependency on app state or the
  DOM's business elements (formatWithCommas touches a specific input
  element, but only the one it's given — it doesn't know about trips,
  the database, or anything else app-specific). Every other module
  imports from here rather than re-implementing number formatting or
  ID generation.
*/

/** Formats a number as a comma-grouped string, e.g. 2000000 -> "2,000,000". */
export function money(n) {
  return Math.round(n || 0).toLocaleString('en-UG');
}

/**
 * Live-formats a text input's value with thousands separators as the
 * person types, preserving cursor position and allowing up to 2 decimal
 * places. Called on every `input` event for amount/rate fields.
 */
export function formatWithCommas(el) {
  const cursorFromEnd = el.value.length - el.selectionStart;
  let raw = el.value.replace(/,/g, '').replace(/[^0-9.]/g, '');

  const firstDot = raw.indexOf('.');
  if (firstDot !== -1) {
    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
  }

  const parts = raw.split('.');
  let intPart = parts[0] || '';
  const decPart = parts.length > 1 ? '.' + parts[1].slice(0, 2) : '';
  intPart = intPart.replace(/^0+(?=\d)/, '');

  const formattedInt = intPart === '' ? '' : parseInt(intPart, 10).toLocaleString('en-US');
  el.value = formattedInt + decPart;

  const pos = Math.max(0, el.value.length - cursorFromEnd);
  el.setSelectionRange(pos, pos);
}

/** Reads a comma-formatted input's value as a plain number. */
export function numVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return parseFloat((el.value || '').replace(/,/g, '')) || 0;
}

/** Reads an input's raw trimmed string value (used for "is this field empty?" checks). */
export function rawStr(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/** Formats an epoch-ms timestamp as a short local time, e.g. "08:45 AM". */
export function fmtTime(ms) {
  return ms ? new Date(ms).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }) : '';
}

/** Formats an ISO date string as a short local date + time, e.g. "4 Aug, 08:45 AM". */
export function fmtDateTime(iso) {
  return iso
    ? new Date(iso).toLocaleString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';
}

/** Formats the time elapsed since a given epoch-ms timestamp, e.g. "1h 20m". */
export function elapsed(startMs) {
  const mins = Math.floor((Date.now() - startMs) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Generates a UUID for a new record, with a fallback for older browsers. */
export function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

/** Current timestamp as an ISO string, used for record metadata (created_at/updated_at/etc). */
export function nowISO() {
  return new Date().toISOString();
}
