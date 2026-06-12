# Happy Days v3 — IN-HOUSE app (directors & staff only)

**Read this before editing `app3/`. Golden rule: v1 (root `index.html`) and v2
(`app2/`) are FROZEN — never edit or move them. Only `app3/` evolves here.**

## What v3 is
The in-house back-office app. Same architecture as v2 (vanilla ES modules, the
`store.js` data layer, the `hdv-*` UI kit, no build step), but:
- **Hard login wall** (`app.js renderLoginWall`): nothing renders until one of the
  6 `@happydaysgrocer.app` accounts signs in. `body.hd3-locked` hides search + nav.
- **Cost & margin** data via a **secure overlay** loaded from the LOCKED `/catalog`
  node after login — never baked into a static file.
- Carries v2's full staff feature set (orders, customers, picking, pricing,
  specials, stock, standing orders) PLUS the v1 internal features as they are ported.

## v3 is a SELF-CONTAINED COPY
`app3/` has its own `index.html`, `css/app.css`, `sw.js` (cache `hd3-v1`),
`manifest.webmanifest`, `catalog.js`, and `js/{store,catalog,orders,app,money}.js`.
It does NOT import from `app2/`. Changes here never affect v1 or v2 (and vice versa).
The trade-off: when a shared improvement is wanted in both v2 and v3, port it to both.

## The secure cost overlay (the one thing v3 adds to store.js)
- `loadSecureCatalog()` — GET the locked `/catalog` node (`{json:"{EPOS90,SHOP_PRODUCTS}"}`),
  parse, and overlay `cost` (SHOP_PRODUCTS index 6) onto in-memory `CATALOG` items by
  `cat||name` key; keep EPOS90 per-item stats. Called after login inside `pull()`.
- `_applySecureCache()` — re-overlays from `localStorage 'hd3.secure'` for offline.
- `costOf(key)`, `marginInfo(key)` → `{cost, sell, profit, marginPct}`, `eposFor(name)`,
  `secureLoaded()`.
- **Security invariant:** no cost ever touches a static file. `/catalog` is populated
  by the owner's one-time upload (`G:\…\Tools\fb_upload_catalog.js`) and is readable
  only by the 6 staff accounts (Firebase rules). Until then `secureLoaded()` is false
  and the Money view shows a banner + sell prices only.

## Views (bottom nav: Shop · Orders · Money · More)
- **Shop / Orders / More** — reused from the v2 copy (staff ordering, customers,
  picking, specials, runs, price levels, stock, broadcast, invoices).
- **Money** (`money.js`) — per-product cost / sell / margin %, aisle chips, totals,
  colour-graded margins. The first v3-only screen.

## STILL TO PORT from v1 (phased; each is a new app3 view + store nodes)
Mandi BUY RUN (stall tape, supplier groups, buy/skip, box conversion, collate),
SELL price entry, STORE/STOCKTAKE (+ barcode), P&L / EXPENSES / FINANCE (locked),
recipes/make-cost, bakery wastage, Go-Live market timer, AI assistant + invoice scan,
add product/supplier, A4 order form. Extra Firebase nodes to wire into store3:
`runstate, sell, stock, customproducts, history, recipes, menucosts, bakerybuy, finance`.
The Mandi cost book `PRODUCTS` (inline in v1) should be added to the `/catalog`
upload blob so the buy run has costs.
