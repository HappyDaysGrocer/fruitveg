/* Happy Days v3 — buyhist.js : BUYING HISTORY (read-only window into V4).
   Data comes from the LOCKED /buyhist Firebase node, loaded only AFTER a staff login
   (anonymous reads are blocked). It is NEVER baked into the public app files. Photos are
   not included (data only) — phones can't open the laptop's local docket files. Staff can
   SEE this; they can't edit it — V4 on the laptop stays the single source of truth. */
import { setActive, esc, emptyHTML, ensureCss, qText, openSheet, closeSheet, fmtPhone } from './catalog.js';
import { buyHistData, loadBuyHist } from './store.js';
import { supplierContact } from './suppliers.js';

let bTab = 'runs';      // runs | suppliers | prices
let bRun = null;        // drilled-into run date

const m = (n) => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m0 = (n) => '$' + Math.round(+n || 0).toLocaleString('en-AU');

/* Stall (market shop) lookup, derived from the run lines (priceTrends points dropped it).
   exact = stall for a specific date+product+supplier; bySup = that supplier's most-recent stall.
   Memoised on the history object so it isn't rebuilt every render. */
let _stallFor = null, _stallCache = null;
function stalls(H) {
  if (_stallFor === H && _stallCache) return _stallCache;
  const bySup = {}, exact = {};
  for (const r of (H.runs || [])) for (const it of (r.items || [])) {   // runs are newest-first → first seen = latest stall
    if (!it.stall) continue;
    if (it.supplier && !bySup[it.supplier]) bySup[it.supplier] = it.stall;
    exact[(r.date || '') + '|' + (it.productName || '') + '|' + (it.supplier || '')] = it.stall;
  }
  _stallFor = H; _stallCache = { bySup, exact };
  return _stallCache;
}

/* ONE shared supplier element — used EVERYWHERE a supplier name shows (run detail,
   buy prices, by supplier). Tapping it opens the same Call/Text pop-up; a 📞 marks
   suppliers we have a number on file for. One flow, identical everywhere. */
function supLink(name) {
  if (!name) return '';
  const c = supplierContact(name);
  return `<span data-callsup="${esc(name)}" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px">${esc(name)}${(c && c.phone) ? ' 📞' : ''}</span>`;
}

function runsView(H, q) {
  const terms = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (bRun) {
    const r = (H.runs || []).filter((x) => x.date === bRun)[0];
    if (!r) { bRun = null; return runsView(H, q); }
    let h = `<div class="hdv-sec"><a href="#" data-act="bback">&larr; back to runs</a></div>`;
    h += `<div class="hdv-sec" style="font-weight:700">${esc(r.label)} · ${m(r.total)} · ${r.lineCount} lines</div>`;
    // alphabetical by product, then live-filter on the search bar (product / supplier / stall)
    let items = (r.items || []).slice().sort((a, b) =>
      String(a.productName || '').localeCompare(String(b.productName || ''), undefined, { sensitivity: 'base' }));
    if (terms.length) {
      items = items.filter((l) => {
        const s = ((l.productName || '') + ' ' + (l.supplier || '') + ' ' + (l.stall || '')).toLowerCase();
        return terms.every((t) => s.includes(t));
      });
      h += `<div class="hdv-sec">${items.length} of ${(r.items || []).length} lines match “${esc(q)}”</div>`;
    } else {
      h += `<div class="hdv-sec">A–Z · type in the search bar above to filter</div>`;
    }
    if (!items.length) return h + emptyHTML(`No products match “${esc(q)}”`);
    h += items.map((l) => `<div class="hdv-row"><div class="hdv-info">
      <div class="hdv-name">${esc(l.productName)}</div>
      <div class="hdv-sub">${supLink(l.supplier)}${l.stall ? ' · 🏪 ' + esc(l.stall) : ''} · ${l.qty} × ${m(l.price)} = <b>${m(l.total)}</b></div>
    </div></div>`).join('');
    return h;
  }
  let runs = (H.runs || []);
  if (terms.length) runs = runs.filter((r) => {
    const s = ((r.label || '') + ' ' + (r.date || '')).toLowerCase();
    return terms.every((t) => s.includes(t));
  });
  let h = `<div class="hdv-sec">${H.runCount} market runs · ${m0(H.totalSpend)} spent${H.dateRange ? ' · ' + esc(H.dateRange[0] + ' to ' + H.dateRange[1]) : ''}</div>`;
  if (!runs.length) return h + emptyHTML(`No runs match “${esc(q)}”`);
  h += runs.map((r) => `<div class="hdv-row" data-act="brun" data-run="${esc(r.date)}" style="cursor:pointer">
    <div class="hdv-info"><div class="hdv-name">${esc(r.label)}</div>
    <div class="hdv-sub">${r.lineCount} lines · <b>${m(r.total)}</b> · ${r.source === 'Buy sheet' ? 'buy sheet' : 'confirmed run'}</div></div></div>`).join('');
  return h;
}

function suppliersView(H) {
  const bs = H.bySupplier || [];
  const S = stalls(H);
  const max = Math.max.apply(null, bs.map((s) => s.spend).concat([1]));
  let h = `<div class="hdv-sec">Spend by supplier · ${bs.length} suppliers</div>`;
  h += bs.slice(0, 80).map((s) => {
    const pc = Math.round((s.spend / max) * 100);
    const c = supplierContact(s.supplier);
    const st = S.bySup[s.supplier] || (c && c.stall) || '';
    const ph = c && c.phone ? c.phone : '';
    return `<div class="hdv-row" data-callsup="${esc(s.supplier)}" style="cursor:pointer"><div class="hdv-info"><div class="hdv-name">${esc(s.supplier)} · <b>${m(s.spend)}</b>${st ? ` <span style="font-size:11px;color:#15662f;background:#eaf3ec;border-radius:6px;padding:1px 6px">🏪 stall ${esc(st)}</span>` : ''}</div>
      <div class="hdv-sub">${s.lines} lines · last ${esc(s.lastDate || '')}${ph ? ' · 📞 ' + esc(fmtPhone(ph)) + ' · tap to call/text' : ' · tap for contact'}</div>
      <div style="height:6px;background:#e6efe9;border-radius:4px;margin-top:5px"><div style="height:6px;width:${pc}%;background:#15662f;border-radius:4px"></div></div></div></div>`;
  }).join('');
  return h;
}

function pricesView(H, q) {
  const terms = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const S = stalls(H);
  const hits = (H.priceTrends || []).filter((p) => { const n = p.product.toLowerCase(); return !terms.length ? p.times > 1 : terms.every((t) => n.includes(t)); });
  let h = `<div class="hdv-sec">${terms.length ? hits.length + ' product' + (hits.length === 1 ? '' : 's') + ' match “' + esc(q) + '” — every date you bought it + the price each time' : 'Type a product in the search bar above (banana, tomato…) to see every buy price + kg per box. Showing items bought more than once.'}</div>`;
  if (!hits.length) return h + emptyHTML(`No products match “${esc(q)}” — try a simpler word (e.g. just “banana”)`);
  h += hits.slice(0, 120).map((p) => {
    const arrow = p.changePct == null ? '' : (p.changePct > 0 ? ` <span style="color:#c0392b;font-weight:700">↑${p.changePct}%</span>` : p.changePct < 0 ? ` <span style="color:#15662f;font-weight:700">↓${Math.abs(p.changePct)}%</span>` : '');
    const box = p.boxLabel ? ` <span style="font-size:11px;color:#15662f;background:#eaf3ec;border-radius:6px;padding:1px 6px">📦 ${esc(p.boxLabel)}</span>` : '';
    const pk = !!p.boxKg;
    const pts = (p.points || []).map((x) => {
      const st = S.exact[(x.date || '') + '|' + (p.product || '') + '|' + (x.supplier || '')] || S.bySup[x.supplier] || '';
      return `<div class="hdv-sub" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(x.date)} · ${supLink(x.supplier)}${st ? ' · 🏪 ' + esc(st) : ''}</span><span style="white-space:nowrap"><b>${m(x.price)}</b>${pk && x.perKg != null ? ' · ' + m(x.perKg) + '/kg' : ''}</span></div>`;
    }).join('');
    return `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name">${esc(p.product)}${box}${arrow}</div>${pts}</div></div>`;
  }).join('');
  return h;
}

/* Tap a supplier → a Call / Text pop-up (for ringing the stall in the morning). */
function supplierContactSheet(name) {
  return (body) => {
    const c = supplierContact(name);
    const phone = c && c.phone ? c.phone : '';
    const tel = phone.replace(/[^0-9+]/g, '');
    const stall = c && c.stall ? c.stall : '';
    let h = `<div class="hdv-sheettitle">${esc(name)}</div>
      <div class="hdv-sheetsub">${stall ? '🏪 stall ' + esc(stall) : 'stall not on file'}${phone ? ' · ' + esc(fmtPhone(phone)) : ''}</div>`;
    if (phone) {
      h += `<div class="hdv-actions" style="flex-direction:column;gap:10px;align-items:stretch">
        <a class="hdv-btnP" style="text-align:center;text-decoration:none;display:block" href="tel:${esc(tel)}">📞 Call ${esc(fmtPhone(phone))}</a>
        <a class="hdv-btnG" style="text-align:center;text-decoration:none;display:block" href="sms:${esc(tel)}">✉️ Text message</a>
        <button class="hdv-btnG slim" data-act="cclose">Close</button>
      </div>`;
    } else {
      h += emptyHTML('No phone number on file for this supplier');
      h += `<div class="hdv-actions"><button class="hdv-btnP" data-act="cclose">Close</button></div>`;
    }
    body.innerHTML = h;
    body.onclick = (e) => { const t = e.target.closest('[data-act]'); if (t && t.dataset.act === 'cclose') closeSheet(); };
  };
}

export function renderBuyHist(root) {
  ensureCss();
  setActive(() => renderBuyHist(root));
  const H = buyHistData();
  if (!H) { loadBuyHist(); root.innerHTML = `<div class="hdv-head"><div class="hdv-h1">Buying history</div></div>` + emptyHTML('Loading your buying history…'); return; }
  const q = qText();
  const searching = !!q && !bRun;          // typing (not inside a run) → jump straight to Buy-price history, like the V4 dashboard
  const hot = searching ? 'prices' : bTab;
  let h = `<div class="hdv-head"><div class="hdv-h1">Buying history</div></div>`;
  h += `<div class="hdv-viewtog">
    <button class="hdv-vbtn${hot === 'runs' ? ' on' : ''}" data-act="btab" data-tab="runs">Market runs</button>
    <button class="hdv-vbtn${hot === 'suppliers' ? ' on' : ''}" data-act="btab" data-tab="suppliers">By supplier</button>
    <button class="hdv-vbtn${hot === 'prices' ? ' on' : ''}" data-act="btab" data-tab="prices">Buy prices</button>
  </div>`;
  if (!q && !bRun) h += `<div class="hdv-sec" style="color:var(--hdv-green)">🔍 Search any product in the bar above — every date you bought it, the price each time &amp; kg per box (${(H.priceTrends || []).length} products on file)</div>`;
  if (bRun) h += runsView(H, q);                 // inside a run → the search filters that run's lines
  else if (searching) h += pricesView(H, q);     // typing anywhere else → full buy-price history (all products)
  else if (bTab === 'suppliers') h += suppliersView(H);
  else if (bTab === 'prices') h += pricesView(H, q);
  else h += runsView(H, q);
  h += '<div class="hdv-pad"></div>';
  root.innerHTML = h;
  root.onclick = (e) => {
    const sup = e.target.closest('[data-callsup]');
    if (sup) { openSheet(supplierContactSheet(sup.getAttribute('data-callsup'))); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act;
    if (a === 'btab') { bTab = t.dataset.tab; bRun = null; const qb = document.getElementById('q'); if (qb && qb.value) qb.value = ''; renderBuyHist(root); }
    else if (a === 'brun') { bRun = t.dataset.run; renderBuyHist(root); }
    else if (a === 'bback') { e.preventDefault(); bRun = null; renderBuyHist(root); }
  };
}
