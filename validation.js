/*
  validation.js
  -------------
  Validation rules kept separate from the form-handling logic in
  ledger.js, so the rules themselves are easy to find, test, and reuse
  without wading through DOM code. Each function returns a simple
  boolean — the calling code decides what error message to show.
*/

/** A teller name must be present and not just whitespace. */
export function isValidTellerName(name) {
  return Boolean(name && name.trim().length > 0);
}

/** A sale dispatch must specify a positive amount taken. */
export function isValidSaleAmount(amount) {
  return Boolean(amount) && amount > 0;
}
