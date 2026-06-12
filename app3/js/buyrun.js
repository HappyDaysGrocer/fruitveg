/* Happy Days v3 (in-house) — buyrun.js
   The always-live Mango-market BUY RUN. The "to buy" total per product is
   rolled up live from every OPEN customer order plus the team's manual adds
   (shared via /buyrun). It is never started or reset — open it any morning
   and it's current. Search to add anything; +/- adjusts your manual amount
   on top of what the orders already need. */

import {
  catalog, orderedCats, searchCatalog,
  buyRunList, buyManualQty, setBuyManual
} from './store.js';

import {
  setActive, esc, money, qText, chipsHTML, stepperHTML, emptyHTML, ensureCss, shareText
} from './catalog.js';

let buyCat = '';

function nameFor(key) {
  const p = catalog().find((x) => x.key === key);
  return p ? p.name : (String(key).split('||')[1] || key);
}

/* One buy row: total to buy on the stepper; sub shows the breakdown. The
   stepper adjusts the MANUAL part (you can't drop below what orders need). */
function buyRow(it) {
  const bits = [];
  if (it.fromOrders > 0) bits.push(it.fromOrders + ' from orders');
  if (it.manual > 0) bits.push('+' + it.manual + ' added');
  const sub = bits.join(' · ');
  return `<div class="hdv-row sel">
    <div class="hdv-info">
      <div class="hdv-name">${esc(it.name || nameFor(it.key))}</div>
      ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
    </div>
    ${stepperHTML(it.key, it.total)}
  </div>`;
}

/* A catalogue product while searching (to add something no order needs). */
function searchRow(p, liveByKey) {
  const it = liveByKey.get(p.key);
  const total = it ? it.total : 0;
  const sub = [p.cat, (it && it.fromOrders > 0) ? it.fromOrders + ' from orders' : '']
    .filter(Boolean).join(' · ');
  return `<div class="hdv-row${total > 0 ? ' sel' : ''}">
    <div class="hdv-info">
      <div class="hdv-name">${esc(p.name)}</div>
      ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
    </div>
    ${stepperHTML(p.key, total)}
  </div>`;
}

export function renderBuy(root) {
  ensureCss();
  setActive(() => renderBuy(root));

  const live = buyRunList();
  const liveByKey = new Map(live.map((x) => [x.key, x]));
  const q = qText();

  const units = live.reduce((s, x) => s + x.total, 0);
  let h = `<div class="hdv-head">
    <div class="hdv-h1">Buy run</div>
    <button class="hdv-btnG slim" data-act="share">Share</button>
  </div>
  <div class="hdv-sub" style="padding:0 12px 4px">${live.length} product${live.length === 1 ? '' : 's'} · ${units} to buy · always live from open orders</div>`;

  if (q) {
    const results = searchCatalog(q);
    h += `<div class="hdv-sec">${results.length} result${results.length === 1 ? '' : 's'} — tap + to add to the run</div>`;
    h += results.length ? results.map((p) => searchRow(p, liveByKey)).join('')
      : emptyHTML(`No products match “${esc(q)}”`);
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
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, key = t.dataset.key;
    if (act === 'chip') { buyCat = t.dataset.cat; renderBuy(root); }
    else if (act === 'inc') setBuyManual(key, nameFor(key), buyManualQty(key) + 1);
    else if (act === 'dec') { const m = buyManualQty(key); if (m > 0) setBuyManual(key, nameFor(key), m - 1); }
    else if (act === 'share') shareText(buyText(live));
  };
}

function buyText(live) {
  const lines = live.slice()
    .sort((a, b) => String(a.cat).localeCompare(String(b.cat)) || String(a.name).localeCompare(String(b.name)))
    .map((x) => `${x.total} x ${x.name || nameFor(x.key)}`);
  return 'Happy Days — buy run\n' + lines.join('\n');
}
