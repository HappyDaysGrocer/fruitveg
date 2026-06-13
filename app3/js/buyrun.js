/* Happy Days v3 (in-house) — buyrun.js
   The always-live Mango-market BUY RUN. The "to buy" total per product is
   rolled up live from every OPEN customer order plus the team's manual adds
   (shared via /buyrun). It is never started or reset — open it any morning
   and it's current. Search to add anything; +/- adjusts your manual amount
   on top of what the orders already need.

   v3.2 (DESIGN.md): the paper-clipboard mechanic — tick each line as you
   buy it (rows dim, a counter climbs "8/22 checked"; per-device, resets
   daily like availability), and tap the quantity for a big numpad sheet on
   box counts. Every action is a visible control — no hidden gestures. */

import {
  catalog, orderedCats, searchCatalog,
  buyRunList, buyManualQty, setBuyManual
} from './store.js';

import {
  setActive, esc, money, qText, chipsHTML, stepperHTML, emptyHTML, ensureCss,
  shareText, openSheet, closeSheet, toast, todayStr, productSheet, phoneLinkHTML
} from './catalog.js';

import { boxMath, boxLine } from './boxes.js';
import { stallFor, searchSuppliers } from './suppliers.js';

/* "Stall 35 · Louis  📞 …  ✉️ SMS" — the market stall + tap-to-call/SMS for a
   product, or '' if we can't confidently resolve the stall. */
function stallLine(name) {
  const st = stallFor(name);
  if (!st) return '';
  const label = 'Stall ' + (st.stall || '?') + ' · ' + esc(st.supplier);
  return `<div class="hdv-stall"><span class="lbl">${label}</span>${st.phone ? phoneLinkHTML(st.phone) : ''}</div>`;
}

/* Who the order demand is for — restaurants/cafés first, e.g. "for Fat Chef 5 · Café X 3". */
function whoLine(it) {
  const parts = (it.parts || []).filter((p) => p.name && p.qty > 0)
    .sort((a, b) => (b.forRest - a.forRest) || (b.qty - a.qty));
  if (!parts.length) return '';
  const txt = parts.map((p) => `${esc(p.name)} ${p.qty}`).join(' · ');
  return `<div class="hdv-who">for ${txt}</div>`;
}

let buyCat = '';

function nameFor(key) {
  const p = catalog().find((x) => x.key === key);
  return p ? p.name : (String(key).split('||')[1] || key);
}

/* ---- "reviewed" ticks: per-device, per-day (like availability's daily
   reset). Local-only by design — it's the buyer's own walk progress. ---- */

function revState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('hd3.buyrev') || 'null'); } catch (e) { /* fresh */ }
  if (!s || s.date !== todayStr()) s = { date: todayStr(), keys: {} };
  return s;
}

function isRev(key) { return !!revState().keys[key]; }

function toggleRev(key) {
  const s = revState();
  if (s.keys[key]) delete s.keys[key]; else s.keys[key] = true;
  try { localStorage.setItem('hd3.buyrev', JSON.stringify(s)); } catch (e) { /* quota */ }
}

/* Local stepper variant: same hdv-step layout, but the number itself is a
   button that opens the numpad sheet (big box counts beat 14 taps of +). */
function buyStepper(key, qty) {
  return `<div class="hdv-step">
    <button class="hdv-sbtn" data-act="dec" data-key="${esc(key)}" aria-label="less">&minus;</button>
    <button class="hdv-qtybtn" data-act="num" data-key="${esc(key)}"
      aria-label="type amount">${Number(qty) || 0}</button>
    <button class="hdv-sbtn plus" data-act="inc" data-key="${esc(key)}" aria-label="more">+</button>
  </div>`;
}

/* One buy row: tick → name/breakdown → stepper. The stepper adjusts the
   MANUAL part only (you can't drop below what orders need). */
function buyRow(it) {
  const done = isRev(it.key);
  const name = it.name || nameFor(it.key);
  const bits = [];
  if (it.fromOrders > 0) bits.push(it.fromOrders + ' from orders');
  if (it.manual > 0) bits.push('+' + it.manual + ' added');
  const bx = boxLine(name, it.total);   // "≈ 2 boxes of 12 kg"
  if (bx) bits.push(bx);
  const sub = bits.join(' · ');
  return `<div class="hdv-row sel${done ? ' done' : ''}">
    <button class="hdv-tick${done ? ' on' : ''}" data-act="rev" data-key="${esc(it.key)}"
      aria-label="${done ? 'unmark' : 'mark'} bought">✓</button>
    <div class="hdv-info" data-act="detail" data-key="${esc(it.key)}">
      <div class="hdv-name">${esc(name)}${it.forRestaurant ? ' <span class="hdv-resto">🍽</span>' : ''}</div>
      ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
      ${whoLine(it)}
      ${stallLine(name)}
    </div>
    ${buyStepper(it.key, it.total)}
  </div>`;
}

/* A catalogue product while searching (to add something no order needs). */
function searchRow(p, liveByKey) {
  const it = liveByKey.get(p.key);
  const total = it ? it.total : 0;
  const sub = [p.cat, (it && it.fromOrders > 0) ? it.fromOrders + ' from orders' : '']
    .filter(Boolean).join(' · ');
  return `<div class="hdv-row${total > 0 ? ' sel' : ''}">
    <div class="hdv-info" data-act="detail" data-key="${esc(p.key)}">
      <div class="hdv-name">${esc(p.name)}</div>
      ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
    </div>
    ${stepperHTML(p.key, total)}
  </div>`;
}

/* Big-thumb numpad sheet: type the TOTAL you want; the manual part is
   derived (total − orders), clamped so the run never drops below demand.
   Decimals allowed (6.5 kg is a real buy) — one dot, max 2 decimal places. */
const round2 = (x) => Math.round(x * 100) / 100;

function numpadSheet(it) {
  let entered = '';
  return (body) => {
    const floor = it.fromOrders || 0;
    const draw = () => {
      body.innerHTML = `
        <div class="hdv-sheettitle">${esc(it.name)}</div>
        <div class="hdv-sheetsub">${floor > 0
          ? floor + ' needed by orders — total can’t go below that'
          : 'Type the total to buy'}</div>
        <div class="hdv-numout">${entered === '' ? (it.total || 0) : entered}</div>
        <div class="hdv-numgrid">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
            `<button class="hdv-numbtn" data-d="${d}">${d}</button>`).join('')}
          <button class="hdv-numbtn" data-dot aria-label="decimal point">·</button>
          <button class="hdv-numbtn" data-d="0">0</button>
          <button class="hdv-numbtn" data-back aria-label="delete">⌫</button>
        </div>
        <div class="hdv-actions">
          <button class="hdv-btnG" data-close="1">Cancel</button>
          <button class="hdv-btnP" data-save>Save</button>
        </div>`;
    };
    const decimals = () => {
      const i = entered.indexOf('.');
      return i < 0 ? 0 : entered.length - i - 1;
    };
    draw();
    body.onclick = (e) => {
      const d = e.target.closest('[data-d]');
      if (d) {
        if (entered.length < 6 && decimals() < 2) entered += d.dataset.d;
        draw(); return;
      }
      if (e.target.closest('[data-dot]')) {
        if (!entered.includes('.')) entered = (entered === '' ? '0' : entered) + '.';
        draw(); return;
      }
      if (e.target.closest('[data-back]')) { entered = entered.slice(0, -1); draw(); return; }
      if (e.target.closest('[data-save]')) {
        const want = entered === '' ? (it.total || 0) : (parseFloat(entered) || 0);
        if (want < floor) toast(floor + ' needed by orders — set to ' + floor);
        setBuyManual(it.key, it.name, round2(Math.max(0, want - floor)));
        closeSheet();
      }
    };
  };
}

export function renderBuy(root) {
  ensureCss();
  setActive(() => renderBuy(root));

  const live = buyRunList();
  const liveByKey = new Map(live.map((x) => [x.key, x]));
  const q = qText();

  const units = live.reduce((s, x) => s + x.total, 0);
  const boxes = live.reduce((s, x) => {
    const m = boxMath(x.name || nameFor(x.key), x.total);
    return s + (m && !m.loose ? m.boxes : 0);
  }, 0);
  const checked = live.filter((x) => isRev(x.key)).length;
  let h = `<div class="hdv-head">
    <div class="hdv-h1">Buy run</div>
    <div style="display:flex;align-items:center;gap:8px">
      ${live.length ? `<span class="hdv-prog">${checked}/${live.length} checked</span>` : ''}
      <button class="hdv-btnG slim" data-act="share">Share</button>
    </div>
  </div>
  <div class="hdv-sub" style="padding:0 12px 4px">${live.length} product${live.length === 1 ? '' : 's'} · ${units} to buy${boxes ? ' · ≈ ' + boxes + ' boxes' : ''} · always live from open orders</div>`;

  if (q) {
    // 1) Stalls matching the query by number / name / contact — with call + SMS.
    const stalls = searchSuppliers(q);
    if (stalls.length) {
      h += `<div class="hdv-sec">${stalls.length} stall${stalls.length === 1 ? '' : 's'} match</div>`;
      h += stalls.map((s) => `<div class="hdv-row">
        <div class="hdv-info">
          <div class="hdv-name">${esc(s.supplier)}</div>
          <div class="hdv-sub">Stall ${esc(s.stall || '—')}</div>
          ${s.phone ? `<div class="hdv-stall">${phoneLinkHTML(s.phone)}</div>` : ''}
        </div>
      </div>`).join('');

      // 2) What the run already needs FROM those stalls (filter the buy list).
      const supNames = new Set(stalls.map((s) => s.supplier));
      const fromStall = live.filter((it) => {
        const st = stallFor(it.name || nameFor(it.key));
        return st && supNames.has(st.supplier);
      });
      if (fromStall.length) {
        h += `<div class="hdv-sec">To buy from ${stalls.length === 1 ? esc(stalls[0].supplier) : 'these stalls'}</div>`;
        h += fromStall.map(buyRow).join('');
      }
    }
    // 3) Catalogue products matching the query — tap + to add to the run.
    const results = searchCatalog(q);
    h += `<div class="hdv-sec">${results.length} result${results.length === 1 ? '' : 's'} — tap + to add to the run</div>`;
    h += results.length ? results.map((p) => searchRow(p, liveByKey)).join('')
      : (stalls.length ? '' : emptyHTML(`No products match “${esc(q)}”`));
  } else if (!live.length) {
    h += emptyHTML('Nothing to buy yet — orders feed this automatically, or search to add an item');
  } else {
    const cats = Array.from(new Set(live.map((x) => x.cat)));
    h += chipsHTML(cats.sort(), buyCat);
    const shown = buyCat ? live.filter((x) => x.cat === buyCat) : live;
    const byCat = new Map();
    for (const it of shown) { if (!byCat.has(it.cat)) byCat.set(it.cat, []); byCat.get(it.cat).push(it); }
    const order = orderedCats().filter((c) => byCat.has(c));
    for (const c of Array.from(byCat.keys()).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a).localeCompare(String(b));
    })) {
      const g = byCat.get(c).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      h += `<div class="hdv-sec">${esc(c || 'Other')}</div>` + g.map(buyRow).join('');
    }
  }
  h += '<div class="hdv-pad"></div>';

  root.innerHTML = h;
  root.onclick = (e) => {
    if (e.target.closest('a.hdv-tel')) return;   // let tel:/sms: fire, skip row
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, key = t.dataset.key;
    if (act === 'chip') { buyCat = t.dataset.cat; renderBuy(root); }
    else if (act === 'inc') setBuyManual(key, nameFor(key), buyManualQty(key) + 1);
    else if (act === 'dec') { const m = buyManualQty(key); if (m > 0) setBuyManual(key, nameFor(key), m - 1); }
    else if (act === 'rev') { toggleRev(key); renderBuy(root); }
    else if (act === 'detail') openSheet(productSheet(key));
    else if (act === 'num') {
      const it = liveByKey.get(key) ||
        { key, name: nameFor(key), fromOrders: 0, manual: buyManualQty(key), total: buyManualQty(key) };
      openSheet(numpadSheet(it), { static: true });
    }
    else if (act === 'share') shareText(buyText(live));
  };
}

function buyText(live) {
  const lines = live.slice()
    .sort((a, b) => String(a.cat).localeCompare(String(b.cat)) || String(a.name).localeCompare(String(b.name)))
    .map((x) => {
      const name = x.name || nameFor(x.key);
      const bx = boxLine(name, x.total);
      return `${x.total} x ${name}${bx ? '  (' + bx + ')' : ''}`;
    });
  return 'Happy Days — buy run\n' + lines.join('\n');
}
