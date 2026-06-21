/* Happy Days v2 — catalog.js
   SHOP view + the shared UI kit (injected styles, bottom sheet, toast,
   chip rail, steppers, reactive re-render core) that orders.js reuses.
   Renders into the root element passed by app.js and re-renders
   reactively whenever the store emits 'change' or #q input changes. */

import {
  catalog, categories, groups, orderedCats, searchCatalog, bus, auth,
  isOut, setOut, marginInfo, eposFor, secureLoaded, setBuyManual, buyManualQty,
  stockFor, setStockCount, setBoxSize, buyRunList
} from './store.js';
import { purchaseUnit, purchaseUnitLabel, boxMath } from './boxes.js';

/* ------------------------------------------------------------ helpers */

export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const money = n =>
  (typeof n === 'number' && isFinite(n)) ? '$' + n.toFixed(2) : '';

/* The ONE phone standard (used by the buy-run stall directory and anywhere a
   supplier/customer number is shown): pretty-print AU numbers, then tap to
   call, tap ✉️ to SMS. The anchors carry class "hdv-tel" so row-level click
   handlers can ignore them (let the tel:/sms: default fire). */
export const fmtPhone = raw => {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 9) d = '0' + d;
  if (d.length !== 10) return String(raw);
  return (d.slice(0, 2) === '04' || d.slice(0, 2) === '05')
    ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7)
    : d.slice(0, 2) + ' ' + d.slice(2, 6) + ' ' + d.slice(6);
};
export function phoneLinkHTML(phone) {
  if (!phone) return '';
  const tel = String(phone).replace(/[^0-9+]/g, '');
  return `<a class="hdv-tel" href="tel:${tel}">📞 ${esc(fmtPhone(phone))}</a>` +
    `<a class="hdv-tel sms" href="sms:${tel}">✉️ SMS</a>`;
}

/* The ONE percent formatter (whole numbers read fastest on the floor). */
export const percent = n =>
  (typeof n === 'number' && isFinite(n)) ? Math.round(n) + '%' : '';

/* The ONE delta chip. Colour is paired with an explicit sign + arrow so the
   meaning survives colourblindness and bright dawn-market screens. Cost
   polarity is inverted via goodWhenDown (a cost going UP is bad = red). */
export function deltaChip(delta, opts) {
  if (typeof delta !== 'number' || !isFinite(delta) || delta === 0) return '';
  const o = opts || {};
  const fmt = o.fmt || money;
  const up = delta > 0;
  const good = o.goodWhenDown ? !up : up;
  return `<span class="hdv-delta ${good ? 'good' : 'bad'}">` +
    `${up ? '▲ +' : '▼ −'}${fmt(Math.abs(delta))}</span>`;
}

export const todayStr = () => {
  const d = new Date(), p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Firebase mirrors may come back as {id:rec} objects or arrays — normalise. */
export const asList = x => Array.isArray(x) ? x.slice() : Object.values(x || {});

/* Current value of the global sticky search input (#q lives in index.html). */
export function qText() {
  const q = document.getElementById('q');
  return q ? q.value.trim() : '';
}

/* ------------------------------------------- reactive re-render core
   Each render function registers itself via setActive(). Any store
   mutation (bus 'change') or keystroke in #q schedules ONE coalesced
   re-render per animation frame, preserving the scroll position. */

let activeRender = null;
let wired = false, pending = false;

export function setActive(render) {
  activeRender = render;
  if (wired) return;
  wired = true;
  bus().on('change', schedule);
  const q = document.getElementById('q');
  if (q) q.addEventListener('input', schedule);
}

function schedule() {
  if (pending) return;
  pending = true;
  const run = () => {
    pending = false;
    const y = window.scrollY;
    if (activeRender) activeRender();
    window.scrollTo(0, y);
    refreshSheet();
  };
  // RAF never fires while the page is hidden (screen lock, backgrounded
  // PWA) — a change landing then would stall the repaint until the next
  // visible frame. Fall back to a macrotask so state is never stale.
  if (document.visibilityState === 'hidden') setTimeout(run, 0);
  else requestAnimationFrame(run);
}

/* Immediate re-render (chip taps, sub-view navigation, logout, …). */
export function rerenderNow() {
  if (activeRender) activeRender();
}

/* ------------------------------------------------------- bottom sheet
   Single shared sheet. openSheet(build) — build(bodyEl) paints content.
   Non-static sheets are rebuilt on every 'change' so they stay live;
   pass {static:true} for forms so typing never gets wiped. */

let sheetWrap = null, sheetBody = null, sheetBuilder = null, sheetStatic = false;
let sheetOnClose = null;

function ensureSheet() {
  if (sheetWrap) return;
  ensureCss();
  sheetWrap = document.createElement('div');
  sheetWrap.className = 'hdv-sheet';
  sheetWrap.innerHTML =
    '<div class="hdv-dim" data-close="1"></div>' +
    '<div class="hdv-panel"><div class="hdv-grab"></div>' +
    '<div class="hdv-sheetbody"></div></div>';
  document.body.appendChild(sheetWrap);
  sheetBody = sheetWrap.querySelector('.hdv-sheetbody');
  sheetWrap.addEventListener('click', e => {
    if (e.target.dataset && e.target.dataset.close) closeSheet();
  });
}

export function openSheet(build, opts) {
  ensureSheet();
  if (sheetOnClose) { try { sheetOnClose(); } catch (e) { /* never block */ } }
  sheetBuilder = build;
  sheetStatic = !!(opts && opts.static);
  sheetOnClose = (opts && opts.onClose) || null;   // cleanup hook (camera etc.)
  sheetBody.innerHTML = '';
  // The body element is a singleton: clear handlers a previous sheet set
  // via property assignment so they can't leak into this one. (onclick is
  // reassigned by every builder anyway; onkeydown only by some.)
  sheetBody.onclick = null;
  sheetBody.onkeydown = null;
  build(sheetBody);
  sheetWrap.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeSheet() {
  if (!sheetWrap) return;
  sheetWrap.classList.remove('open');
  sheetBuilder = null;
  if (sheetOnClose) { try { sheetOnClose(); } catch (e) { /* never block */ } }
  sheetOnClose = null;
  document.body.style.overflow = '';
}

export function refreshSheet() {
  if (sheetWrap && sheetWrap.classList.contains('open') &&
      sheetBuilder && !sheetStatic) {
    sheetBody.innerHTML = '';
    sheetBuilder(sheetBody);
  }
}

/* --------------------------------------------------------------- toast */

let toastTimer = null;
export function toast(msg) {
  ensureCss();
  let t = document.querySelector('.hdv-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'hdv-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ----------------------------------------------------- share / clipboard */

export async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); } catch (e) { /* user cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch (e) {
    toast('Could not share');
  }
}

/* ----------------------------------------------------- shared UI pieces */

/* Horizontal category chip rail; sticks just under the search box. */
export function chipsHTML(cats, selected) {
  const chip = (label, val) =>
    `<button class="hdv-chip${val === selected ? ' on' : ''}"
       data-act="chip" data-cat="${esc(val)}">${esc(label)}</button>`;
  return `<div class="hdv-chips" style="top:${stickyTop()}px">` +
    chip('All', '') + cats.map(c => chip(c, c)).join('') + '</div>';
}

function stickyTop() {
  const q = document.getElementById('q');
  if (!q) return 0;
  return Math.max(0, Math.round(q.getBoundingClientRect().bottom + 4));
}

/* Big-thumb +/- stepper (44px targets). data-act inc/dec handled by views. */
export function stepperHTML(key, qty) {
  return `<div class="hdv-step">
    <button class="hdv-sbtn" data-act="dec" data-key="${esc(key)}" aria-label="less">&minus;</button>
    <span class="hdv-qty">${Number(qty) || 0}</span>
    <button class="hdv-sbtn plus" data-act="inc" data-key="${esc(key)}" aria-label="more">+</button>
  </div>`;
}

export function emptyHTML(msgHtml) {
  return `<div class="hdv-empty">${msgHtml}</div>`;
}

export function skeletonHTML(n = 8) {
  let h = '';
  for (let i = 0; i < n; i++) {
    h += '<div class="hdv-skel"><div class="hdv-skel-a"></div><div class="hdv-skel-b"></div></div>';
  }
  return h;
}

/* ------------------------------------------------------------ SHOP view */

let shopCat = ''; // selected category chip ('' = All)

/* STOCK ON HAND view (v3.47). This tab is about what we physically have on the
   shelf — NOT a shopping list (all buying lives in the Buy tab / buy run). Each
   row's +/- adjusts the COUNTED on-hand quantity (setStockCount); "Count stock"
   opens the fast scan/search counter; tapping a product opens its detail (where
   it can be marked out of stock or added to the buy run). */
/* Items the Stock-on-hand page covers: the Mundi PRODUCE you buy at the market,
   plus any grocery line bought in a box / bag / carton (bulk). */
const PRODUCE_GROUPS = new Set(['A-B', 'C-G', 'H-O', 'P-R', 'S-Z', 'Herbs']);
const BULK_NAME_RE = /\b(cartons?|boxe?s?|bags?|sacks?|cases?|crates?|trays?|sleeves?)\b|\b\d+(?:\.\d+)?\s*kg\b|\b\d+\s*x\s*\d|\b\d+\s*(?:pk|packs?)\b/i;
export function inStockScope(p) {
  if (!p) return false;
  if (PRODUCE_GROUPS.has(p.cat) || PRODUCE_GROUPS.has(p.group)) return true;   // fresh produce
  return BULK_NAME_RE.test(p.name);                                            // bulk grocery
}

/* Buy-run cross-reference (the brief): show "to buy: N" from the LIVE buy run on
   each stock line + a Buy-run-only filter. _buyMap (key -> qty to buy) is rebuilt
   each render; stockBuyOnly narrows the list to what's on the run. */
let stockBuyOnly = false;
let _buyMap = new Map();

/* Short "to buy" label in market units: "2 boxes" / "1.5 kg" (loose) / raw qty. */
function buyLabel(name, qty) {
  const m = boxMath(name, qty);
  if (!m) return String(qty);                         // no box rule -> raw qty
  if (m.loose) return qty + ' kg';
  return m.boxes + ' box' + (m.boxes === 1 ? '' : 'es');
}

export function renderShop(root) {
  ensureCss();
  setActive(() => renderShop(root));

  const all = catalog();
  if (!all.length) {             // catalogue still loading -> shimmer
    root.innerHTML = skeletonHTML();
    root.onclick = null;
    return;
  }
  const items = all.filter(inStockScope);   // produce + bulk grocery only
  _buyMap = new Map(buyRunList().map(x => [x.key, Number(x.total) || 0]));   // live buy run

  const q = qText();
  let list = q ? searchCatalog(q).filter(inStockScope) : items;
  if (shopCat) list = list.filter(p => p.group === shopCat);   // chip = aisle
  if (stockBuyOnly) list = list.filter(p => _buyMap.has(p.key));   // only what's on the buy run

  const today = todayStr();
  let countedToday = 0, outN = 0;
  for (const p of items) {
    const s = stockFor(p.key); if (s && s.at === today) countedToday++;
    if (isOut(p.key)) outN++;
  }

  const onRun = items.filter(p => _buyMap.has(p.key)).length;
  let h = `<div class="hdv-head"><div class="hdv-h1">Stock on hand</div>
    <div style="display:flex;gap:6px">
      <button class="${stockBuyOnly ? 'hdv-btnP' : 'hdv-btnG'} slim" data-act="buyonly">🛒 Buy run${stockBuyOnly ? ' ✓' : ''}</button>
      <button class="hdv-btnG slim" data-act="count">Count stock</button>
    </div></div>`;
  h += `<div class="hdv-sec">${stockBuyOnly
    ? 'Showing the ' + onRun + ' item' + (onRun === 1 ? '' : 's') + ' on the buy run — count what you bought'
    : 'Counted by the BOX / BAG you buy at the market · ' + countedToday + ' counted today · ' + onRun + ' on the buy run'} · tap the number to type any amount (e.g. 1.5)</div>`;

  // chips: only the aisles that actually have in-scope items
  const live = new Set(items.map(p => p.group));
  h += chipsHTML(groups().filter(g => live.has(g)), shopCat);

  if (q) {
    if (!list.length) {
      h += emptyHTML(`No stock items match “${esc(q)}”`);
    } else {
      h += `<div class="hdv-sec">${list.length} result${list.length === 1 ? '' : 's'}</div>`;
      h += list.map(p => stockRow(p, true)).join('');
    }
  } else {
    // aisle/shelf layout: sections are the fine categories, ordered by aisle.
    const byCat = new Map();
    for (const p of list) {
      if (!byCat.has(p.cat)) byCat.set(p.cat, []);
      byCat.get(p.cat).push(p);
    }
    for (const c of orderedCats(shopCat || undefined)) {
      const g = byCat.get(c);
      if (!g || !g.length) continue;
      h += `<div class="hdv-sec">${esc(c)}</div>` + g.map(p => stockRow(p, false)).join('');
    }
  }

  h += '<div class="hdv-pad"></div>';
  root.innerHTML = h;
  root.onclick = onShopClick;
}

/* One product as a STOCK row: name (+ OUT / NEW flags), its market PURCHASE
   unit (box / bag), on-hand counted in those units (+ kg/each equivalent), and
   a stepper. The counted qty (stockFor.qty) is now the number of boxes/bags. */
function stockRow(p, withCat) {
  const st = stockFor(p.key);
  const onHand = st ? (Number(st.qty) || 0) : null;
  const out = isOut(p.key);
  const u = purchaseUnit(p.name);
  const unitLbl = purchaseUnitLabel(p.name);            // "12kg box" | "loose · by weight" | ''
  const word = u.kind === 'loose' ? 'kg' : (u.word || 'unit');

  let onHandTxt;
  if (onHand == null) {
    onHandTxt = 'not counted';
  } else {
    const plural = (onHand === 1 || u.kind === 'loose') ? '' : 's';
    let eq = '';
    if (u.kind === 'box' && u.per > 0) {
      const total = Math.round(onHand * u.per * 100) / 100;
      eq = u.by === 'kg' ? ` ≈ ${total}kg` : ` ≈ ${total} ${u.by === 'each' ? 'pcs' : u.by}`;
    }
    onHandTxt = `${onHand} ${word}${plural} on hand${eq}` + (st.at ? ' · ' + esc(st.at) : '');
  }

  const bits = [];
  if (withCat && p.cat) bits.push(esc(p.cat));
  bits.push(unitLbl ? esc(unitLbl)
    : '<span style="color:var(--hdv-amber)">tap to set box size</span>');
  bits.push(onHandTxt);

  const badge = out
    ? ' <span class="hdv-tchip" style="background:rgba(185,28,28,.14);color:#b91c1c">OUT</span>' : '';
  const rev = p.review
    ? ' <span class="hdv-newchip">NEW · review</span>' : '';
  const toBuy = _buyMap.get(p.key);                    // qty the buy run says to buy
  const buyChip = (toBuy > 0)
    ? ` <span class="hdv-tchip" style="background:rgba(21,102,47,.14);color:var(--hdv-green);font-weight:700">buy ${esc(buyLabel(p.name, toBuy))}</span>`
    : '';
  return `<div class="hdv-row${out ? ' review' : ''}">
    <div class="hdv-info" data-act="detail" data-key="${esc(p.key)}">
      <div class="hdv-name">${esc(p.name)}${rev}${badge}${buyChip}</div>
      <div class="hdv-sub">${bits.join(' · ')}</div>
    </div>
    ${stockStepper(p.key, onHand == null ? 0 : onHand)}
  </div>`;
}

/* Stepper for the Stock tab: the on-hand number is tap-to-type; +/- step by 1. */
function stockStepper(key, qty) {
  return `<div class="hdv-step">
    <button class="hdv-sbtn" data-act="dec" data-key="${esc(key)}" aria-label="less">&minus;</button>
    <span class="hdv-qty" data-act="editstock" data-key="${esc(key)}" title="tap to type"
      style="cursor:pointer;text-decoration:underline dotted">${qty}</span>
    <button class="hdv-sbtn plus" data-act="inc" data-key="${esc(key)}" aria-label="more">+</button>
  </div>`;
}

/* Tap the on-hand number to TYPE it directly (any amount, decimals like 1.5 / 0.5). */
function editStockInline(elm, key) {
  const p = catalog().find(x => x.key === key);
  const st = stockFor(key);
  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = 'any'; inp.min = '0'; inp.inputMode = 'decimal';
  inp.className = 'hdv-pin';
  inp.value = st ? (Number(st.qty) || 0) : '';
  elm.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = parseFloat(inp.value);
    if (isFinite(v) && v >= 0) setStockCount(key, p ? p.name : key, Math.round(v * 1000) / 1000);  // 0 = counted zero
    else rerenderNow();                                  // blank/invalid -> restore the number
  };
  inp.addEventListener('change', commit);
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
}

function onShopClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, key = t.dataset.key;
  if (act === 'buyonly') { stockBuyOnly = !stockBuyOnly; rerenderNow(); return; }
  if (act === 'chip') { shopCat = t.dataset.cat; rerenderNow(); return; }
  if (act === 'detail') { openSheet(productSheet(key)); return; }
  if (act === 'count') { import('./stock.js').then((m) => m.openCountSheet()); return; }
  if (act === 'editstock') { editStockInline(t, key); return; }   // tap number -> type any amount
  if (act === 'inc' || act === 'dec') {                     // adjust the COUNTED on-hand qty
    const st = stockFor(key);
    const cur = st ? (Number(st.qty) || 0) : 0;
    if (act === 'dec' && cur <= 0) return;                  // don't create a count by tapping − on an uncounted item
    const p = catalog().find(x => x.key === key);
    setStockCount(key, p ? p.name : key, act === 'inc' ? cur + 1 : cur - 1);  // store emits 'change'
  }
}

/* ---- unified product detail sheet (v3.3, DESIGN.md) ----
   ONE component, opened by tapping a row's info area in Buy / Stock /
   search. Sell is public; cost, profit, margin and 90-day velocity render
   only once the locked overlay has loaded (secureLoaded) — never from a
   static file. Non-static, so a store 'change' refreshes it live. */

const gradeColor = (pct) =>
  pct >= 35 ? 'var(--hdv-green)' : pct >= 18 ? 'var(--hdv-amber)' : 'var(--hdv-red)';

export function productSheet(key) {
  return (body) => {
    const p = catalog().find((x) => x.key === key);
    if (!p) { body.innerHTML = emptyHTML('Product not found'); return; }
    const out = isOut(key);
    const mi = secureLoaded() ? marginInfo(key) : null;
    const ep = secureLoaded() ? eposFor(p.name) : null;
    const manual = buyManualQty(key);

    let h = `<div class="hdv-sheettitle">${esc(p.name)}</div>
      <div class="hdv-sheetsub">${esc([p.cat, p.group].filter(Boolean).join(' · '))}
        ${out ? ' · <span style="color:var(--hdv-red);font-weight:800">OUT TODAY</span>' : ''}</div>
      <div class="hdv-kv"><span class="hdv-mut">Sell</span>
        <b class="hdv-price" style="min-width:0">${money(p.sell) || '—'}</b></div>`;
    if (mi && typeof mi.cost === 'number') {
      h += `<div class="hdv-kv"><span class="hdv-mut">Cost</span>
          <b class="hdv-price" style="min-width:0">${money(mi.cost)}</b></div>
        <div class="hdv-kv"><span class="hdv-mut">Profit / margin</span>
          <b class="hdv-price" style="min-width:0">${money(mi.profit)} ·
            <span style="color:${gradeColor(mi.marginPct)}">${percent(mi.marginPct)}</span></b></div>`;
    } else {
      h += `<div class="hdv-sheetsub">Cost &amp; margin appear once the secure
        cost data is loaded (sign in${secureLoaded() ? '' : ' — costs not uploaded yet'}).</div>`;
    }
    if (ep && (Number(ep.qty) || 0) > 0) {
      h += `<div class="hdv-kv"><span class="hdv-mut">Sold (last 90 days)</span>
        <b class="hdv-price" style="min-width:0">${Number(ep.qty)}${typeof ep.revIncVAT === 'number' ? ' · ' + money(ep.revIncVAT) : ''}</b></div>`;
    }
    if (manual > 0) {
      h += `<div class="hdv-kv"><span class="hdv-mut">On the buy run</span>
        <b class="hdv-price" style="min-width:0">+${manual} manual</b></div>`;
    }
    const u = purchaseUnit(p.name);
    const unitLbl = purchaseUnitLabel(p.name);
    const st = stockFor(key);
    if (st && typeof st.qty === 'number') {
      const word = u.kind === 'loose' ? 'kg' : (u.word || 'unit');
      const n = Number(st.qty) || 0;
      let eq = '';
      if (u.kind === 'box' && u.per > 0) {
        const total = Math.round(n * u.per * 100) / 100;
        eq = u.by === 'kg' ? ' · ≈ ' + total + 'kg' : ' · ≈ ' + total + ' ' + (u.by === 'each' ? 'pcs' : u.by);
      }
      h += `<div class="hdv-kv"><span class="hdv-mut">On hand</span>
        <b class="hdv-price" style="min-width:0">${n} ${esc(word)}${(n === 1 || u.kind === 'loose') ? '' : 's'}${eq}${st.at ? ' · ' + esc(st.at) : ''}</b></div>`;
    }
    h += `<div class="hdv-kv"><span class="hdv-mut">Market box</span>
      <b class="hdv-price" style="min-width:0">${unitLbl ? esc(unitLbl) : '<span style="color:var(--hdv-amber)">not set</span>'}</b></div>`;
    h += `<div class="hdv-actions">
      <button class="hdv-btnG" data-act-ps="setbox">Set box size</button>
      <button class="hdv-btnG${out ? '' : ' danger'}" data-act-ps="out">
        ${out ? 'Back in stock' : 'Out today'}</button>
      <button class="hdv-btnP" data-act-ps="buy">Add to buy run</button>
    </div>`;

    body.innerHTML = h;
    body.onclick = (e) => {
      const t = e.target.closest('[data-act-ps]');
      if (!t) return;
      if (t.dataset.actPs === 'out') {
        setOut(key, p.name, !isOut(key));       // 'change' refreshes this sheet
        toast(isOut(key) ? 'Marked out for today' : 'Back in stock');
      } else if (t.dataset.actPs === 'buy') {
        setBuyManual(key, p.name, buyManualQty(key) + 1);
        toast('Added to buy run');
      } else if (t.dataset.actPs === 'setbox') {
        setBoxSizeFlow(p);
      }
    };
  };
}

/* Owner sets/corrects a product's market box size from the detail sheet.
   Writes /boxsizes (shared team-wide); the Stock page re-renders in the new unit. */
function setBoxSizeFlow(p) {
  const cur = purchaseUnit(p.name);
  const def = (cur.kind === 'box' && cur.per > 0) ? cur.per + ' ' + cur.by : '';
  const v = window.prompt(
    'Box size for ' + p.name + '\n' +
    'e.g. "12 kg", "10 bunch", "12 punnet", "20 each".\n' +
    'Leave blank to clear back to the default.', def);
  if (v == null) return;                                  // cancelled
  const s = String(v).trim().toLowerCase();
  if (s === '') { setBoxSize(p.name, 0, 'kg'); toast('Box size cleared'); refreshSheet(); return; }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(kg|each|ea|pc|pcs|piece|pieces|bunch|bunches|punnet|punnets|bag|box|carton)?/);
  if (!m) { toast('Could not read that — try like “12 kg”'); return; }
  let by = m[2] || 'kg';
  if (['ea', 'pc', 'pcs', 'piece', 'pieces'].includes(by)) by = 'each';
  else if (by === 'bunches') by = 'bunch';
  else if (by === 'punnets') by = 'punnet';
  else if (['bag', 'box', 'carton'].includes(by)) by = 'kg';   // worded unit, size taken as kg
  setBoxSize(p.name, parseFloat(m[1]), by);
  toast('Box size saved');
  refreshSheet();
}

/* (The old ad-hoc "market list" that lived on this tab was removed in v3.47 — it
   duplicated the demand-driven Buy run. All buying now lives in the Buy tab.) */

/* ------------------------------------------------- injected view styles
   Namespaced hdv-* so nothing in css/app.css can collide. Uses the brand
   palette from the build spec with a prefers-color-scheme dark variant. */

let cssDone = false;
export function ensureCss() {
  if (cssDone || document.getElementById('hdv-css')) { cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'hdv-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

const CSS = `
:root{
  --hdv-bg:#fff; --hdv-card:#fff; --hdv-text:#0d2818; --hdv-sub:#6b7a70;
  --hdv-line:rgba(13,40,24,.12); --hdv-green:#15662f; --hdv-lt:#eaf4ec;
  --hdv-red:#b91c1c; --hdv-yellow:#f4d03f; --hdv-amber:#b45309; --hdv-blue:#1d4ed8;
  --hdv-shadow:0 4px 16px rgba(13,40,24,.14);
  /* motion tokens (DESIGN.md §5): transform+opacity only, asymmetric in/out */
  --dur-fast:120ms; --dur-base:200ms; --dur-screen:300ms;
  --ease-standard:cubic-bezier(.2,0,0,1);
  --ease-decel:cubic-bezier(0,0,.2,1);
  --ease-accel:cubic-bezier(.3,0,1,1);
}
@media (prefers-color-scheme: dark){
  :root{
    --hdv-bg:#0f1813; --hdv-card:#17241b; --hdv-text:#e7f0e9; --hdv-sub:#94a99b;
    --hdv-line:rgba(255,255,255,.1); --hdv-lt:rgba(21,102,47,.32);
    --hdv-shadow:0 4px 16px rgba(0,0,0,.5);
  }
}
.hdv-chip,.hdv-sbtn,.hdv-bar,.hdv-btnP,.hdv-btnG,.hdv-backbtn{
  font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.hdv-chips{display:flex;gap:8px;overflow-x:auto;padding:10px 12px;position:sticky;
  z-index:20;background:var(--hdv-bg);scrollbar-width:none;-webkit-overflow-scrolling:touch}
.hdv-chips::-webkit-scrollbar{display:none}
.hdv-chip{flex:0 0 auto;min-height:38px;border:1px solid var(--hdv-line);
  background:var(--hdv-card);color:var(--hdv-text);border-radius:999px;
  padding:8px 15px;font-size:13.5px;font-weight:600}
.hdv-chip.on{background:var(--hdv-green);border-color:var(--hdv-green);color:#fff}
.hdv-row{display:flex;align-items:center;gap:10px;padding:8px 12px;
  border-bottom:1px solid var(--hdv-line)}
.hdv-row.sel{background:var(--hdv-lt)}
.hdv-row.review{background:rgba(29,78,216,.09);box-shadow:inset 4px 0 0 var(--hdv-blue)}
.hdv-newchip{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.03em;
  padding:2px 7px;border-radius:7px;background:rgba(29,78,216,.14);color:var(--hdv-blue);
  vertical-align:middle;white-space:nowrap;margin-left:4px}
.hdv-info{flex:1;min-width:0}
.hdv-name{font-size:16px;font-weight:600;color:var(--hdv-text);overflow-wrap:anywhere}
.hdv-sub{font-size:12.5px;color:var(--hdv-sub);margin-top:2px}
.hdv-who{font-size:12.5px;color:var(--hdv-green);font-weight:600;margin-top:2px;overflow-wrap:anywhere}
.hdv-stall{font-size:12.5px;margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--hdv-sub)}
.hdv-stall .lbl{font-weight:700;color:var(--hdv-text)}
.hdv-resto{font-size:13px}
.hdv-tel{display:inline-block;padding:3px 8px;border-radius:9px;background:var(--hdv-lt);
  color:var(--hdv-green);font-weight:700;text-decoration:none;white-space:nowrap}
.hdv-tel.sms{color:var(--hdv-text)}
.hdv-tel:active{transform:scale(.96)}
/* buy-run stall view: toggle, quick-jump strip, stall sections */
.hdv-viewtog{display:flex;gap:6px;padding:6px 12px 2px}
.hdv-vbtn{flex:1;padding:8px;border-radius:10px;border:1px solid var(--hdv-line);
  background:var(--hdv-card);color:var(--hdv-text);font-size:13px;font-weight:700}
.hdv-vbtn.on{background:var(--hdv-green);color:#fff;border-color:var(--hdv-green)}
.hdv-stallstrip{display:flex;gap:6px;overflow-x:auto;padding:8px 12px;
  -webkit-overflow-scrolling:touch;border-bottom:1px solid var(--hdv-line);scrollbar-width:none}
.hdv-stallstrip::-webkit-scrollbar{display:none}
.hdv-pill{flex:0 0 auto;min-height:40px;padding:0 12px;border-radius:11px;
  border:1px solid var(--hdv-line);background:var(--hdv-card);color:var(--hdv-text);
  font-size:15px;font-weight:800;display:flex;align-items:center;gap:5px}
.hdv-pill:active{transform:scale(.95)}
.hdv-pill .n{font-size:11px;font-weight:700;color:#fff;background:var(--hdv-sub);
  border-radius:8px;padding:1px 5px;min-width:16px;text-align:center}
.hdv-stallsec{scroll-margin-top:64px;border-top:1px solid var(--hdv-line)}
.hdv-stallhdr{display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:11px 12px 5px;flex-wrap:wrap}
.hdv-stalltitle{font-size:15px;font-weight:800;color:var(--hdv-text);
  display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.hdv-stallno{display:inline-block;min-width:26px;text-align:center;background:var(--hdv-green);
  color:#fff;border-radius:7px;padding:2px 8px;font-size:15px}
.hdv-stallcount{font-size:12px;font-weight:700;color:var(--hdv-sub)}
.hdv-pin{flex:0 0 auto;width:38px;height:38px;border-radius:11px;border:1px solid var(--hdv-line);
  background:var(--hdv-card);font-size:16px;line-height:1;opacity:.7}
.hdv-pin:active{transform:scale(.93)}
.hdv-pricebanner{display:block;width:100%;margin:8px 0 2px;padding:12px;border-radius:12px;
  border:1px solid #f0c36d;background:rgba(180,83,9,.12);color:#b45309;
  font-size:14px;font-weight:800;text-align:center}
.hdv-pricebanner:active{transform:scale(.99)}
/* P&L view: editable per-line cost input */
.hdv-clab{display:flex;align-items:center;gap:4px;flex:0 0 auto;font-size:12.5px;color:var(--hdv-sub)}
.hdv-cinp{width:74px;max-width:74px;margin:0;padding:9px;text-align:right}
/* Packing checklist: tap a row to tick it off */
.hdv-packprog{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:15px;margin:6px 0 6px}
.hdv-packdone-lbl{color:var(--hdv-green)}
.hdv-packbar{height:9px;border-radius:5px;background:var(--hdv-line);overflow:hidden;margin-bottom:12px}
.hdv-packbar-fill{height:100%;background:var(--hdv-green);transition:width .2s ease}
.hdv-pack-row{display:flex;align-items:center;gap:12px;padding:15px 6px;border-bottom:1px solid var(--hdv-line);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
.hdv-pack-row:active{background:rgba(0,0,0,.05)}
.hdv-pack-tick{flex:0 0 32px;width:32px;height:32px;border:2px solid var(--hdv-green);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:21px;font-weight:800;color:var(--hdv-green)}
.hdv-pack-qty{flex:0 0 auto;min-width:46px;font-weight:800;font-size:18px;text-align:right}
.hdv-pack-unit{font-weight:600;font-size:13px;color:var(--hdv-sub)}
.hdv-pack-name{flex:1;font-size:16px;line-height:1.25}
.hdv-pack-done{opacity:.5}
.hdv-pack-done .hdv-pack-tick{background:var(--hdv-green);color:#fff}
.hdv-pack-done .hdv-pack-name{text-decoration:line-through}
/* customer with an order waiting — notification style */
.hdv-card.has-order{border-left:4px solid var(--hdv-green);background:var(--hdv-lt)}
.hdv-ordtag{display:inline-block;margin-left:6px;font-size:11px;font-weight:800;color:#fff;
  background:var(--hdv-green);border-radius:9px;padding:2px 8px;vertical-align:middle;white-space:nowrap}
.hdv-step{display:flex;align-items:center;gap:2px;flex:0 0 auto}
.hdv-sbtn{width:44px;height:44px;border-radius:12px;border:1px solid var(--hdv-line);
  background:var(--hdv-card);color:var(--hdv-text);font-size:24px;line-height:1;font-weight:600}
.hdv-sbtn.plus{color:var(--hdv-green)}
.hdv-sbtn:active{transform:scale(.94)}
.hdv-qty{min-width:32px;text-align:center;font-size:16px;font-weight:700;color:var(--hdv-text)}
.hdv-sec{padding:16px 12px 6px;font-size:12px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:var(--hdv-sub)}
.hdv-empty{padding:48px 24px;text-align:center;color:var(--hdv-sub);font-size:15px}
.hdv-pad{height:150px}
.hdv-bar{position:fixed;left:12px;right:12px;z-index:40;
  bottom:calc(68px + env(safe-area-inset-bottom));
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  background:var(--hdv-green);color:#fff;border:0;border-radius:14px;
  padding:15px 18px;font-size:16px;font-weight:700;box-shadow:var(--hdv-shadow)}
.hdv-bar-cta{font-weight:800}
.hdv-sheet{position:fixed;inset:0;z-index:60;visibility:hidden}
.hdv-sheet.open{visibility:visible}
.hdv-dim{position:absolute;inset:0;background:rgba(0,0,0,.45);opacity:0;
  transition:opacity var(--dur-base) var(--ease-standard)}
.hdv-sheet.open .hdv-dim{opacity:1}
.hdv-panel{position:absolute;left:0;right:0;bottom:0;max-height:84vh;overflow-y:auto;
  background:var(--hdv-card);border-radius:18px 18px 0 0;
  padding:6px 14px calc(18px + env(safe-area-inset-bottom));
  transform:translateY(100%);transition:transform var(--dur-base) var(--ease-decel);
  box-shadow:0 -8px 30px rgba(0,0,0,.25)}
.hdv-sheet.open .hdv-panel{transform:translateY(0)}
.hdv-grab{width:42px;height:5px;border-radius:3px;background:var(--hdv-line);margin:8px auto 4px}
.hdv-sheettitle{font-size:18px;font-weight:800;color:var(--hdv-text);padding:10px 0 2px}
.hdv-sheetsub{font-size:13px;color:var(--hdv-sub);padding-bottom:8px}
.hdv-actions{display:flex;gap:10px;padding:16px 0 4px}
.hdv-btnP{flex:1;min-height:48px;background:var(--hdv-green);color:#fff;border:0;
  border-radius:12px;padding:13px;font-size:16px;font-weight:700}
.hdv-btnP:disabled{opacity:.55}
.hdv-btnG{flex:1;min-height:48px;background:transparent;color:var(--hdv-text);
  border:1.5px solid var(--hdv-line);border-radius:12px;padding:13px;font-size:16px;font-weight:700}
.hdv-btnG.danger{color:var(--hdv-red);border-color:rgba(185,28,28,.35)}
.hdv-btnG.slim{flex:0 0 auto;min-height:0;padding:9px 14px;font-size:13.5px;border-radius:999px}
.hdv-btnB{flex:1;min-height:48px;background:var(--hdv-blue,#1d4ed8);color:#fff;border:0;
  border-radius:12px;padding:13px;font-size:16px;font-weight:700}
.hdv-margin{font-size:12px;font-weight:600;color:var(--hdv-green);margin-top:2px}
.hdv-margin.hdv-margin-low{color:var(--hdv-amber)}
.hdv-margin.hdv-margin-loss{color:var(--hdv-red);font-weight:800}
.hdv-total-margin{color:var(--hdv-green);font-size:14px}
.hdv-tq-status{font-size:13px;font-weight:700;padding:8px 0;border-radius:8px;text-align:center}
.hdv-tq-queued{color:var(--hdv-amber)}
.hdv-tq-sent{color:var(--hdv-green)}
.hdv-tq-error{color:var(--hdv-red)}
.hdv-toast{position:fixed;left:50%;z-index:70;max-width:86vw;text-align:center;
  bottom:calc(78px + env(safe-area-inset-bottom));transform:translate(-50%,16px);
  background:var(--hdv-text);color:var(--hdv-bg);padding:10px 18px;border-radius:999px;
  font-size:14px;font-weight:600;opacity:0;pointer-events:none;transition:all .2s}
.hdv-toast.show{opacity:1;transform:translate(-50%,0)}
.hdv-skel{display:flex;flex-direction:column;gap:8px;padding:14px 12px;
  border-bottom:1px solid var(--hdv-line)}
.hdv-skel-a{height:16px;width:60%;border-radius:6px}
.hdv-skel-b{height:12px;width:32%;border-radius:6px}
.hdv-skel-a,.hdv-skel-b{background:linear-gradient(90deg,var(--hdv-line) 25%,var(--hdv-lt) 50%,var(--hdv-line) 75%);
  background-size:200% 100%;animation:hdv-shimmer 1.2s infinite}
@keyframes hdv-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.hdv-card{display:flex;align-items:center;gap:12px;background:var(--hdv-card);
  border:1px solid var(--hdv-line);border-radius:12px;padding:14px;margin:10px 12px;
  box-shadow:0 1px 4px rgba(13,40,24,.06)}
.hdv-tchip{display:inline-block;font-size:11px;font-weight:800;padding:3px 9px;
  border-radius:999px;background:var(--hdv-lt);color:var(--hdv-green);
  text-transform:capitalize;white-space:nowrap}
.hdv-count{font-size:12.5px;color:var(--hdv-sub);margin-top:2px}
.hdv-red{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.04em;
  padding:4px 7px;border-radius:7px;background:rgba(185,28,28,.14);color:var(--hdv-red)}
.hdv-price{font-size:14px;font-weight:700;color:var(--hdv-text);min-width:52px;text-align:right}
.hdv-price.dim{color:var(--hdv-sub);font-weight:600}
.hdv-pin{width:76px;padding:8px;border:1.5px solid var(--hdv-green);border-radius:8px;
  font-size:15px;font-family:inherit;text-align:right;background:transparent;color:var(--hdv-text)}
.hdv-in{width:100%;box-sizing:border-box;padding:13px;border:1.5px solid var(--hdv-line);
  border-radius:10px;font-size:16px;font-family:inherit;background:transparent;
  color:var(--hdv-text);margin:6px 0}
.hdv-lbl{display:block;font-size:12.5px;font-weight:700;color:var(--hdv-sub);margin-top:8px}
.hdv-err{color:var(--hdv-red);font-size:13.5px;font-weight:600;padding:6px 0;min-height:18px}
.hdv-back{display:flex;align-items:center;gap:10px;padding:10px 12px;
  border-bottom:1px solid var(--hdv-line)}
.hdv-backbtn{border:0;background:transparent;color:var(--hdv-green);
  font-size:15px;font-weight:700;padding:8px 10px 8px 0}
.hdv-head{display:flex;align-items:center;justify-content:space-between;padding:14px 12px 4px}
.hdv-h1{font-size:20px;font-weight:800;color:var(--hdv-text)}
.hdv-link{color:var(--hdv-green);font-weight:700;text-decoration:none}
.hdv-total{display:flex;justify-content:space-between;font-size:16px;font-weight:800;
  color:var(--hdv-text);padding:12px 0 2px}
.hdv-kv{display:flex;justify-content:space-between;gap:10px;padding:7px 0;
  font-size:14.5px;color:var(--hdv-text)}
.hdv-mut{color:var(--hdv-sub)}
.hdv-ver{text-align:center;color:var(--hdv-sub);font-size:12px;padding:18px 0 4px}
.hdv-ver-badge{font-size:11px;font-weight:700;color:var(--hdv-green);background:var(--hdv-lt);padding:3px 9px;border-radius:999px}
/* ---- v3.2 spine (DESIGN.md §5): tokens applied app-wide ---- */
.hdv-qty,.hdv-price,.hdv-total,.hdv-qtybtn,.hdv-delta{font-variant-numeric:tabular-nums}
.hdv-qtybtn{min-width:36px;border:0;background:transparent;text-align:center;
  font-family:inherit;font-size:16px;font-weight:700;color:var(--hdv-text);
  padding:10px 2px;cursor:pointer;-webkit-tap-highlight-color:transparent;
  text-decoration:underline dotted var(--hdv-sub);text-underline-offset:4px}
.hdv-tick{flex:0 0 auto;width:40px;height:40px;border-radius:50%;
  border:1.5px solid var(--hdv-line);background:transparent;color:transparent;
  font-size:18px;font-weight:800;line-height:1;cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  transition:transform var(--dur-fast) var(--ease-standard)}
.hdv-tick:active{transform:scale(.9)}
.hdv-tick.on{background:var(--hdv-green);border-color:var(--hdv-green);color:#fff}
.hdv-row.done{opacity:.45}
.hdv-row.done .hdv-name{text-decoration:line-through}
/* Buy run — ALWAYS COMPACT (v3.29): denser rows so ~2x items fit per screen.
   Scoped to .hdv-buy so Orders / P&L stay roomy. Names get more width (small
   pin icon) so most fit on one line. */
.hdv-buy .hdv-row{padding:5px 12px;gap:8px}
.hdv-buy .hdv-name{font-size:14px;line-height:1.2}
.hdv-buy .hdv-sub,.hdv-buy .hdv-who,.hdv-buy .hdv-stall{font-size:11.5px;margin-top:1px}
.hdv-buy .hdv-pin{width:34px;min-width:34px;height:34px;padding:0;border:1px solid var(--hdv-line);
  border-radius:9px;font-size:16px;text-align:center;color:var(--hdv-text)}
.hdv-buy .hdv-tick{width:34px;height:34px}
.hdv-buy .hdv-step{gap:1px}
.hdv-buy .hdv-sbtn{width:38px;height:38px}
.hdv-buy .hdv-qtybtn{min-width:30px}
.hdv-buy .hdv-sec{padding-top:9px;padding-bottom:3px}
.hdv-prog{flex:0 0 auto;font-size:12px;font-weight:800;padding:5px 11px;
  border-radius:999px;background:var(--hdv-lt);color:var(--hdv-green);white-space:nowrap}
.hdv-delta{display:inline-block;font-size:11.5px;font-weight:800;padding:2px 7px;
  border-radius:7px}
.hdv-delta.good{background:var(--hdv-lt);color:var(--hdv-green)}
.hdv-delta.bad{background:rgba(185,28,28,.12);color:var(--hdv-red)}
.hdv-numgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 0 4px}
.hdv-numbtn{min-height:54px;border:1.5px solid var(--hdv-line);border-radius:12px;
  background:var(--hdv-card);color:var(--hdv-text);font-family:inherit;
  font-size:22px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}
.hdv-numbtn:active{transform:scale(.95)}
.hdv-numout{text-align:center;font-size:34px;font-weight:800;color:var(--hdv-text);
  font-variant-numeric:tabular-nums;padding:8px 0 2px;min-height:44px}
@media (prefers-reduced-motion: reduce){
  .hdv-dim,.hdv-panel,.hdv-toast,.hdv-tick,.hdv-sbtn,.hdv-numbtn{transition:none}
  .hdv-skel-a,.hdv-skel-b{animation:none}
}
`;
