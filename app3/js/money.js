/* Happy Days v3 (in-house) — money.js
   The Money hub: operational HISTORY (same data v1 carried) in four tabs —
   Sales (90-day EPOS), Purchases (what we bought at the market), Margins
   (cost/sell per product), Wastage. Data loads from the build-kept root files
   via store.loadHistory(). The sensitive finance ledger (bank / invoice $ /
   capital / contributions) is deliberately NOT here — it stays on the PC. */

import {
  catalog, groups, orderedCats, searchCatalog,
  marginInfo, secureLoaded, histData, loadHistory
} from './store.js';

import {
  setActive, esc, money, qText, chipsHTML, emptyHTML, ensureCss,
  openSheet, productSheet
} from './catalog.js';

let mTab = 'sales';   // sales | purchases | margins | wastage
let mGroup = '';      // aisle chip (margins tab)

function marginColor(pct) {
  if (pct == null) return 'var(--hdv-sub)';
  if (pct >= 35) return '#15662f';
  if (pct >= 18) return '#b45309';
  return '#b91c1c';
}

/* ---- Sales tab: 90-day EPOS summary ---- */
function renderSales(q) {
  const e = histData().sales;
  if (!e || !Array.isArray(e.items)) return emptyHTML('Sales history is loading…');
  let items = e.items.filter(x => x && x.name && x.name.length > 1 && ((x.qty || 0) > 0 || (x.revIncVAT || 0) > 0));
  if (q) { const n = q.toLowerCase(); items = items.filter(x => x.name.toLowerCase().includes(n)); }
  items.sort((a, b) => (b.revIncVAT || 0) - (a.revIncVAT || 0));
  const totRev = items.reduce((s, x) => s + (x.revIncVAT || 0), 0);
  const totMargin = items.reduce((s, x) => s + (x.margin || 0), 0);
  const avgPct = totRev > 0 ? Math.round(totMargin / totRev * 100) : 0;
  let h = `<div class="hdv-sec">${esc(e.label || 'Last 90 days')} · ${money(totRev)} sales · ${money(totMargin)} margin (${avgPct}%)</div>`;
  if (!items.length) return h + emptyHTML(q ? 'No products match' : 'No sales data');
  h += items.slice(0, q ? 600 : 300).map(x => {
    const pct = (x.marginPerc != null) ? Math.round(x.marginPerc * 100) : null;
    return `<div class="hdv-row"><div class="hdv-info">
      <div class="hdv-name">${esc(x.name)}</div>
      <div class="hdv-sub">${x.qty || 0} sold · ${money(x.revIncVAT || 0)}${x.cost ? ' · cost ' + money(x.cost) : ''}</div>
    </div><span style="min-width:48px;text-align:right;font-weight:800;font-size:13px;color:${marginColor(pct)}">${pct != null ? pct + '%' : ''}</span></div>`;
  }).join('');
  return h;
}

/* ---- Purchases tab: what we've bought at the market (from invoice photos) ---- */
function renderPurchases(q) {
  const sc = histData().store;
  if (!sc || !Array.isArray(sc.products)) return emptyHTML('Purchase history is loading…');
  let ps = sc.products.filter(p => p && p.n && p.n.length > 2);
  if (q) {
    const n = q.toLowerCase();
    ps = ps.filter(p => p.n.toLowerCase().includes(n) || (p.sups || []).join(' ').toLowerCase().includes(n));
  }
  ps.sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')) || (b.buys || 0) - (a.buys || 0));
  let h = `<div class="hdv-sec">${ps.length} products bought · ${esc(sc.source || '')}${sc.generated ? ' · to ' + esc(sc.generated) : ''}</div>`;
  if (!ps.length) return h + emptyHTML(q ? 'No purchases match' : 'No purchase data');
  h += ps.slice(0, q ? 600 : 300).map(p => {
    const sups = (p.sups || []).join(', ') || '—';
    const stalls = (p.stalls && p.stalls.length) ? ' · stall ' + esc(p.stalls.join('/')) : '';
    return `<div class="hdv-row"><div class="hdv-info">
      <div class="hdv-name">${esc(p.n)}</div>
      <div class="hdv-sub">${esc(sups)}${stalls} · bought ${p.buys || 0}×${p.last ? ' · last ' + esc(p.last) : ''}</div>
    </div></div>`;
  }).join('');
  return h;
}

/* ---- Margins tab: cost / sell / margin per catalogue product (v1 parity) ---- */
function marginRow(p) {
  const m = marginInfo(p.key) || {};
  const cost = (m.cost != null) ? money(m.cost) : '—';
  const sell = (m.sell != null) ? money(m.sell) : '—';
  const pct = (m.marginPct != null) ? m.marginPct + '%' : '—';
  return `<div class="hdv-row" data-act="detail" data-key="${esc(p.key)}">
    <div class="hdv-info">
      <div class="hdv-name">${esc(p.name)}</div>
      <div class="hdv-sub">cost ${cost} · sell ${sell}</div>
    </div>
    <span style="min-width:54px;text-align:right;font-weight:800;font-size:14px;color:${marginColor(m.marginPct)}">${pct}</span>
  </div>`;
}

function renderMargins(q) {
  let list = q ? searchCatalog(q) : catalog();
  if (mGroup) list = list.filter(p => p.group === mGroup);
  let h = chipsHTML(groups(), mGroup);
  let nCost = 0, sumCost = 0, sumSell = 0;
  list.forEach(p => { const m = marginInfo(p.key); if (m && m.cost != null && m.sell != null) { nCost++; sumCost += m.cost; sumSell += m.sell; } });
  if (nCost) {
    const avg = sumSell > 0 ? Math.round((sumSell - sumCost) / sumSell * 100) : 0;
    h += `<div class="hdv-sec">${nCost} priced · avg margin ${avg}%</div>`;
  } else if (!secureLoaded()) {
    h += `<div class="hdv-sec">Costs loading…</div>`;
  }
  if (!list.length) return h + emptyHTML(q ? `No products match “${esc(q)}”` : 'No products');
  if (q || mGroup) { h += list.map(marginRow).join(''); return h; }
  const byCat = new Map();
  for (const p of list) { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); }
  for (const c of orderedCats()) {
    const g = byCat.get(c);
    if (!g || !g.length) continue;
    h += `<div class="hdv-sec">${esc(c)}</div>` + g.map(marginRow).join('');
  }
  return h;
}

/* ---- Wastage tab: logged in EPOS, by date ---- */
function renderWastage(q) {
  const w = histData().waste;
  if (!w || typeof w !== 'object') return emptyHTML('Wastage is loading…');
  const dates = Object.keys(w).sort((a, b) => b.localeCompare(a));
  const n = q ? q.toLowerCase() : '';
  let body = '', grand = 0;
  for (const d of dates) {
    let items = w[d] || [];
    if (n) items = items.filter(x => String(x.desc || '').toLowerCase().includes(n));
    if (!items.length) continue;
    const tot = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    grand += tot;
    body += `<div class="hdv-sec">${esc(d)}</div>`;
    body += items.map(x => `<div class="hdv-row"><div class="hdv-info">
      <div class="hdv-name" style="font-size:14px;font-weight:600">${esc(x.desc || '')}</div>
    </div></div>`).join('');
  }
  if (!body) return emptyHTML(q ? 'No wastage matches' : 'No wastage logged');
  return `<div class="hdv-sec">${dates.length} day${dates.length === 1 ? '' : 's'} logged</div>` + body;
}

export function renderMoney(root) {
  ensureCss();
  setActive(() => renderMoney(root));

  const hd = histData();
  if (!hd.sales && !hd.store && !hd.waste) loadHistory();   // fire-and-forget; re-renders on 'change'

  const q = qText();
  let h = `<div class="hdv-head"><div class="hdv-h1">Money</div></div>`;
  h += `<div class="hdv-viewtog">
    <button class="hdv-vbtn${mTab === 'sales' ? ' on' : ''}" data-act="mtab" data-tab="sales">Sales</button>
    <button class="hdv-vbtn${mTab === 'purchases' ? ' on' : ''}" data-act="mtab" data-tab="purchases">Purchases</button>
    <button class="hdv-vbtn${mTab === 'margins' ? ' on' : ''}" data-act="mtab" data-tab="margins">Margins</button>
    <button class="hdv-vbtn${mTab === 'wastage' ? ' on' : ''}" data-act="mtab" data-tab="wastage">Wastage</button>
  </div>`;

  if (mTab === 'sales') h += renderSales(q);
  else if (mTab === 'purchases') h += renderPurchases(q);
  else if (mTab === 'wastage') h += renderWastage(q);
  else h += renderMargins(q);

  h += '<div class="hdv-pad"></div>';
  root.innerHTML = h;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'mtab') { mTab = t.dataset.tab; renderMoney(root); }
    else if (act === 'chip') { mGroup = t.dataset.cat; renderMoney(root); }
    else if (act === 'detail') openSheet(productSheet(t.dataset.key));
  };
}
