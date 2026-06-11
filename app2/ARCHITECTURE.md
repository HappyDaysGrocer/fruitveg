# Happy Days v2 — Architecture

**Read this before editing anything in `app2/`.**

PWA for Happy Days Fruit, Veg & Grocery (The Mango People Pty Ltd), Carrum Downs.
REKKI/Fresho-style B2B ordering: search-first, huge tap targets, built for a
non-technical owner on a phone at the 4am produce market.

## Golden rules

1. **The old app at the repo root is FROZEN.** Never edit root files
   (`index.html`, `sw.js`, `shopProducts.js`, `manifest.json`, the root JS data
   files, …). Only `app2/` evolves. Both apps share the same backend and must
   keep interoperating.
2. **No build step, no frameworks, no CDNs.** Vanilla JS native ES modules only.
   Served from GitHub Pages at `/fruitveg/app2/` (and localhost).
3. **Never invent new data shapes.** The Firebase nodes and the catalogue key
   format below are shared with the old app — changing them breaks both apps.
4. **No `alert()`/`prompt()`.** Use the shared bottom-sheet + toast from
   `js/catalog.js`.

## Module map

| File | Owner of | Exports |
|---|---|---|
| `index.html` | App shell: slim sticky header (wordmark), sticky search `#q`, `<main id="view">`, 3-button bottom nav (`data-view` = shop/orders/more) | — |
| `css/app.css` | Shell styling, design tokens, dark mode | — |
| `manifest.webmanifest`, `sw.js` | PWA install + offline. SW: network-first, cache fallback, cache name `hd2-v1` | — |
| `js/store.js` | ALL data: catalogue, buy list, auth, Firebase REST, local mirrors, pub/sub | `initCatalog, catalog, categories, searchCatalog, buy, auth, pull, patch, customers, orders, tiers, saveCustomer, saveOrder, ensureOpenOrder, tierPrice, bus` |
| `js/app.js` | Entry (`type=module`). Boot: `initCatalog -> pull -> render`. Router + bottom nav + history. SW registration. Login sheet. | `go(view)` |
| `js/catalog.js` | SHOP view + **shared UI kit**: injected `hdv-*` styles, bottom sheet, toast, chip rail, steppers, share/clipboard, reactive re-render core | `renderShop` + kit (below) |
| `js/orders.js` | ORDERS view (customers → take-order → review/complete) + MORE view (login/sync/details) | `renderOrders, renderMore` |

`app.js` calls `renderShop/renderOrders/renderMore(document.getElementById('view'))`.

## Data (shared with the old app — do not change)

- **Catalogue**: root `../shopProducts.js` defines global `SHOP_PRODUCTS`
  (NOT a module — `store.js` injects a `<script>` tag and waits for
  `window.SHOP_PRODUCTS`). Rows:
  `[category, stall, phone, name, defaultQty, boxPrice, cost, sellPrice, mustCheck, barcode]`.
  Built into `CATALOG = [{key, cat, name, cost, sell, barcode}]` where
  **`key = cat + '||' + name`** — this exact key joins every store
  (buy list, order lines, tier price lookups).
- **Firebase RTDB via plain REST** (no SDK):
  `GET/PATCH {databaseURL}/<node>.json?auth=<idToken>`.
  - `/customers` : `{id: {id,name,address,phone,contact,prices:{},tierId}}`
  - `/custorders`: `{id: {id,custId,date:'YYYY-MM-DD',status:'open'|'completed', lines:[{key,name,sup,unit,qty,price,src}], completed?}}`
    (`line.src` = `'tier'` | `'manual'`; `line.price` may be `''` = needs price)
  - `/pricetiers`: `{tierId: {id,name,rule:{type:'shop'|'shopAdj'|'costPlus'|'manual', pct?}}}`
    Seeded defaults: retail {shop}, cafe {shopAdj,-10}, restaurant {costPlus,20},
    agedcare {costPlus,12}, wholesale {costPlus,8}.
- **Tier pricing** (`tierPrice(custId,key)` → `number | '' | 'SETCOST'`):
  shop → sell; shopAdj → round2(sell·(1+pct/100));
  costPlus → cost null/0 ? `'SETCOST'` : round2(cost·(1+pct/100)); manual → `''`.
  UI: `'SETCOST'` renders as a small red chip; `''` renders as — until tapped.
- **Auth**: Firebase Identity Toolkit REST. Email = `username + '@happydaysgrocer.app'`.
  Login-only in v2 (account creation stays in the old app). Token auto-refresh
  via securetoken endpoint.
- **localStorage** (namespaced `hd2.*`, never collides with the old app):
  `hd2.buylist` `{key:qty}` · `hd2.auth` · `hd2.customers` / `hd2.orders` /
  `hd2.tiers` (mirrors) · `hd2.lastSync` (timestamp, MORE view).
- **Offline-first**: views render from local mirrors instantly; `pull()`
  refreshes mirrors and resolves even offline; `patch()` is fire-and-forget
  (no-op when logged out).

## Reactive rendering (how the views work)

- `store.js` exposes `bus()` (tiny pub/sub) and emits **`'change'` after any
  mutation** (buy list, saveOrder, saveCustomer, pull, …).
- `catalog.js` owns the reactive core: each view registers via
  `setActive(renderFn)`. A single listener on `bus('change')` **and** on `#q`
  `input` schedules ONE coalesced re-render per animation frame, restoring the
  scroll position. Mutating store state is therefore enough — never re-render
  by hand after a mutation (use `rerenderNow()` only for pure-UI state changes
  like chip selection or sub-view navigation).
- Views read the global search input `#q` value at render time
  (`qText()` from catalog.js).
- `orders.js` keeps its sub-view state (customer list vs take-order screen,
  selected category chip) in module-level variables.

## Shared UI kit (`js/catalog.js` exports — reuse, don't duplicate)

`setActive, rerenderNow, openSheet(build, {static?}), closeSheet, refreshSheet,
toast(msg), shareText(text) (navigator.share → clipboard fallback),
esc, money, asList, qText, todayStr, chipsHTML(cats, selected),
stepperHTML(key, qty), emptyHTML, skeletonHTML, ensureCss`

- The **bottom sheet** is a single shared instance. Non-static sheets rebuild
  on every `'change'` (live lists); pass `{static:true}` for typing forms.
- Styles are **injected** by `catalog.js` under namespaced `hdv-*` classes so
  they cannot collide with `css/app.css`. Click handling is delegated via
  `root.onclick` (re-assigned per render — never `addEventListener` on the
  view root).

## Design tokens

- Green `#15662f` (primary) · light green `#eaf4ec` · yellow `#f4d03f` ·
  red `#b91c1c` · dark text `#0d2818`.
- Font: `-apple-system, 'Segoe UI', Roboto, sans-serif`. Radii 12px. Subtle
  shadows. Dark mode via `@media (prefers-color-scheme: dark)` (the view kit
  defines `--hdv-*` variables for both schemes).
- Tap targets ≥ 44px (steppers), bottom nav 56px, `env(safe-area-inset-bottom)`
  respected by the summary bar / sheet / toast.

## Assets (live at repo root — reference as `../`)

`../happydays-wordmark.png` · `../happydays-icons.png` · `../icon-192.png` ·
`../icon-512.png` · `../shopProducts.js` · old app `../index.html`
("Classic app" link in MORE).

## Versioning

Bump the `v2.0.0` stamp in `renderMore` (orders.js) and the `hd2-v1` cache
name in `sw.js` together whenever shipping a user-visible change.
