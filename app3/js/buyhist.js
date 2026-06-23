/* Happy Days v3 — buyhist.js : BUYING HISTORY (read-only window into V4).
   Data comes from the LOCKED /buyhist Firebase node, loaded only AFTER a staff login
   (anonymous reads are blocked). It is NEVER baked into the public app files. Photos are
   not included (data only) — phones can't open the laptop's local docket files. Staff can
   SEE this; they can't edit it — V4 on the laptop stays the single source of truth. */
import { setActive, esc, emptyHTML, ensureCss, qText } from './catalog.js';
import { buyHistData, loadBuyHist } from './store.js';

let bTab = 'runs';      // runs | suppliers | prices
let bRun = null;        // drilled-into run date

const m = (n) => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m0 = (n) => '$' + Math.round(+n || 0).toLocaleString('en-AU');

function runsView(H) {
  if (bRun) {
    const r = (H.runs || []).filter((x) => x.date === bRun)[0];
    if (!r) { bRun = null; return runsView(H); }
    let h = `<div class="hdv-sec"><a href="#" data-act="bback">&larr; back to runs</a></div>`;
    h += `<div class="hdv-sec" style="font-weight:700">${esc(r.label)} · ${m(r.total)} · ${r.lineCount} lines</div>`;
    h += (r.items || []).map((l) => `<div class="hdv-row"><div class="hdv-info">
      <div class="hdv-name">${esc(l.productName)}</div>
      <div class="hdv-sub">${esc(l.supplier || '')}${l.stall ? ' · stall ' + esc(l.stall) : ''} · ${l.qty} × ${m(l.price)} = <b>${m(l.total)}</b></div>
    </div></div>`).join('');
    return h;
  }
  let h = `<div class="hdv-sec">${H.runCount} market runs · ${m0(H.totalSpend)} spent${H.dateRange ? ' · ' + esc(H.dateRange[0] + ' to ' + H.dateRange[1]) : ''}</div>`;
  h += (H.runs || []).map((r) => `<div class="hdv-row" data-act="brun" data-run="${esc(r.date)}" style="cursor:pointer">
    <div class="hdv-info"><div class="hdv-name">${esc(r.label)}</div>
    <div class="hdv-sub">${r.lineCount} lines · <b>${m(r.total)}</b> · ${r.source === 'Buy sheet' ? 'buy sheet' : 'confirmed run'}</div></div></div>`).join('');
  return h;
}

function suppliersView(H) {
  const bs = H.bySupplier || [];
  const max = Math.max.apply(null, bs.map((s) => s.spend).concat([1]));
  let h = `<div class="hdv-sec">Spend by supplier · ${bs.length} suppliers</div>`;
  h += bs.slice(0, 80).map((s) => {
    const pc = Math.round((s.spend / max) * 100);
    return `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name">${esc(s.supplier)} · <b>${m(s.spend)}</b></div>
      <div class="hdv-sub">${s.lines} lines · last ${esc(s.lastDate || '')}</div>
      <div style="height:6px;background:#e6efe9;border-radius:4px;margin-top:5px"><div style="height:6px;width:${pc}%;background:#15662f;border-radius:4px"></div></div></div></div>`;
  }).join('');
  return h;
}

function pricesView(H, q) {
  const terms = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (H.priceTrends || []).filter((p) => { const n = p.product.toLowerCase(); return !terms.length ? p.times > 1 : terms.every((t) => n.includes(t)); });
  let h = `<div class="hdv-sec">${terms.length ? 'Showing "' + esc(q) + '" — price each time + kg per box' : 'Search a product in the bar above (banana, tomato…) to see every buy price + kg per box. Showing items bought more than once.'}</div>`;
  if (!hits.length) return h + emptyHTML('No products match');
  h += hits.slice(0, 60).map((p) => {
    const arrow = p.changePct == null ? '' : (p.changePct > 0 ? ` <span style="color:#c0392b;font-weight:700">↑${p.changePct}%</span>` : p.changePct < 0 ? ` <span style="color:#15662f;font-weight:700">↓${Math.abs(p.changePct)}%</span>` : '');
    const box = p.boxLabel ? ` <span style="font-size:11px;color:#15662f;background:#eaf3ec;border-radius:6px;padding:1px 6px">📦 ${esc(p.boxLabel)}</span>` : '';
    const pk = !!p.boxKg;
    const pts = (p.points || []).map((x) => `<div class="hdv-sub" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(x.date)} · ${esc(x.supplier || '')}</span><span style="white-space:nowrap"><b>${m(x.price)}</b>${pk && x.perKg != null ? ' · ' + m(x.perKg) + '/kg' : ''}</span></div>`).join('');
    return `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name">${esc(p.product)}${box}${arrow}</div>${pts}</div></div>`;
  }).join('');
  return h;
}

export function renderBuyHist(root) {
  ensureCss();
  setActive(() => renderBuyHist(root));
  const H = buyHistData();
  if (!H) { loadBuyHist(); root.innerHTML = `<div class="hdv-head"><div class="hdv-h1">Buying history</div></div>` + emptyHTML('Loading your buying history…'); return; }
  const q = qText();
  let h = `<div class="hdv-head"><div class="hdv-h1">Buying history</div></div>`;
  h += `<div class="hdv-viewtog">
    <button class="hdv-vbtn${bTab === 'runs' ? ' on' : ''}" data-act="btab" data-tab="runs">Market runs</button>
    <button class="hdv-vbtn${bTab === 'suppliers' ? ' on' : ''}" data-act="btab" data-tab="suppliers">By supplier</button>
    <button class="hdv-vbtn${bTab === 'prices' ? ' on' : ''}" data-act="btab" data-tab="prices">Buy prices</button>
  </div>`;
  if (bTab === 'suppliers') h += suppliersView(H);
  else if (bTab === 'prices') h += pricesView(H, q);
  else h += runsView(H);
  h += '<div class="hdv-pad"></div>';
  root.innerHTML = h;
  root.onclick = (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act;
    if (a === 'btab') { bTab = t.dataset.tab; bRun = null; renderBuyHist(root); }
    else if (a === 'brun') { bRun = t.dataset.run; renderBuyHist(root); }
    else if (a === 'bback') { e.preventDefault(); bRun = null; renderBuyHist(root); }
  };
}
