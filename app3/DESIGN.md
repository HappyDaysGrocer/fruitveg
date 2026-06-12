# Happy Days In-House — v3.2 Design ("Operator-First")

**Status:** Approved design for the v3.2 redesign. Chosen unanimously (3/3 independent
judges) from three competing directions after a study of world-class apps across five
domains: B2B produce ordering (Fresho, Rekki, Choco, Pepper, Vori), consumer grocery
(Instacart, Woolworths, Flink, Picnic), POS back-office (Square, Shopify POS, Lightspeed),
craft/interaction (Linear, Things 3, Superhuman, Arc), and money dashboards (Stripe,
Ramp, Mercury, Revolut Business).

**One-liner:** a one-thumb, offline-first market-floor cockpit where the always-live
Buy Run is home, every number lands the instant you tap, and the 600-product catalogue,
customer orders, costs/margins, stocktake and P&L are one swipe or one search away —
never losing your place, never leaking a cost into a public file.

**The owner's brief:** "the best architecture; it needs to FLOW; everything seamless;
user experience above all — but still the same core data and usability."
**Nothing is removed.** Every node and feature maps 1:1 (see §6).

---

## 1. Philosophy

v3 is not a back-office app you visit — it is a tool you hold while doing a physical
job at 5am at Melbourne Market and again behind a busy counter. Every decision answers:
*"what is the operator's next physical task, and how do they do it in one thumb without
losing their place?"*

Three non-negotiables:
1. **Works with NO signal** — catalogue + buy list render from localStorage, writes queue.
2. **No cost/finance/supplier byte ever ships in the public bundle** — sensitive data
   overlays post-login from locked Firebase nodes into memory only.
3. **One shared standard per concept** (one search matcher, one stepper, one sheet,
   one `money()`/`percent()` formatter, one motion token set) applied app-wide in one
   pass — the owner never re-asks per screen.

We are NOT rewriting store.js. The redesign is a world-class operator skin on the
existing verified spine (8 mirrors + pull()/patch(), secure overlay, tierPrice,
buyRunList, setActive reactive core, openSheet singleton).

## 2. Information architecture

**AXIS 1 — five operator JOBS = five fixed bottom tabs (the spine, never grows):**

| Tab | Job | Today's module |
|-----|-----|----------------|
| **BUY** (home/default) | the live Mandi run | buyrun.js (extend) |
| **ORDERS** | take/repeat/collate/pick customer orders | orders.js (extend) |
| **STOCK** | catalogue browse + availability + stocktake + barcodes + sell prices | catalog.js renderShop (rename, extend) |
| **MONEY** | takings, cost/sell/margin, P&L, expenses — post-login only | money.js (extend) |
| **MORE** | suppliers, tiers, runs, specials, standing, broadcast, invoice scan, sync, sign out | orders.js renderMore (extend) |

Everything deeper lives behind MORE or the command bar — the spine never sprawls as
v1's features land.

**AXIS 2 — the same product faceted per job:** aisle order when selling/browsing
(Stock, Orders); stall/walk order when buying (Buy); per-piece/kg for customers;
whole boxes at the market. New facets: `unit/pack/box-size` (safe → public catalog.js),
`stall/supplier` and `par` (**sensitive → locked /catalog blob ONLY** — see §7).

**Three-tier discovery, enforced identically everywhere:**
(1) EXPRESS LANE = global #q search (+ command bar) — fastest on a known item;
(2) DEFAULT SURFACE = what I actually do (live Buy Run / customer's usual / today's takings);
(3) FALLBACK = aisle/stall browse. Browse is never home.

## 3. Navigation model

- Fixed 5-tab bottom bar (44px+ targets), views **pre-mounted and toggled by display,
  never remounted** — switching Buy↔Orders mid-run is instant and keeps scroll.
- **One hard login wall up front** (existing). After that, everything flows open —
  the wall gates DATA, not shell paint.
- Quick edits (price, count, qty, customer pick) are **bottom sheets** over the stable
  list (existing openSheet singleton), never full navigations.
- **Command bar** (searchBar.js, NEW — optional accelerator, never the required path):
  fuzzy overlay over the in-memory catalogue + a static actions registry (jump to
  product, set sell price, mark out, add to buy run, open customer/supplier, log
  expense). Opened by long-press on the + FAB or pull-down on the header. Every job
  stays reachable by tab + thumb (6 non-technical staff — gestures must never be the
  only path).
- **Contextual + FAB** (Things "Magic Plus"): in Buy it adds a product, in an Order a
  line, in Stock a count, in Money an expense. Long-press = command bar.
- NO hamburger drawer, NO top-of-screen primary actions, NO second gate per screen.

## 4. Signature flows

- **Morning buy run:** open at the market → resumes in 0ms from LS onto the live run,
  grouped by stall in walk order, quantities pre-rolled from open orders. Glance the
  suggested qty (par − on-hand, EPOS velocity informed, post-login), nudge with +/-
  (instant, optimistic), tap the number for a numpad sheet on big box counts. Tick a
  line "reviewed" — top counter climbs "8/22". Signal drops → taps land locally, the
  outbox shows "syncing 3…" and flushes on reconnect. Bottom bar: lines / boxes /
  (post-login) running $ spend. Share exports text; Send (later phase) auto-splits
  per-stall.
- **Repeat a customer order:** Orders → customer card ("Order by 9pm tonight for
  delivery Sat" banner) → "Repeat last order" clones instantly → adjust deltas →
  review sheet → Share/Complete. Demand flows straight into the Buy Run rollup.
- **Check cost/sell/margin:** search anywhere → tap product → one shared detail sheet:
  sell, cost, margin % colour-graded, 7/30-day velocity (all post-login), one-tap
  Reprice. Same sheet from Money, Stock, or Buy rows.
- **Today's money:** Money tab → hero number (today's takings) counts up as the locked
  fetch lands; "Needs attention" strip above (low margin → Reprice, spend missing an
  invoice → Match, bought-not-in-EPOS → Add); Today/Week/Month/YTD re-scopes the card
  stack (P&L, gross margin %, COGS, owed) with sparkline cross-fade.
- **Stocktake:** Stock → Count mode → camera live (BarcodeDetector; WASM fallback or
  manual entry on iOS) → scan = +1, unknown barcode → "Assign to a product?" (progressive
  barcoding) → counts stage as a DRAFT → "Apply 14 changes" commits.
- **Find anything:** one searchCatalog token-set matcher (multi-word, any order),
  100% client-side, results add inline with a stepper — never leave search.

## 5. Visual & motion system (the discipline pass — do ONCE, app-wide)

- Palette: existing brand (green #15662f, ink #0d2818) + dark scheme. Semantic colour
  carries MEANING only: positive green / negative red #b91c1c / attention amber #b45309;
  margin grading ≥35 green, 18–35 amber, <18 red. Delta chips pair colour with +/− and
  an up/down glyph (colour-blind + bright-dawn safe). **Cost polarity inverted (cost
  up = red) centralised in one `deltaChip()`.**
- Type: one scale 12/14/16/20/28; **`tabular-nums` on every price/qty** (no jitter in
  count-ups); right-aligned numeric columns. **One `money()` and one `percent()`**
  (AUD, comma thousands, 2dp) everywhere.
- Spacing: one 4/8/12/16/24/32 scale. Density: compact ~44px rows for scanning lists
  (Buy/Stock/Orders), comfortable for decision/money sheets.
- Motion tokens: `--dur-fast:120ms / --dur-base:200ms / --dur-screen:300ms`,
  standard/decelerate/accelerate easings, **transform+opacity only**, wrapped in
  `prefers-reduced-motion`. Asymmetric in/out.
- Skeletons tied to the security model: static shells paint instantly, ONLY sensitive
  figures shimmer until the locked-node fetch lands — the no-baked-finance rule reads
  as speed, not delay.
- Haptics: Vibration API on Android (no-op iOS), always paired with a visual cue.

## 6. Core data preservation (the contract)

All 13 data nodes unchanged: customers, orders/custorders, tiers/pricetiers, runs,
specials, standing/standingorders, availability, buyrun, catalog (+CATALOG_BY_KEY),
local buy map, secure cost overlay (locked /catalog → memory, cached hd3.secure),
EPOS90. All 19 features land on a named surface (Buy Run → Buy; Shop/catalogue →
Stock; take-order/tier pricing/review/complete → Orders; tiers/specials/standing/runs/
customers/availability editors → More + live on order lines; cost-margin + secureLoaded
banner → Money; login wall, picking sheet, customer-scoped access → unchanged).
Price resolution order kept verbatim: **per-customer price > special > tier rule > shelf**.
Standing rule kept: restaurant demand is annotation-only, NEVER in the +/- buy counter.
Manual-only stepper rule kept: Buy Run +/- adjusts the manual part, can't drop below
order demand. We ADD facets and v1 ports; we REMOVE nothing.

## 7. Security invariants (override anything above if in conflict)

1. No cost, finance, par, velocity, **or supplier/stall data** in any public static
   file. (The proposal suggested stall facets in catalog.js — REJECTED: supplier data
   is sensitive per the standing directive. Stall/supplier/par/velocity live ONLY in
   the locked /catalog blob, loaded post-login.) Safe for public catalog.js: unit/pack/
   box-size, synonyms.
2. Chokepoint rule: only `loadSecureCatalog()` may write `hd3.secure`. build-catalog.cjs
   keeps (and extends) its leak guard that REJECTS any cost field in the public output.
3. One hard login wall; 6 staff accounts; customer logins remain scoped (v2 behaviour).
4. EPOS API key: only in the local credentials file, read on-demand, never
   stored/cached/committed/online. EPOS writes are owner-approval-gated, test-first.

## 8. Build phases (each ships as a version bump)

- **v3.2 — the spine:** design tokens + discipline pass (money/percent/deltaChip/
  tabular-nums/motion vars); tab rename Shop→Stock; Buy Run reviewed-tick + progress
  counter + numpad sheet; per-row optimistic re-render on steppers; version badge bump.
- **v3.3 — flow accelerators:** command bar (searchBar.js); offline outbox + "syncing
  N… / all saved" status (More sync row + quiet indicator); unified product detail
  sheet (sell/cost/margin/velocity/reprice) reachable from every row.
- **v3.4 — money comes alive:** hero takings + Today/Week/Month/YTD + sparklines +
  count-up; Needs-Attention strip with in-place actions; deep links with state pre-set.
  ⚠ Gated on the owner's one-time Firebase password paste (locked /catalog + /finance
  population) and the EPOS daily feed landing in a locked node.
- **v3.5 — stock jobs:** scan-first stocktake (BarcodeDetector + fallback), progressive
  barcode assignment, draft-then-apply counts, sell-price entry sheet.
- **v3.6 — buy run pro:** stall walk-order grouping (locked facet), par suggestions,
  box conversion in the run, per-stall Send. Suppliers directory in More.
- Later: picking slip polish, recipes/menu costing, bakery wastage, invoice-scan AI,
  P&L detail — same spine, same pattern.

## 9. Known risks (engineer against these)

- BarcodeDetector is Android-Chrome only → WASM fallback (zxing-wasm as a real ES
  module) or manual entry; iOS staff exist.
- Virtualised 600-row list in vanilla JS must be built once as a shared primitive —
  mis-implementation breaks coalesced-RAF scroll preservation.
- Outbox needs ordering, dedupe and last-write-wins care so a queued qty can't clobber
  a teammate's newer /buyrun value.
- Presence ("Riya is on Aisle 3") is best-effort/polled — architecture is pull()-on-
  action, no WebSockets. Set expectations.
- Gestures (swipes, long-press) are accelerators only — every action has a visible
  control so non-technical staff are never forced to discover hidden gestures.
- Par/velocity/ranking degrade gracefully to today's orders-only rollup until locked
  data is populated (current behaviour).
