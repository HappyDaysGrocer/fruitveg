/* Happy Days v3 (in-house) — money.js
   Cost / sell / margin per product. Costs come from the LOCKED /catalog node
   (loaded after a director signs in); until the owner runs the one-time
   secure-cloud upload, the screen shows sell prices + a clear banner. */

import {
  catalog, groups, orderedCats, searchCatalog,
  marginInfo, secureLoaded
} from './store.js';

import {
  setActive, esc, money, qText, chipsHTML, emptyHTML, ensureCss
} from './catalog.js';

let mGroup = '';   // selected aisle chip

function marginColor(pct) {
  if (pct == null) return 'var(--hdv-sub)';
  if (pct >= 35) return '#15662f';
  if (pct >= 18) return '#b45309';
  return '#b91c1c';
}

function row(p) {
  const m = marginInfo(p.key) || {};
  const cost = (m.cost != null) ? money(m.cost) : '—';
  const sell = (m.sell != null) ? money(m.sell) : '—';
  const pct = (m.marginPct != null) ? m.marginPct + '%' : '—';
  return `<div class="hdv-row">
    <div class="hdv-info">
      <div class="hdv-name">${esc(p.name)}</div>
      <div class="hdv-sub">cost ${cost} · sell ${sell}</div>
    </div>
    <span style="min-width:54px;text-align:right;font-weight:800;font-size:14px;color:${marginColor(m.marginPct)}">${pct}</span>
  </div>`;
}

export function renderMoney(root) {
  ensureCss();
  setActive(() => renderMoney(root));

  const q = qText();
  let list = q ? searchCatalog(q) : catalog();
  if (mGroup) list = list.filter(p => p.group === mGroup);

  let h = `<div class="hdv-head"><div class="hdv-h1">Cost &amp; margin</div></div>`;

  if (!secureLoaded()) {
    h += `<div style="margin:0 12px 8px;padding:11px 13px;border-radius:12px;
      background:rgba(180,83,9,.10);color:#b45309;font-size:13px;font-weight:600;line-height:1.4">
      Costs aren't loaded yet. They load from the secure cloud after sign-in —
      run the one-time upload (owner) and they'll appear here. Sell prices show meanwhile.</div>`;
  }

  h += chipsHTML(groups(), mGroup);

  // totals (only where we have both numbers)
  let nCost = 0, sumCost = 0, sumSell = 0;
  list.forEach(p => { const m = marginInfo(p.key); if (m && m.cost != null && m.sell != null) { nCost++; sumCost += m.cost; sumSell += m.sell; } });
  if (nCost) {
    const avg = sumSell > 0 ? Math.round((sumSell - sumCost) / sumSell * 100) : 0;
    h += `<div class="hdv-sec">${nCost} priced · avg margin ${avg}%</div>`;
  }

  if (!list.length) {
    h += emptyHTML(q ? `No products match “${esc(q)}”` : 'No products');
  } else if (q || mGroup) {
    h += list.map(row).join('');
  } else {
    const byCat = new Map();
    for (const p of list) { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); }
    for (const c of orderedCats()) {
      const g = byCat.get(c);
      if (!g || !g.length) continue;
      h += `<div class="hdv-sec">${esc(c)}</div>` + g.map(row).join('');
    }
  }
  h += '<div class="hdv-pad"></div>';

  root.innerHTML = h;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (t && t.dataset.act === 'chip') { mGroup = t.dataset.cat; renderMoney(root); }
  };
}
