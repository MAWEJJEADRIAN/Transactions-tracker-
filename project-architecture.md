# Project Architecture

Transaction's Reconciliation is an offline-first web app for tracking
FX dispatch trips at a Forex Bureau: sending a teller out with foreign
currency to sell, or to collect a UGX deposit, or to help a colleague
bring in bulky cash — then reconciling what actually came back.

It's a static site: no build step, no bundler, no server required to
run it. Every `.js` file is loaded directly by the browser as an ES
module (`<script type="module">`).

## Why no framework or build step

The app is small enough that plain ES modules give real module
boundaries (imports/exports, no global-variable soup) without the
overhead of a bundler, a `node_modules` folder, or a build pipeline.
That also means it deploys as-is to any static host — there's nothing
to compile.

## Data flow, top to bottom

```
index.html (markup + onclick="..." attributes)
        │
        ▼
   js/app.js  ── composition root: wires window.<fn> for inline
        │         handlers, then boots the app
        ▼
   js/ui.js   ── render(): turns trip data + UI state into HTML
        │
        ├── js/ledger.js       (dispatch, edit, delete)
        ├── js/settlement.js   (settle, collect balance)
        ├── js/modal.js        (detail sheet)
        ├── js/reports.js      (report tab)
        └── js/backup.js       (export/import)
                │
                ▼
        js/storage.js  ── in-memory trip list + record metadata
                │
                ▼
        js/sync.js     ── persistTrip(): saves + queues for sync
                │
                ▼
        js/database.js ── raw IndexedDB access
```

`js/helpers.js`, `js/validation.js`, and `js/constants.js` sit
underneath all of this — pure functions and shared config with no
dependency on app state.

## Why onclick="..." attributes, not addEventListener

The original single-file version of this app used inline
`onclick="functionName(...)"` attributes throughout, including inside
HTML that's generated dynamically (e.g. a "Delete" button rendered
fresh for every trip in the list). That markup and behavior is
preserved exactly as-is in this split-file version, per the
requirement to not change the UI or workflow.

The catch: ES modules don't leak their functions into the global
scope, but inline `onclick` attributes execute as global-scope code.
`js/app.js` bridges this deliberately and in one place — it imports
every handler function referenced by an `onclick`/`onchange`/`oninput`
attribute anywhere in the app and assigns them onto `window`. No other
module does this; it's the one sanctioned exception to "modules don't
touch globals."

## The one intentional circular import

`js/ui.js` and `js/settlement.js` import from each other:

- `ui.js`'s `render()` needs to call `settlePreview()` /
  `settleOtherPreview()` (from `settlement.js`) to redraw a trip's live
  calculation box after re-rendering it.
- `settlement.js`'s functions need `render()` and the settle-state
  setters (from `ui.js`) to redraw the screen after an action and to
  track which trip is mid-settlement.

This is safe under the ES module spec as long as neither side reads
the other's exports at module-evaluation time (top-level) — only from
inside function bodies that run later, in response to user
interaction. That's exactly the case here, so the cycle causes no
initialization-order bugs.

## IndexedDB schema

Database: `fx_ledger_db` (version 1), two object stores:

### `trips`

One row per dispatch/settlement record. `id` (a UUID) is the key path.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | primary key |
| `status` | `'out'` \| `'settled'` | |
| `purpose` | `'sale'` \| `'deposit'` \| `'assist'` | |
| `teller`, `customer` | string | |
| `currency` | string | |
| `amountTaken`, `swap`, `rate`, `expectedUgx` | number | sale-purpose fields |
| `expectedAmount`, `expectedCurrency` | number/string | deposit/assist fields |
| `timeOut`, `timeIn` | number (epoch ms) | business timestamps, distinct from the sync metadata below |
| `delivered`, `swapUsed`, `received`, `fxBalance`, `ugxBalance` | number | settlement results (sale) |
| `broughtAmount`, `broughtCurrency` | number/string | settlement results (deposit/assist) |
| `remarks` | string | |
| `followups` | array | history of follow-up balance collections |
| `created_at`, `updated_at` | string (ISO) | record metadata |
| `deleted_at` | string (ISO) \| null | soft-delete marker — never hard-deleted |
| `version` | number | incremented on every update |
| `sync_status` | `'pending'` \| `'synced'` | |
| `device_id` | string (UUID) | which device created/last touched this record |
| `user_id` | string \| null | reserved for when user accounts exist |
| `last_synced_at` | string (ISO) \| null | reserved for Phase 2 |

Indexes: `status`, `sync_status` (both non-unique, used for the pending
sync count and could support future filtered queries).

### `sync_queue`

An outbox log — every create/update/delete writes an entry here, even
though nothing currently reads from this store. It exists so a future
sync engine has an accurate change log to replay against a server,
rather than needing to diff the entire `trips` table.

| Field | Type |
|---|---|
| `id` | string (UUID), primary key |
| `entity_type` | `'trip'` |
| `entity_id` | string (UUID) — the trip this entry is about |
| `operation` | `'create'` \| `'update'` \| `'delete'` |
| `payload` | string — JSON snapshot of the trip at the time of the change |
| `created_at` | string (ISO) |
| `status` | `'pending'` |

## Legacy data migration

Earlier versions of this app stored trips as a single JSON array under
the localStorage key `fx_dispatch_trips_v1`. `storage.js`'s
`migrateLegacyData()` runs once on every app startup: if that key
exists, every record in it gets a fresh UUID and full sync metadata
via `stampNew()`, gets written into the `trips` IndexedDB store, and
the old localStorage key is removed. On every later startup this is a
no-op (the key is already gone).

## What "sync-ready" means right now

There is no backend connected to this app. `sync_status`, the
`sync_queue` store, and the "pending sync" badge in the header are all
real and fully functional — they accurately track what's changed
locally — but nothing currently consumes them. A future sync engine
would: read pending `sync_queue` entries, POST them to a server, mark
them synced, and pull down any remote changes. The database schema and
metadata fields already match what that would need.

## Extending this app

- **Adding a currency**: edit `CURRENCIES` / `EXPECTED_CURRENCIES` in
  `js/constants.js` and the matching `<option>` lists in `index.html`
  (dispatch form) and `js/ui.js` (settle/edit form templates).
- **Adding a report breakdown**: add a render function to
  `js/reports.js` following the pattern of `renderByPurpose` /
  `renderByCurrency` / `renderByTeller`.
- **Connecting a backend**: build on `js/sync.js` — it already has the
  outbox queue; a sync engine would read `STORE_SYNC_QUEUE`, send
  pending entries to a server, and handle the response.
