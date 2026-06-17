/* Happy Days v3 (in-house) — money.js
   Operational HISTORY only: Purchases (what we bought at the market) and Wastage.
   Sales revenue and ALL cost/margin (internal costs to produce) are deliberately NOT
   here — sales & costs live in V4 only (owner rule, 2026-06-17). */

import { histData, loadHistory } from './store.js';
import { setActive, esc, emptyHTML, ensureCss, qText } from './catalog.js';

let mTab = 'purchases';   // purchases | wastage

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

/* ---- Wastage tab: logged in EPOS, by date ---- */
function renderWastage(q) {
  const w = histData().waste;
  if (!w || typeof w !== 'object') return emptyHTML('Wastage is loading…');
  const dates = Object.keys(w).sort((a, b) => b.localeCompare(a));
  const n = q ? q.toLowerCase() : '';
  let body = '';
  for (const d of dates) {
    let items = w[d] || [];
    if (n) items = items.filter(x => String(x.desc || '').toLowerCase().includes(n));
    if (!items.length) continue;
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
  if (!hd.store && !hd.waste) loadHistory();   // fire-and-forget; re-renders on 'change'

  const q = qText();
  let h = `<div class="hdv-head"><div class="hdv-h1">Money</div></div>`;
  h += `<div class="hdv-viewtog">
    <button class="hdv-vbtn${mTab === 'purchases' ? ' on' : ''}" data-act="mtab" data-tab="purchases">Purchases</button>
    <button class="hdv-vbtn${mTab === 'wastage' ? ' on' : ''}" data-act="mtab" data-tab="wastage">Wastage</button>
  </div>`;

  if (mTab === 'wastage') h += renderWastage(q);
  else h += renderPurchases(q);

  h += '<div class="hdv-pad"></div>';
  root.innerHTML = h;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'mtab') { mTab = t.dataset.tab; renderMoney(root); }
  };
}
