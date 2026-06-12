/* Happy Days v2 — catalog.js
   SHOP view + the shared UI kit (injected styles, bottom sheet, toast,
   chip rail, steppers, reactive re-render core) that orders.js reuses.
   Renders into the root element passed by app.js and re-renders
   reactively whenever the store emits 'change' or #q input changes. */

import { catalog, categories, groups, orderedCats, searchCatalog, buy, bus } from './store.js';

/* ------------------------------------------------------------ helpers */

export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const money = n =>
  (typeof n === 'number' && isFinite(n)) ? '$' + n.toFixed(2) : '';

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
  requestAnimationFrame(() => {
    pending = false;
    const y = window.scrollY;
    if (activeRender) activeRender();
    window.scrollTo(0, y);
    refreshSheet();
  });
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
  sheetBuilder = build;
  sheetStatic = !!(opts && opts.static);
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

export function renderShop(root) {
  ensureCss();
  setActive(() => renderShop(root));

  const items = catalog();
  if (!items.length) {           // catalogue still loading -> shimmer
    root.innerHTML = skeletonHTML();
    root.onclick = null;
    return;
  }

  const q = qText();
  let list = q ? searchCatalog(q) : items;
  if (shopCat) list = list.filter(p => p.group === shopCat);   // chip = aisle

  let h = chipsHTML(groups(), shopCat);

  if (q) {
    if (!list.length) {
      h += emptyHTML(`No products match “${esc(q)}”`);
    } else {
      h += `<div class="hdv-sec">${list.length} result${list.length === 1 ? '' : 's'}</div>`;
      h += list.map(p => shopRow(p, true)).join('');
    }
  } else {
    // Empty search -> aisle/shelf layout: sections are the fine categories,
    // ordered by aisle (produce A-B…S-Z first, then the grocery aisles).
    const byCat = new Map();
    for (const p of list) {
      if (!byCat.has(p.cat)) byCat.set(p.cat, []);
      byCat.get(p.cat).push(p);
    }
    for (const c of orderedCats(shopCat || undefined)) {
      const g = byCat.get(c);
      if (!g || !g.length) continue;
      h += `<div class="hdv-sec">${esc(c)}</div>` + g.map(p => shopRow(p, false)).join('');
    }
  }

  h += '<div class="hdv-pad"></div>';

  const n = buy.count();
  if (n > 0) {
    h += `<button class="hdv-bar" data-act="viewlist">
      <span>${n} item${n === 1 ? '' : 's'}</span>
      <span class="hdv-bar-cta">View list ›</span>
    </button>`;
  }

  root.innerHTML = h;
  root.onclick = onShopClick;
}

function shopRow(p, withCat) {
  const qty = buy.qty(p.key) || 0;
  const bits = [];
  if (withCat && p.cat) bits.push(p.cat);
  if (typeof p.sell === 'number' && p.sell > 0) bits.push(money(p.sell));
  const sub = bits.join(' · ');
  return `<div class="hdv-row${qty > 0 ? ' sel' : ''}">
    <div class="hdv-info">
      <div class="hdv-name">${esc(p.name)}</div>
      ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
    </div>
    ${stepperHTML(p.key, qty)}
  </div>`;
}

function onShopClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, key = t.dataset.key;
  if (act === 'chip') { shopCat = t.dataset.cat; rerenderNow(); }
  else if (act === 'inc') buy.add(key, 1);                  // store emits 'change'
  else if (act === 'dec') { if ((buy.qty(key) || 0) > 0) buy.add(key, -1); }
  else if (act === 'viewlist') openSheet(buyListSheet);
}

/* ---- market list bottom sheet (chosen items, steppers, Clear, Share) */

function buyEntries() {
  // buy.entries() -> [[key,qty],...] (Object.entries shape); be lenient.
  return (buy.entries() || [])
    .map(e => Array.isArray(e) ? { key: e[0], qty: e[1] } : { key: e.key, qty: e.qty })
    .filter(x => x.key && (Number(x.qty) || 0) > 0);
}

function buyListSheet(body) {
  const map = new Map(catalog().map(p => [p.key, p]));
  const items = buyEntries();

  let h = `<div class="hdv-sheettitle">Market list</div>
    <div class="hdv-sheetsub">${todayStr()}</div>`;

  if (!items.length) {
    h += emptyHTML('Your list is empty');
  } else {
    h += items.map(({ key, qty }) => {
      const p = map.get(key);
      const name = p ? p.name : (key.split('||')[1] || key);
      const sell = p && typeof p.sell === 'number' && p.sell > 0 ? money(p.sell) : '';
      return `<div class="hdv-row sel">
        <div class="hdv-info">
          <div class="hdv-name">${esc(name)}</div>
          ${sell ? `<div class="hdv-sub">${sell}</div>` : ''}
        </div>
        ${stepperHTML(key, qty)}
      </div>`;
    }).join('');
    h += `<div class="hdv-actions">
      <button class="hdv-btnG danger" data-act="clear">Clear</button>
      <button class="hdv-btnG" data-act="share">Share</button>
      <button class="hdv-btnP" data-act="done">Done</button>
    </div>`;
  }

  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, key = t.dataset.key;
    if (act === 'inc') buy.add(key, 1);
    else if (act === 'dec') { if ((buy.qty(key) || 0) > 0) buy.add(key, -1); }
    else if (act === 'clear') { buy.clear(); closeSheet(); toast('List cleared'); }
    else if (act === 'share') shareText(buyListText());
    else if (act === 'done') closeSheet();
  };
}

function buyListText() {
  const map = new Map(catalog().map(p => [p.key, p]));
  const lines = buyEntries().map(({ key, qty }) => {
    const p = map.get(key);
    return `${qty} x ${p ? p.name : (key.split('||')[1] || key)}`;
  });
  return `Happy Days — market list ${todayStr()}\n` + lines.join('\n');
}

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
  --hdv-red:#b91c1c; --hdv-yellow:#f4d03f;
  --hdv-shadow:0 4px 16px rgba(13,40,24,.14);
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
.hdv-info{flex:1;min-width:0}
.hdv-name{font-size:16px;font-weight:600;color:var(--hdv-text);overflow-wrap:anywhere}
.hdv-sub{font-size:12.5px;color:var(--hdv-sub);margin-top:2px}
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
.hdv-dim{position:absolute;inset:0;background:rgba(0,0,0,.45);opacity:0;transition:opacity .18s}
.hdv-sheet.open .hdv-dim{opacity:1}
.hdv-panel{position:absolute;left:0;right:0;bottom:0;max-height:84vh;overflow-y:auto;
  background:var(--hdv-card);border-radius:18px 18px 0 0;
  padding:6px 14px calc(18px + env(safe-area-inset-bottom));
  transform:translateY(100%);transition:transform .22s ease-out;
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
`;
