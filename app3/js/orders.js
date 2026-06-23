/* Happy Days v2 — orders.js
   ORDERS view (customer cards -> take-order screen with tier pricing,
   review sheet, complete) and MORE view (login, sync, classic-app link,
   shop details). Reuses the UI kit + reactive core from catalog.js. */

import {
  catalog, categories, groups, orderedCats, searchCatalog,
  customers, orders, tiers,
  runs, runById, saveRun, deliveryInfo, saveTier,
  specials, saveSpecial, specialFor,
  standingFor, saveStanding, generateStandingOrders,
  saveCustomer, saveOrder, ensureOpenOrder, tierPrice,
  customerId, createCustomerLogin,
  isOut, outList, setOut,
  auth, pull, VERSION, PRICES_CHECKED, outboxCount, flushOutbox,
  queueForTill, tillQueueStatus,
  secureLoaded, costOf
} from './store.js';

import {
  setActive, rerenderNow,
  openSheet, closeSheet, refreshSheet,
  toast, shareText,
  esc, money, asList, qText, todayStr,
  chipsHTML, stepperHTML, emptyHTML, ensureCss
} from './catalog.js';

import { shareInvoice, sharePL } from './pdfinvoice.js';
import { openOrderForm } from './orderform.js';

/* Business + payment details — one source for the text invoice and the PDF.
   Legal entity now shown on invoices (owner 2026-06-22, to match the V4 invoice):
   "Mango People Pty Ltd" trading as "Happy Days Fruit Veg & Grocer". */
const BIZ = {
  name: 'Happy Days Fruit Veg & Grocer',
  legal: 'Mango People Pty Ltd',
  abn: '95 688 893 156',
  addr: 'Unit 4, 684-700 Frankston-Dandenong Rd, Carrum Downs VIC 3201',
  phone: '0430 033 127',
  contacts: 'Abhi 0408 752 385   Ravi 0430 033 127   Jaz 0415 703 336',
  email: 'happydaysgrocer@gmail.com',
  accName: 'Mango People Pty Ltd',
  // ⚠ PAYMENT DETAILS — LOCKED. Owner directive 2026-06-14: these NEVER change.
  // Do not edit bsb/acc without an explicit, unambiguous instruction from the owner.
  bsb: '063-118',
  acc: '10669177'
};

/* ------------------------------------------------------- view state */

let mode = 'list';   // 'list' (customer cards) | 'take' (take-order screen) | 'board' (orders board)
let curId = null;    // customer id when mode === 'take'
let boardFilter = 'all';   // Orders board active filter chip
let takeCat = '';    // category chip on the take-order screen
let pickDate = '';   // selected delivery date in the picking sheet
let pickMode = 'buy'; // 'buy' (aggregated) | 'cust' (per-customer slips)

function clearSearch() {
  const q = document.getElementById('q');
  if (q) q.value = '';
}

function tierMap() {
  const m = {};
  for (const t of asList(tiers())) if (t && t.id) m[t.id] = t;
  return m;
}

function openOrderOf(custId) {
  return asList(orders()).find(o => o && o.custId === custId && o.status === 'open');
}

/* ----- small formatters for customers / runs / dates ----- */
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_LABELS = { restaurant: 'Restaurant', cafe: 'Cafe', agedcare: 'Aged care', wholesale: 'Wholesale', retail: 'Retail' };
function typeLabel(x) { return TYPE_LABELS[x] || x || ''; }
function niceDate(ymd) {
  if (!ymd) return '';
  const a = String(ymd).split('-').map(n => parseInt(n, 10));
  const dt = new Date(a[0], (a[1] || 1) - 1, a[2] || 1);
  return `${WD[dt.getDay()]} ${a[2]} ${MON[(a[1] || 1) - 1]}`;
}
function offsetWord(o) { o = Number(o) || 0; return o === 0 ? 'same day' : o === -1 ? 'night before' : Math.abs(o) + ' days before'; }
/** "Order by 9pm tonight for delivery Sat 13 Jun" from deliveryInfo(). */
function cutoffBannerText(di) {
  if (!di) return '';
  const cut = new Date(di.cutoffAt);
  let hr = cut.getHours(); const ampm = hr >= 12 ? 'pm' : 'am';
  hr = hr % 12 || 12;
  const time = hr + (cut.getMinutes() ? ':' + String(cut.getMinutes()).padStart(2, '0') : '') + ampm;
  const now = new Date();
  const days = Math.round((new Date(cut.getFullYear(), cut.getMonth(), cut.getDate()) -
    new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const dayWord = days === 0 ? (cut.getHours() >= 17 ? 'tonight' : 'today')
    : days === 1 ? 'tomorrow' : WD[cut.getDay()];
  return `Order by ${time} ${dayWord} for delivery ${niceDate(di.date)}`;
}
function cutoffLabel(r) { return `${r.cutoffTime || '21:00'} (${offsetWord(r.cutoffDayOffset)})`; }
function daysLabel(days) {
  days = Array.isArray(days) ? days : [];
  return days.length ? days.slice().sort((a, b) => a - b).map(d => WD[d]).join(' ') : '—';
}

/* ========================================================= ORDERS view */

export function renderOrders(root) {
  ensureCss();
  setActive(() => renderOrders(root));

  // FRONT DOOR: not signed in -> welcome screen (customers land here).
  if (!auth.user()) { renderWelcome(root); return; }

  // CUSTOMER MODE: a customer login only ever sees its own ordering screen.
  const myId = customerId();
  if (myId) {
    const me = asList(customers()).find(c => c && c.id === myId);
    mode = 'take'; curId = myId;
    if (me) { renderTake(root, me); return; }
    root.innerHTML = emptyHTML(
      'Your account isn’t linked to a customer yet — ' +
      'call Happy Days on 0430 033 127');
    root.onclick = null;
    return;
  }

  if (mode === 'board') { renderBoard(root); return; }
  const cust = mode === 'take'
    ? asList(customers()).find(c => c && c.id === curId)
    : null;
  if (mode === 'take' && cust) renderTake(root, cust);
  else { mode = 'list'; renderCustomers(root); }
}

/* ---- front door (signed out) ----------------------------------------- */

function renderWelcome(root) {
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;
      padding:42px 24px 24px;gap:6px">
      <img src="../happydays-wordmark.png" alt="Happy Days"
        style="height:84px;background:#fff;padding:8px 14px;border-radius:14px;
        box-shadow:0 2px 10px rgba(13,40,24,.15)">
      <div style="font-size:21px;font-weight:800;color:var(--hdv-text);margin-top:14px">
        Welcome to Happy Days</div>
      <div style="font-size:14.5px;color:var(--hdv-sub);max-width:300px;line-height:1.45">
        Fresh fruit, veg &amp; groceries delivered to your business in Carrum Downs
        and surrounds.</div>
      <button class="hdv-btnP" data-act="signin" style="max-width:300px;width:100%;margin-top:18px">
        Sign in to order</button>
      <button class="hdv-btnG" data-act="browse" style="max-width:300px;width:100%">
        Browse the shop</button>
      <div style="font-size:13px;color:var(--hdv-sub);margin-top:16px">
        Want an account? Call us on
        <a class="hdv-link" href="tel:0430033127">0430 033 127</a></div>
    </div>`;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'signin') openSheet(loginSheet, { static: true });
    else if (t.dataset.act === 'browse') window.HD.go('shop');
  };
}

/* ---- customer cards -------------------------------------------------- */

function renderCustomers(root) {
  const q = qText().toLowerCase();
  const tm = tierMap();
  let list = asList(customers())
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  if (q) list = list.filter(c => String(c.name || '').toLowerCase().includes(q));

  let h = `<div class="hdv-head">
    <div class="hdv-h1">Customers</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button class="hdv-btnP slim" data-act="board">📋 Orders</button>
      <button class="hdv-btnG slim" data-act="import">Import</button>
      <button class="hdv-btnG slim" data-act="picking">Picking</button>
      <button class="hdv-btnG slim" data-act="owing">Owing</button>
      <button class="hdv-btnG slim" data-act="newcust">+ New</button>
    </div>
  </div>`;

  if (!list.length) {
    h += emptyHTML(q
      ? `No customers match “${esc(qText())}”`
      : 'No customers yet — add your first one');
  }

  const custCard = c => {
    const t = tm[c.tierId];
    const open = openOrderOf(c.id);
    const n = open && Array.isArray(open.lines) ? open.lines.length : 0;
    const packed = open && Array.isArray(open.lines) ? open.lines.filter(l => l && l.packed).length : 0;
    const meta = [
      c.type ? typeLabel(c.type) : '',
      n ? `${n} item${n === 1 ? '' : 's'} on open order${packed ? ` · ${packed}/${n} packed` : ''}` : 'No open order',
      c.phone ? esc(c.phone) : ''
    ].filter(Boolean).join(' · ');
    return `<div class="hdv-card${n ? ' has-order' : ''}" data-act="cust" data-id="${esc(c.id)}">
      <div class="hdv-info">
        <div class="hdv-name">${esc(c.name || '(unnamed)')}${n ? ` <span class="hdv-ordtag">● order in · ${n}</span>` : ''}</div>
        <div class="hdv-count">${meta}</div>
      </div>
      <button class="hdv-btnG slim" data-act="edit" data-id="${esc(c.id)}">Edit</button>
      <span class="hdv-tchip">${esc(t ? t.name : (c.tierId || 'retail'))}</span>
    </div>`;
  };

  const restoOrCafe = list.filter(c => ['restaurant', 'cafe'].includes(c.tierId));
  const others = list.filter(c => !['restaurant', 'cafe'].includes(c.tierId));

  if (restoOrCafe.length) {
    h += `<div class="hdv-sec">Restaurants & Café</div>`;
    h += restoOrCafe.map(custCard).join('');
  }
  if (others.length) {
    if (restoOrCafe.length) h += `<div class="hdv-sec">Other customers</div>`;
    h += others.map(custCard).join('');
  }
  h += '<div class="hdv-pad"></div>';

  root.innerHTML = h;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'board') {
      mode = 'board'; clearSearch(); rerenderNow();
    } else if (t.dataset.act === 'cust') {
      mode = 'take'; curId = t.dataset.id; takeCat = '';
      clearSearch(); rerenderNow();
    } else if (t.dataset.act === 'edit') {
      const c = asList(customers()).find(x => x && x.id === t.dataset.id);
      if (c) openSheet(b => customerSheet(b, c), { static: true });
    } else if (t.dataset.act === 'newcust') {
      openSheet(b => customerSheet(b, null), { static: true });
    } else if (t.dataset.act === 'picking') {
      openSheet(pickingSheet);
    } else if (t.dataset.act === 'owing') {
      openSheet(outstandingSheet);
    } else if (t.dataset.act === 'import') {
      openSheet(importSheet, { static: true });
    }
  };
}

/* ===== Orders BOARD — every order at a glance (v4-style) ==================
   An order-first view (vs the customer-first cards): all live orders in one
   searchable, filterable list with To pack / To deliver / Awaiting $ cards and
   tappable packed·delivered·paid dots. Tap a row → the rich invoice detail
   (tracker / proof / till / pay / edit). Reuses v3.80's SHARED tracker
   (trkDone/trkSet) so the board, the detail and the V4 dashboard all agree. == */

const isPacked    = (o) => trkDone(o, 'packed');
const isDelivered = (o) => trkDone(o, 'delivered');
const isPaidOrder = (o) => trkDone(o, 'paid');
const setOrderStage = (o, stage, on) => trkSet(o, stage, on);

/* Payment method per order — mirrors the V4 dashboard rule (23 Jun): Reddy Roast pays by CARD on the
   till; every other customer pays by BANK TRANSFER. o.payMethod (set from the V4 dashboard) overrides. */
function payMethodOf(o) {
  if (o && o.payMethod) { const m = String(o.payMethod).toLowerCase(); return m.indexOf('cash') >= 0 ? 'cash' : m.indexOf('card') >= 0 ? 'card' : m.indexOf('other') >= 0 ? 'other' : 'bank'; }
  return /reddy/i.test(custName(o && o.custId)) ? 'card' : 'bank';
}
function payBadgeHtml(o) {
  const p = payMethodOf(o);
  const d = p === 'card' ? ['💳', 'Card', '#4b5563', '#f1f3f5'] : p === 'cash' ? ['💵', 'Cash', '#b45309', '#fef3e2'] : p === 'other' ? ['•', 'Other', '#6b7280', '#f1f3f5'] : ['🏦', 'Bank transfer', 'var(--hdv-green)', '#eaf3ec'];
  return `<span style="display:inline-block;font-size:11px;font-weight:600;color:${d[2]};background:${d[3]};border-radius:8px;padding:1px 6px;white-space:nowrap">${d[0]} ${d[1]}</span>`;
}
function renderBoard(root) {
  const q = qText().toLowerCase();
  const all = asList(orders()).filter(o => o && o.status !== 'cancelled' && Array.isArray(o.lines) && o.lines.length);
  all.sort((a, b) => String(b.deliveryDate || b.date || b.completed || '').localeCompare(String(a.deliveryDate || a.date || a.completed || '')));
  const placed = all.filter(o => o.status === 'completed');
  const toPack = placed.filter(o => !isPacked(o)).length;
  const toDeliver = placed.filter(o => !isDelivered(o)).length;
  const unpaid = placed.filter(o => !isPaidOrder(o));
  const unpaidAmt = unpaid.reduce((s, o) => s + orderTotal(o.lines), 0);

  let list;
  if (boardFilter === 'unpaid') list = placed.filter(o => !isPaidOrder(o));
  else if (boardFilter === 'topack') list = placed.filter(o => !isPacked(o));
  else if (boardFilter === 'todeliver') list = placed.filter(o => !isDelivered(o));
  else if (boardFilter === 'open') list = all.filter(o => o.status !== 'completed');
  else list = all;
  if (q) list = list.filter(o => (custName(o.custId) + ' ' + (o.orderNo || '') + ' ' + (o.deliveryDate || o.date || '')).toLowerCase().includes(q));

  const stat = (k, v, s, col) => `<div style="flex:1;min-width:84px;background:var(--hdv-card);border:1px solid var(--hdv-line);border-radius:12px;padding:9px 10px;text-align:center">
    <div style="font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--hdv-sub)">${k}</div>
    <div style="font-size:19px;font-weight:800;color:${col}">${v}</div>${s ? `<div style="font-size:10.5px;color:var(--hdv-sub)">${s}</div>` : ''}</div>`;

  const FILT = [['all', 'All'], ['unpaid', 'Unpaid'], ['topack', 'To pack'], ['todeliver', 'To deliver'], ['open', 'Open']];
  const chip = (k, lbl) => { const on = boardFilter === k; return `<button data-bfilter="${k}" style="flex:0 0 auto;min-height:36px;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${on ? 'var(--hdv-green)' : 'var(--hdv-line)'};background:${on ? 'var(--hdv-green)' : 'var(--hdv-card)'};color:${on ? '#fff' : 'var(--hdv-text)'}">${esc(lbl)}</button>`; };

  const dot = (o, st, lbl) => { const on = st === 'packed' ? isPacked(o) : st === 'delivered' ? isDelivered(o) : isPaidOrder(o);
    return `<button data-stage="${st}" data-id="${esc(o.id)}" title="${on ? 'Tap to undo' : 'Tap to mark ' + lbl}" aria-label="${lbl}" style="width:30px;height:30px;border-radius:50%;border:0;font-size:12px;font-weight:800;cursor:pointer;margin-right:6px;${on ? 'background:var(--hdv-green);color:#fff' : 'background:var(--hdv-lt);color:var(--hdv-sub)'}">${lbl}</button>`; };

  let h = `<div class="hdv-head">
    <div class="hdv-h1">Orders</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="hdv-btnP" data-bact="customers">Customers</button>
      <button class="hdv-btnG slim" data-bact="picking">Picking</button>
    </div>
  </div>`;
  h += `<div style="display:flex;gap:7px;padding:4px 12px 10px">
    ${stat('To pack', toPack, '', toPack ? 'var(--hdv-amber)' : 'var(--hdv-green)')}
    ${stat('To deliver', toDeliver, '', toDeliver ? 'var(--hdv-amber)' : 'var(--hdv-green)')}
    ${stat('Awaiting $', money(unpaidAmt), unpaid.length + ' unpaid', unpaid.length ? 'var(--hdv-red)' : 'var(--hdv-green)')}
  </div>`;
  h += `<div style="display:flex;gap:6px;overflow-x:auto;padding:0 12px 10px;scrollbar-width:none">${FILT.map(f => chip(f[0], f[1])).join('')}</div>`;

  if (!list.length) {
    h += emptyHTML(q || boardFilter !== 'all' ? 'No orders match' : 'No orders yet');
  } else {
    h += `<div class="hdv-sec">${list.length} order${list.length === 1 ? '' : 's'}</div>`;
    h += list.map(o => {
      const completed = o.status === 'completed', paid = isPaidOrder(o);
      const status = !completed ? '<b style="color:var(--hdv-amber)">Open</b>'
        : paid ? '<b style="color:var(--hdv-green)">Paid</b>' : '<b style="color:var(--hdv-red)">Unpaid</b>';
      let due = '';
      if (completed && !paid && o.dueDate) { const od = o.dueDate < todayStr(); due = ` · <span style="color:${od ? 'var(--hdv-red)' : 'var(--hdv-sub)'};font-weight:${od ? '800' : '400'}">${od ? '⚠ overdue ' : 'due '}${esc(o.dueDate)}</span>`; }
      const n = o.lines.length;
      const when = o.deliveryDate ? 'deliver ' + niceDate(o.deliveryDate) : (o.completed || 'open');
      return `<div class="hdv-row" data-oopen="${esc(o.id)}" style="cursor:pointer">
        <div class="hdv-info">
          <div class="hdv-name">${esc(custName(o.custId))} · ${money(orderTotal(o.lines))} ${payBadgeHtml(o)}</div>
          <div class="hdv-sub">${esc(when)} · ${esc(o.orderNo || '—')} · ${n} item${n === 1 ? '' : 's'} · ${status}${due}</div>
          <div style="margin-top:7px">${dot(o, 'packed', 'P')}${dot(o, 'delivered', 'D')}${dot(o, 'paid', '$')}</div>
        </div>
      </div>`;
    }).join('');
  }
  h += '<div class="hdv-pad"></div>';
  root.innerHTML = h;
  root.onclick = e => {
    const d = e.target.closest('[data-stage]');
    if (d) {
      const o = orderById(d.dataset.id); if (!o) return;
      const st = d.dataset.stage, on = st === 'packed' ? isPacked(o) : st === 'delivered' ? isDelivered(o) : isPaidOrder(o);
      setOrderStage(o, st, !on);
      toast((on ? 'Unmarked ' : '✓ ') + (st === 'packed' ? 'packed' : st === 'delivered' ? 'delivered' : 'paid'));
      return;
    }
    const fb = e.target.closest('[data-bfilter]');
    if (fb) { boardFilter = fb.dataset.bfilter; rerenderNow(); return; }
    const ba = e.target.closest('[data-bact]');
    if (ba) {
      if (ba.dataset.bact === 'customers') { mode = 'list'; clearSearch(); rerenderNow(); }
      else if (ba.dataset.bact === 'picking') openSheet(pickingSheet);
      return;
    }
    const row = e.target.closest('[data-oopen]');
    if (row) { const o = orderById(row.dataset.oopen); if (o) openSheet(b => invoiceSheet(b, o.custId, o.id)); }
  };
}

/* ---- import a typed order ------------------------------------------------
   Paste a restaurant's order, pick the customer, Create — the order is written
   using THIS device's app login (no separate password needed). One item per
   line: "qty [unit] product name @ price"  (price optional; "1/2" allowed). */

const IMPORT_UNITS = ['box', 'boxes', 'bag', 'bags', 'bunch', 'bunches', 'kg',
  'punnet', 'punnets', 'tray', 'trays', 'each', 'ea', 'pack', 'packs'];

// Pre-loaded for import (swapped per task). CURRENT: order sheet (2026-06-18),
// priced from the app catalogue. Open Import, PICK THE CUSTOMER, Check, Create.
// Avocado tray + Lemon-by-kg were left off pending the owner's price.
const IMPORT_PREFILL = [
  '3 bunch Basil Bunch @ 4.50',
  '2 kg Apples Granny Smith /kg @ 4.99',
  '1 kg Beetroot /kg @ 5.99',
  '1 kg Brocili @ 3.91',
  '4 bunch Broccolini Bunch @ 2.99',
  '1 kg Carrots Premium Loose /kg @ 2.49',
  '2 punnet Tomato Cherry Punnets @ 3.50',
  '0.1 kg Chillies, Long Green /kg @ 16.99',
  '2 pack Lettuce Baby Cos Twin Pack @ 3.50',
  '2 each Cucumbers Continental XXL @ 2.50',
  '1 bag Onion Brown 10kg Bag @ 10.99',
  '5 bunch Parsley @ 2.99',
  '1 bag Potato Peeled 10kg Bag @ 25.00',
  '1 box Rocket Leaves Box 1.5kg @ 22.00',
  '2 bunch Onion Spring Bunch @ 2.49',
  '1 punnet Strawberries 250g @ 7.50',
  '4 kg Tomatoes Truss /kg @ 5.99',
  '1 kg Zucchini /kg @ 3.99'
].join('\n');

function parseQtyTok(s) {
  s = String(s).trim();
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseImportLine(line) {
  let s = String(line).trim();
  if (!s) return null;
  let price = null, cost = null;
  const pm = s.match(/(?:@|\$)\s*([\d.]+)(?:\s*[c\/]\s*([\d.]+))?\s*$/);   // trailing @sell [c cost]
  if (pm) { price = parseFloat(pm[1]); if (pm[2] != null) cost = parseFloat(pm[2]); s = s.slice(0, pm.index).trim(); }
  let qty = 1, rest = s;
  const qm = s.match(/^(\d+(?:\s*\/\s*\d+)?(?:\.\d+)?)\s+(.*)$/);  // leading qty / fraction
  if (qm) { const q = parseQtyTok(qm[1]); if (q != null) { qty = q; rest = qm[2].trim(); } }
  let unit = '';
  const first = (rest.split(/\s+/)[0] || '').toLowerCase().replace(/[.,]/g, '');
  if (IMPORT_UNITS.includes(first)) { unit = first; rest = rest.slice(rest.indexOf(' ') + 1).trim(); }
  return { qty, unit, name: rest, price, cost };
}

/* free-text product name -> catalogue item: exact name, else best search hit */
function matchProduct(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  const exact = catalog().find(p => String(p.name).toLowerCase() === n);
  if (exact) return exact;
  const hits = searchCatalog(name);
  return (hits && hits.length) ? hits[0] : null;
}

function importSheet(body) {
  const custs = asList(customers()).filter(Boolean)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  let selId = (custs[0] || {}).id || '';   // no preselect — owner picks the customer for this import
  let text = IMPORT_PREFILL;
  let checked = null;
  let replace = false;

  const readInputs = () => {
    const ta = body.querySelector('#imp-text'); if (ta) text = ta.value;
    const sel = body.querySelector('#imp-cust'); if (sel) selId = sel.value;
    const rc = body.querySelector('#imp-replace'); if (rc) replace = rc.checked;
  };
  const doMatch = () => text.split('\n').map(parseImportLine).filter(Boolean)
    .map(r => ({ ...r, item: matchProduct(r.name) }));

  const render = () => {
    const opts = custs.map(c => `<option value="${esc(c.id)}"${c.id === selId ? ' selected' : ''}>${esc(c.name || '(unnamed)')}${c.tierId ? ' · ' + esc(c.tierId) : ''}</option>`).join('');
    let preview = '';
    if (checked) {
      const okN = checked.filter(r => r.item).length;
      preview = `<div class="hdv-sec">${okN} matched${checked.length - okN ? ` · ${checked.length - okN} not found` : ''}</div>`;
      preview += checked.map(r => r.item
        ? `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name">${esc(r.item.name)}</div>
            <div class="hdv-sub">${r.qty}${r.unit ? ' ' + esc(r.unit) : ''}${r.price != null ? ' · sell ' + money(r.price) : ' · price to set'}${r.cost != null ? ' · cost ' + money(r.cost) : ''}</div></div></div>`
        : `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name" style="color:var(--hdv-red)">✗ ${esc(r.name)}</div>
            <div class="hdv-sub">no catalogue match — fix the wording</div></div></div>`).join('');
    }
    const canCreate = checked && checked.some(r => r.item);
    body.innerHTML = `
      <div class="hdv-sheettitle">Import order</div>
      <div class="hdv-sheetsub">Paste an order, pick the customer, Create. Writes using this device's login — no password needed.</div>
      <label class="hdv-lbl">Customer</label>
      <select id="imp-cust" class="hdv-in">${opts}</select>
      <label class="hdv-lbl">Order — one per line: qty unit name @ sell &nbsp;(add &nbsp;<b>c cost</b>&nbsp; for P&amp;L, e.g. @ 30 c 25)</label>
      <textarea id="imp-text" class="hdv-in" rows="9" style="font-family:inherit;line-height:1.5" placeholder="one item per line — e.g.&#10;2 box Carrots Premium Loose @ 26&#10;6 Avocado Hass Each @ 2&#10;5 kg Capsicum Red /kg @ 4.99">${esc(text)}</textarea>
      <label class="hdv-lbl" style="display:flex;align-items:center;gap:8px;font-weight:600;margin-top:8px">
        <input type="checkbox" id="imp-replace"${replace ? ' checked' : ''}> Replace this customer's order (remove anything not listed)
      </label>
      ${preview}
      <div class="hdv-actions">
        <button class="hdv-btnG slim" data-act="cancel">Close</button>
        ${checked
          ? `<button class="hdv-btnP" data-act="create"${canCreate ? '' : ' disabled'}>Create order</button>`
          : `<button class="hdv-btnP" data-act="check">Check</button>`}
      </div>`;
    // Editing the order after a Check invalidates the preview -> drop back so a
    // fresh Check is needed (and Create always re-matches the current text).
    const ta = body.querySelector('#imp-text');
    if (ta) ta.addEventListener('input', () => { checked = null; });
  };
  render();

  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'cancel') { closeSheet(); return; }
    readInputs();
    if (t.dataset.act === 'check') { checked = doMatch(); render(); return; }
    if (t.dataset.act === 'create') {
      if (!checked) checked = doMatch();
      const good = checked.filter(r => r.item);
      if (!selId) { toast('Pick a customer'); return; }
      if (!good.length) { toast('Nothing matched — tap Check first'); return; }
      const o = ensureOpenOrder(selId);
      const mk = (r) => {
        let price = (r.price == null ? '' : r.price);
        const src = (r.price == null ? 'tier' : 'manual');
        if (price === '') {                       // no explicit price -> last-order price, then tier, then shelf
          const tp = defaultLinePrice(selId, r.item.key);
          if (typeof tp === 'number') price = tp;
        }
        return { key: r.item.key, name: r.item.name, qty: r.qty, unit: r.unit || '',
          price, cost: (r.cost == null ? '' : r.cost), src };
      };
      if (replace) {
        o.lines = good.map(mk);                 // exactly the pasted items, nothing else
      } else {
        if (!Array.isArray(o.lines)) o.lines = [];
        const byKey = {}; o.lines.forEach(l => { if (l) byKey[l.key] = l; });
        for (const r of good) {
          const ln = byKey[r.item.key];
          if (ln) { ln.qty = r.qty; if (r.unit) ln.unit = r.unit; if (r.price != null) ln.price = r.price; if (r.cost != null) ln.cost = r.cost; }
          else o.lines.push(mk(r));
        }
      }
      saveOrder(o);
      const bad = checked.length - good.length;
      toast(`${replace ? 'Replaced with' : 'Added'} ${good.length} item${good.length === 1 ? '' : 's'}${bad ? ` · ${bad} skipped` : ''}`);
      closeSheet();
      curId = selId; mode = 'take'; clearSearch(); rerenderNow();
    }
  };
}

/* ---- take-order screen ----------------------------------------------- */

function renderTake(root, cust) {
  const t = tierMap()[cust.tierId];
  const open = openOrderOf(cust.id);
  const lines = open && Array.isArray(open.lines) ? open.lines : [];
  const lineByKey = {};
  for (const l of lines) lineByKey[l.key] = l;

  const q = qText();
  let list = q ? searchCatalog(q) : catalog();
  if (takeCat) list = list.filter(p => p.group === takeCat);   // chip = aisle

  const run = runById(cust.runId);
  const di = run ? deliveryInfo(run) : null;
  const delLabel = run
    ? (di ? `${run.name} · next delivery ${niceDate(di.date)}` : run.name)
    : 'No delivery run set';

  const self = cust.id === customerId();   // customer ordering for themselves

  let h = `<div class="hdv-back">
    ${self ? '' : '<button class="hdv-backbtn" data-act="back">‹ Customers</button>'}
    <div class="hdv-info">
      <div class="hdv-name">${self ? 'Your order · ' : ''}${esc(cust.name)}</div>
      <div class="hdv-sub">${esc(delLabel)}</div>
    </div>
    <span class="hdv-tchip">${esc(t ? t.name : (cust.tierId || ''))}</span>
  </div>`;

  const st = standingFor(cust.id);
  const stOn = st && st.active !== false && (st.lines || []).length;
  h += `<div style="display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid var(--hdv-line)">
    ${self ? '' : `<button class="hdv-btnG slim" data-act="editcust">Edit</button>
    <button class="hdv-btnG slim" data-act="prices">Prices</button>`}
    <button class="hdv-btnG slim" data-act="history">History</button>
    <button class="hdv-btnG slim" data-act="standing">${stOn ? '↻ Repeat on' : 'Repeat'}</button>
  </div>`;

  const cutText = cutoffBannerText(di);
  if (cutText) {
    h += `<div style="background:var(--hdv-lt);color:var(--hdv-green);font-size:13.5px;
      font-weight:700;padding:9px 12px;border-bottom:1px solid var(--hdv-line)">
      ⏱ ${esc(cutText)}</div>`;
  } else if (run) {
    h += `<div style="background:rgba(185,28,28,.08);color:var(--hdv-red);font-size:13.5px;
      font-weight:700;padding:9px 12px;border-bottom:1px solid var(--hdv-line)">
      Ordering is closed for the coming days — call us on 0430 033 127</div>`;
  }

  h += chipsHTML(groups(), takeCat);

  // Reorder-first (Woolies/Fresho): one tap to copy this customer's last order,
  // then just edit what changed — the biggest time-saver for weekly repeat orders.
  if (!q && !takeCat) {
    const last = completedOrdersOf(cust.id)[0];
    if (last && (last.lines || []).length) {
      h += `<button data-act="reorderlast" style="display:block;width:calc(100% - 24px);margin:10px 12px 2px;
        border:0;border-radius:12px;background:var(--hdv-green);color:#fff;font-family:inherit;
        font-size:14px;font-weight:800;padding:12px 14px;text-align:left;cursor:pointer">
        &#8635; Repeat last order &middot; ${last.lines.length} item${last.lines.length === 1 ? '' : 's'} &middot; ${money(orderTotal(last.lines))}
        <span style="font-weight:600;opacity:.85"> &mdash; ${esc(niceDate(last.deliveryDate || last.completed || ''))}</span>
      </button>`;
    }
  }

  // Order guide: the customer's usual products first (only on the unfiltered view)
  if (!q && !takeCat) {
    const usuals = usualsFor(cust.id);
    if (usuals.length) {
      h += `<div class="hdv-sec">★ Usuals</div>` +
        usuals.map(p => takeRow(p, lineByKey[p.key], cust)).join('');
    }
  }

  if (!list.length) {
    h += emptyHTML(q ? `No products match “${esc(q)}”` : 'Catalogue is empty');
  } else if (q) {
    h += `<div class="hdv-sec">${list.length} result${list.length === 1 ? '' : 's'}</div>`;
    h += list.map(p => takeRow(p, lineByKey[p.key], cust)).join('');
  } else {
    const byCat = new Map();
    for (const p of list) {
      if (!byCat.has(p.cat)) byCat.set(p.cat, []);
      byCat.get(p.cat).push(p);
    }
    for (const c of orderedCats(takeCat || undefined)) {
      const g = byCat.get(c);
      if (!g || !g.length) continue;
      h += `<div class="hdv-sec">${esc(c)}</div>` +
        g.map(p => takeRow(p, lineByKey[p.key], cust)).join('');
    }
  }

  h += '<div class="hdv-pad"></div>';

  if (lines.length) {
    const total = orderTotal(lines);
    h += `<button class="hdv-bar" data-act="review">
      <span>${lines.length} line${lines.length === 1 ? '' : 's'} · ${money(total)}</span>
      <span class="hdv-bar-cta">Review ›</span>
    </button>`;
  }

  root.innerHTML = h;
  root.onclick = e => {
    const t2 = e.target.closest('[data-act]');
    if (!t2) return;
    const act = t2.dataset.act, key = t2.dataset.key;
    if (act === 'back') { mode = 'list'; curId = null; clearSearch(); rerenderNow(); }
    else if (act === 'chip') { takeCat = t2.dataset.cat; rerenderNow(); }
    else if (act === 'inc') changeLine(cust, key, 1);
    else if (act === 'dec') changeLine(cust, key, -1);
    else if (act === 'editqty') editQtyInline(t2, cust, key);
    else if (act === 'price') editPriceInline(t2, cust, key);
    else if (act === 'addkg' || act === 'editkg') editWeightInline(t2, cust, key);
    else if (act === 'editcust') openSheet(b => customerSheet(b, cust), { static: true });
    else if (act === 'prices') openSheet(b => pricesSheet(b, cust.id), { static: true });
    else if (act === 'history') openSheet(b => historySheet(b, cust.id));
    else if (act === 'standing') openSheet(b => standingSheet(b, cust), { static: true });
    else if (act === 'review') openSheet(b => reviewSheet(b, cust.id));
    else if (act === 'reorderlast') { const last = completedOrdersOf(cust.id)[0]; if (last) reorder(cust.id, last); }
  };
}

/* One product row on the take-order screen: name + the CUSTOMER tier
   price (tap to edit once a line exists) + stepper bound to order lines. */
function takeRow(p, line, cust) {
  const qty = line ? (Number(line.qty) || 0) : 0;
  const isKg = p.name.includes('/kg');
  let priceHtml;
  if (line) {
    priceHtml = (line.price === '' || line.price == null)
      ? `<span class="hdv-red" data-act="price" data-key="${esc(p.key)}">SET&nbsp;PRICE</span>`
      : `<span class="hdv-price" data-act="price" data-key="${esc(p.key)}">${money(Number(line.price))}</span>`;
  } else {
    const tp = defaultLinePrice(cust.id, p.key);
    priceHtml = `<span class="hdv-price dim">${typeof tp === 'number' ? money(tp) : '—'}</span>`;
  }
  const onSpecial = !!specialFor(p.key);
  const out = isOut(p.key);
  const srcTxt = line ? srcLabel(line.src) : '';   // once on the order, show where the price came from
  const sub = [p.cat, srcTxt || ((typeof p.sell === 'number' && p.sell > 0) ? 'shop ' + money(p.sell) : '')]
    .filter(Boolean).join(' · ');
  let badge = onSpecial
    ? ' <span class="hdv-tchip" style="background:#fdebd0;color:#b45309">SPECIAL</span>' : '';
  if (out) badge += ' <span class="hdv-tchip" style="background:rgba(185,28,28,.14);color:#b91c1c">OUT TODAY</span>';
  let stepper;
  if (isKg) {
    if (out && qty === 0) {
      stepper = '';
    } else if (qty > 0) {
      stepper = `<div class="hdv-step">
        <button class="hdv-sbtn" data-act="dec" data-key="${esc(p.key)}" aria-label="remove">&minus;</button>
        <span class="hdv-qty" data-act="editkg" data-key="${esc(p.key)}" style="cursor:pointer;text-decoration:underline dotted">${qty}kg</span>
        <button class="hdv-sbtn plus" data-act="addkg" data-key="${esc(p.key)}" aria-label="edit weight">kg</button>
      </div>`;
    } else {
      stepper = `<div class="hdv-step">
        <button class="hdv-sbtn plus" data-act="addkg" data-key="${esc(p.key)}" aria-label="add kg">+kg</button>
      </div>`;
    }
  } else {
    // Out + nothing on the order: no stepper (can't add). Out + qty>0: keep
    // the stepper so the line can still be reduced/removed. Qty is tap-to-type.
    stepper = (out && qty === 0) ? '' : qtyStepper(p.key, qty);
  }
  return `<div class="hdv-row${qty > 0 ? ' sel' : ''}">
    <div class="hdv-info">
      <div class="hdv-name">${esc(p.name)}${badge}</div>
      ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
    </div>
    ${priceHtml}
    ${stepper}
  </div>`;
}

/* ---- order-line mutations -------------------------------------------- */

function orderTotal(lines) {
  return (lines || []).reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
}

/* Price for a NEW line, in priority order:
   1) the price this customer paid for this item on their LAST order,
   2) their tier / locked (Price-Level) price,
   3) the shelf price (= EPOS retail, synced into the catalogue).
   Returns a number, or '' if none of the above is known. */
function lastOrderPrice(custId, key) {
  for (const o of completedOrdersOf(custId)) {            // most recent completed first
    const l = (o.lines || []).find(x => x && x.key === key && x.price !== '' && x.price != null);
    if (l) { const v = Number(l.price); if (isFinite(v)) return v; }
  }
  return null;
}
/* Resolve a line's price AND record WHERE it came from, so the row can show a
   trustworthy hint ('last $4.99' / 'tier' / 'shelf') and Review can flag blanks. */
function resolveLinePrice(custId, key) {
  const lp = lastOrderPrice(custId, key);
  if (typeof lp === 'number') return { price: lp, src: 'lastorder' };
  const tp = tierPrice(custId, key);
  if (typeof tp === 'number') return { price: tp, src: specialFor(key) ? 'special' : 'tier' };
  const p = catalog().find(x => x.key === key);
  if (p && typeof p.sell === 'number' && p.sell > 0) return { price: p.sell, src: 'shelf' };
  return { price: '', src: 'none' };
}
function defaultLinePrice(custId, key) {
  return resolveLinePrice(custId, key).price;
}
/* Short human label for where a line's price came from (shown on rows). */
function srcLabel(src) {
  return ({ lastorder: 'last paid', tier: 'tier price', special: 'special',
            shelf: 'shop price', manual: 'your price' })[src] || '';
}

/* +/- on a take-order row. Only calls ensureOpenOrder when actually
   adding, so just LOOKING at a customer never creates an empty order. */
function changeLine(cust, key, delta) {
  if (delta > 0 && isOut(key)) { toast('Out of stock today'); return; }
  let o = openOrderOf(cust.id);
  if (!o) {
    if (delta <= 0) return;
    o = ensureOpenOrder(cust.id);
  }
  if (!o) return;
  if (!Array.isArray(o.lines)) o.lines = [];

  const i = o.lines.findIndex(l => l.key === key);
  if (i >= 0) {
    o.lines[i].qty = (Number(o.lines[i].qty) || 0) + delta;
    if (o.lines[i].qty <= 0) o.lines.splice(i, 1);
  } else if (delta > 0) {
    const p = catalog().find(x => x.key === key);
    if (!p) return;
    const r = resolveLinePrice(cust.id, key);    // last-order price -> tier -> shelf (+ source)
    o.lines.push({
      key, name: p.name, sup: p.cat, unit: '',
      qty: delta,
      price: typeof r.price === 'number' ? r.price : '',   // '' until set
      src: r.src
    });
  } else {
    return;
  }
  saveOrder(o); // store mirrors + PATCH + bus 'change' -> reactive re-render
}

/* Tap a line price -> inline number input; commit => src:'manual'. */
function editPriceInline(elm, cust, key) {
  const o = openOrderOf(cust.id);
  const line = o && Array.isArray(o.lines) && o.lines.find(l => l.key === key);
  if (!line) { toast('Add the item first, then set its price'); return; }

  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = '0.01'; inp.min = '0'; inp.inputMode = 'decimal';
  inp.className = 'hdv-pin';
  inp.value = (line.price === '' || line.price == null) ? '' : Number(line.price);
  elm.replaceWith(inp);
  inp.focus(); inp.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = parseFloat(inp.value);
    if (isFinite(v) && v >= 0 &&
        (line.price === '' || line.price == null || v !== Number(line.price))) {
      line.price = Math.round(v * 100) / 100;
      line.src = 'manual';
      saveOrder(o);                       // emits 'change' -> re-render
    } else {
      rerenderNow(); refreshSheet();      // nothing changed; restore display
    }
  };
  inp.addEventListener('change', commit);
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
}

function editWeightInline(elm, cust, key) {
  const p = catalog().find(x => x.key === key);
  let o = openOrderOf(cust.id);
  let line = o && Array.isArray(o.lines) && o.lines.find(l => l.key === key);
  if (!line) {
    // First add: create the line
    if (isOut(key)) { toast('Out of stock today'); return; }
    o = ensureOpenOrder(cust.id);
    if (!o) return;
    if (!Array.isArray(o.lines)) o.lines = [];
    const r = resolveLinePrice(cust.id, key);
    line = { key, name: p ? p.name : key, sup: p ? p.cat : '', unit: 'kg', qty: 0,
      price: typeof r.price === 'number' ? r.price : '', src: r.src };
    o.lines.push(line);
  }

  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = '0.01'; inp.min = '0'; inp.inputMode = 'decimal';
  inp.className = 'hdv-pin';
  inp.value = Number(line.qty) || '';
  inp.placeholder = 'kg';
  elm.replaceWith(inp);
  inp.focus(); inp.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = parseFloat(inp.value);
    if (isFinite(v) && v > 0) {
      line.qty = Math.round(v * 1000) / 1000;
      line.unit = 'kg';
      saveOrder(o);
    } else if (!(isFinite(v) && v > 0) && line.qty <= 0) {
      // No weight entered and line was new — remove it
      o.lines = o.lines.filter(l => l.key !== key);
      saveOrder(o);
    } else {
      rerenderNow();
    }
  };
  inp.addEventListener('change', commit);
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
}

/* Tap a quantity number -> inline input so you can TYPE it directly (e.g. 100.5)
   instead of only +/-. Mirrors editWeightInline but keeps the item's own unit. */
function editQtyInline(elm, cust, key) {
  const p = catalog().find(x => x.key === key);
  let o = openOrderOf(cust.id);
  let line = o && Array.isArray(o.lines) && o.lines.find(l => l.key === key);
  if (!line) {
    if (isOut(key)) { toast('Out of stock today'); return; }
    o = ensureOpenOrder(cust.id);
    if (!o) return;
    if (!Array.isArray(o.lines)) o.lines = [];
    const r = resolveLinePrice(cust.id, key);
    line = { key, name: p ? p.name : key, sup: p ? p.cat : '', unit: '', qty: 0,
      price: typeof r.price === 'number' ? r.price : '', src: r.src };
    o.lines.push(line);
  }
  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = 'any'; inp.min = '0'; inp.inputMode = 'decimal';
  inp.className = 'hdv-pin';
  inp.value = Number(line.qty) || '';
  elm.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const v = parseFloat(inp.value);
    if (isFinite(v) && v > 0) { line.qty = Math.round(v * 1000) / 1000; saveOrder(o); }
    else if (v === 0 || (Number(line.qty) || 0) <= 0) {           // 0, or blank on a new line -> remove
      o.lines = o.lines.filter(l => l.key !== key); saveOrder(o);
    } else { rerenderNow(); refreshSheet(); }                     // blank on existing -> restore
  };
  inp.addEventListener('change', commit);
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
}

/* Stepper whose qty number is tappable to type directly (whole units or decimals). */
function qtyStepper(key, qty) {
  return `<div class="hdv-step">
    <button class="hdv-sbtn" data-act="dec" data-key="${esc(key)}" aria-label="less">&minus;</button>
    <span class="hdv-qty" data-act="editqty" data-key="${esc(key)}" title="tap to type"
      style="cursor:pointer;text-decoration:underline dotted">${qty}</span>
    <button class="hdv-sbtn plus" data-act="inc" data-key="${esc(key)}" aria-label="more">+</button>
  </div>`;
}

/* The right stepper for an order line: tap-to-type weight for /kg items, else qty. */
function lineStepper(l, qty) {
  const isKg = String(l.name || '').includes('/kg') || l.unit === 'kg';
  if (isKg) {
    return `<div class="hdv-step">
      <button class="hdv-sbtn" data-act="dec" data-key="${esc(l.key)}" aria-label="less">&minus;</button>
      <span class="hdv-qty" data-act="editkg" data-key="${esc(l.key)}" title="tap to type kg"
        style="cursor:pointer;text-decoration:underline dotted">${qty}kg</span>
      <button class="hdv-sbtn plus" data-act="addkg" data-key="${esc(l.key)}" aria-label="weight">kg</button>
    </div>`;
  }
  return qtyStepper(l.key, qty);
}

/* ---- review sheet (lines, qty/price edit, Share, Complete) ------------ */

/* Focused price review: lists ONLY the lines that still need a price (e.g. new
   items, or a customer with no tier price for them) so the owner can set them
   all in one place. Saves each as a per-line manual price. */
function priceReviewSheet(custId) {
  return (body) => {
    const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
    const o = openOrderOf(custId);
    const need = (o && Array.isArray(o.lines) ? o.lines : []).filter(l => l.price === '' || l.price == null);
    if (!need.length) { closeSheet(); toast('All lines priced'); return; }
    body.innerHTML = `
      <div class="hdv-sheettitle">Set prices · ${esc(cust.name)}</div>
      <div class="hdv-sheetsub">${need.length} item${need.length === 1 ? '' : 's'} need a price for ${esc(cust.tierId || 'this customer')}</div>
      ${need.map(l => `<div class="hdv-row">
        <div class="hdv-info"><div class="hdv-name">${esc(l.name)}</div>
          <div class="hdv-sub">qty ${Number(l.qty) || 0}${l.unit ? ' ' + esc(l.unit) : ''}</div></div>
        <input class="hdv-in hdv-pinp" style="max-width:108px;margin:0" inputmode="decimal"
          placeholder="$ price" data-key="${esc(l.key)}">
      </div>`).join('')}
      <div class="hdv-actions">
        <button class="hdv-btnG slim" data-act="cancel">Close</button>
        <button class="hdv-btnG slim" data-act="saveall">Save</button>
        <button class="hdv-btnP" data-act="savepdf">Save &amp; share PDF</button>
      </div>`;
    const saveEntered = () => {
      const o2 = openOrderOf(custId);
      if (o2 && Array.isArray(o2.lines)) {
        body.querySelectorAll('.hdv-pinp').forEach(inp => {
          const v = parseFloat(inp.value);
          if (!isNaN(v) && v >= 0) {
            const line = o2.lines.find(x => x.key === inp.dataset.key);
            if (line) { line.price = Math.round(v * 100) / 100; line.src = 'manual'; }
          }
        });
        saveOrder(o2);
      }
      return o2;
    };
    body.onclick = e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      if (t.dataset.act === 'cancel') { closeSheet(); return; }
      if (t.dataset.act === 'saveall') { saveEntered(); toast('Prices saved'); closeSheet(); return; }
      if (t.dataset.act === 'savepdf') {
        const o2 = saveEntered();
        closeSheet();
        if (o2) shareInvoice(invoiceData(orderRef(o2), cust, o2))
          .then(s => { if (s === 'downloaded') toast('Invoice PDF saved'); })
          .catch(() => toast('Could not make the PDF'));
      }
    };
  };
}

/* Live Profit/Loss view for the order being built: editable cost per line,
   with total cost, total sell and profit tallied at the bottom (updates as you
   type). Edited costs are saved on the order line (l.cost), default to the
   catalogue cost. */
function plSheet(custId) {
  return (body) => {
    const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
    const lineData = () => {
      const o = openOrderOf(custId);
      return (o && Array.isArray(o.lines)) ? o.lines : [];
    };
    const unitCost = (l) => {
      if (l.cost != null && l.cost !== '') return Number(l.cost) || 0;
      const c = costOf(l.key);
      return (typeof c === 'number' && isFinite(c)) ? c : 0;
    };

    /* Snapshot the P&L for the shareable PDF — reads the on-screen cost inputs
       (incl. unsaved edits) so the PDF matches exactly what's displayed. */
    const plData = () => {
      const o = openOrderOf(custId);
      const lines = (o && Array.isArray(o.lines)) ? o.lines : [];
      const domv = {};
      body.querySelectorAll('.hdv-cinp').forEach(inp => { domv[inp.dataset.key] = inp.value; });
      let tc = 0, ts = 0;
      const plLines = lines.map(l => {
        const qty = Number(l.qty) || 0, us = Number(l.price) || 0;
        const v = domv[l.key];
        const uc = (v !== undefined && v !== '') ? (parseFloat(v) || 0) : unitCost(l);
        tc += qty * uc; ts += qty * us;
        return { name: l.name, qty, unit: l.unit || '', cost: uc, sell: us };
      });
      const profit = ts - tc, pct = ts > 0 ? Math.round(profit / ts * 100) : 0;
      const r2 = (x) => Math.round(x * 100) / 100;
      return {
        biz: BIZ,
        customer: cust.name || '',
        date: niceDate((o && (o.deliveryDate || o.completed || o.date)) || todayStr()),
        orderRef: o ? orderRef(o) : '',
        lines: plLines,
        totals: { cost: r2(tc), sell: r2(ts), profit: r2(profit), pct }
      };
    };

    const recalc = () => {
      const byKey = {}; lineData().forEach(l => { if (l) byKey[l.key] = l; });
      let tc = 0, ts = 0;
      body.querySelectorAll('.hdv-cinp').forEach(inp => {
        const l = byKey[inp.dataset.key]; if (!l) return;
        const qty = Number(l.qty) || 0;
        tc += qty * (inp.value === '' ? 0 : (parseFloat(inp.value) || 0));
        ts += qty * (Number(l.price) || 0);
      });
      const prof = ts - tc, pct = ts > 0 ? Math.round(prof / ts * 100) : 0;
      const set = (id, v) => { const el = body.querySelector('#' + id); if (el) el.textContent = v; };
      set('pl-cost', money(tc)); set('pl-sell', money(ts));
      const pe = body.querySelector('#pl-profit');
      if (pe) { pe.textContent = `${money(prof)} · ${pct}%`; pe.style.color = prof < 0 ? 'var(--hdv-red)' : 'var(--hdv-green)'; }
    };

    const render = () => {
      const lines = lineData();
      let h = `<div class="hdv-sheettitle">Profit / Loss · ${esc(cust.name)}</div>
        <div class="hdv-sheetsub">Type each item's cost — totals tally live at the bottom</div>`;
      if (!lines.length) {
        h += emptyHTML('No lines on this order yet');
      } else {
        h += lines.map(l => {
          const qty = Number(l.qty) || 0, sell = Number(l.price) || 0, uc = unitCost(l);
          return `<div class="hdv-row">
            <div class="hdv-info">
              <div class="hdv-name">${esc(l.name)}</div>
              <div class="hdv-sub">${qty} × sell ${money(sell)} = ${money(qty * sell)}</div>
            </div>
            <label class="hdv-clab">cost $<input class="hdv-in hdv-cinp" inputmode="decimal"
              value="${uc ? uc : ''}" placeholder="?" data-key="${esc(l.key)}"></label>
          </div>`;
        }).join('');
        h += `<div class="hdv-total"><span>Total cost</span><span id="pl-cost">—</span></div>
          <div class="hdv-total"><span>Total sell</span><span id="pl-sell">—</span></div>
          <div class="hdv-total hdv-total-margin"><span>Profit</span><span id="pl-profit">—</span></div>`;
      }
      h += `<div class="hdv-actions">
        ${lines.length ? `<button class="hdv-btnG slim" data-act="sharepl">Share PDF</button>` : ''}
        <button class="hdv-btnP" data-act="done">Done</button>
      </div>`;
      body.innerHTML = h;
      recalc();
    };

    render();
    body.oninput = e => { if (e.target.closest('.hdv-cinp')) recalc(); };
    body.onchange = e => {
      const inp = e.target.closest('.hdv-cinp'); if (!inp) return;
      const o = openOrderOf(custId);
      const l = (o.lines || []).find(x => x.key === inp.dataset.key);
      if (l) { l.cost = inp.value === '' ? '' : Math.round((parseFloat(inp.value) || 0) * 100) / 100; saveOrder(o); }
    };
    body.onclick = e => {
      const t = e.target.closest('[data-act]'); if (!t) return;
      if (t.dataset.act === 'done') { closeSheet(); return; }
      if (t.dataset.act === 'sharepl') {
        const d = plData();
        if (!d.lines.length) { toast('No lines to share'); return; }
        sharePL(d).then(s => { if (s === 'downloaded') toast('P&L PDF saved'); })
          .catch(() => toast('Could not make the PDF'));
      }
    };
  };
}

/* Packing checklist: tap each line to tick it off as it goes in the box.
   Packed state is saved on the line (l.packed) so it survives reopening, and
   resets when a fresh order is created. */
/* ---- packing: who/when stamps + fulfilment state (brief 2026-06-20) ---------
   packState is SEPARATE from o.status (open/completed/cancelled) so nothing breaks:
   'packed' once Finish pack is tapped, 'packing' once Start pack is, else 'unpacked'. */
function whoami() {
  const u = auth && auth.user && auth.user();
  return (u && u.email) ? String(u.email).split('@')[0] : 'staff';
}
function packState(o) {
  if (!o) return 'unpacked';
  if (o.packedAt) return 'packed';
  if (o.packStartedAt) return 'packing';
  return 'unpacked';
}
function packStamp(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return String(iso).slice(0, 16); }
}
function packBtnLabel(o) {
  const st = packState(o);
  if (st === 'packed') return '📦 Packed ✓';
  if (st === 'packing') return '📦 ' + packLabel(o);   // e.g. "📦 3/8 packed"
  return '📦 Start pack';
}

/* ---- Shared order tracking (mirrors the V4 dashboard: Ordered → Packed → Delivered → Emailed → Paid,
   stored on o.track = {stage:{at,by}}), kept in sync with v3's own o.packedAt / o.paid so BOTH apps agree.
   Tapping a step in either app shows in the other. "Emailed" auto-ticks from V4's email-invoice helper. ---- */
const TRK = [['packed', 'Packed'], ['delivered', 'Delivered'], ['emailed', 'Emailed'], ['paid', 'Paid']];
function trkNow() { const d = new Date(), p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function trkDone(o, k) {
  if (k === 'packed') return !!((o.track && o.track.packed) || o.packedAt);
  if (k === 'paid') return !!((o.track && o.track.paid) || o.paid);
  return !!(o.track && o.track[k]);
}
function trkAt(o, k) {
  if (o.track && o.track[k] && o.track[k].at) return o.track[k].at;
  if (k === 'packed' && o.packedAt) return o.packedAt;
  if (k === 'paid' && o.paid) return o.paid;
  return '';
}
function trkSet(o, k, on) {
  o.track = o.track || {};
  if (on) o.track[k] = { at: trkNow(), by: whoami() }; else delete o.track[k];
  if (k === 'packed') { if (on) { o.packedAt = o.packedAt || todayStr(); o.packedBy = o.packedBy || whoami(); } else { o.packedAt = ''; } }
  if (k === 'paid') { o.paid = on ? (o.paid || todayStr()) : ''; }
  saveOrder(o);
}
function paidProofDone(o) { return !!(o.paid && o.remittance); }   // "Completed" only once PAID + a payment proof image
function trackerHtml3(o) {
  const steps = [{ k: '', label: 'Ordered', done: true, at: o.completed || o.date || '' }]
    .concat(TRK.map(s => ({ k: s[0], label: s[1], done: trkDone(o, s[0]), at: trkAt(o, s[0]) })));
  const dots = steps.map((s, i) => {
    const col = s.done ? 'var(--hdv-green)' : '#d8e0db', tc = s.done ? '#fff' : '#8a958f';
    return `<div style="flex:1;text-align:center;min-width:52px">
      <div ${s.k ? `data-trk="${s.k}"` : ''} style="width:30px;height:30px;line-height:30px;border-radius:50%;margin:0 auto;background:${col};color:${tc};font-weight:800;font-size:13px;${s.k ? 'cursor:pointer' : ''}">${s.done ? '✓' : (i + 1)}</div>
      <div style="font-size:10.5px;font-weight:700;margin-top:3px">${s.label}</div>
      <div style="font-size:9px;color:var(--hdv-mut)">${s.done && s.at ? esc(packStamp(s.at) || s.at) : ''}</div></div>`;
  }).join('<div style="flex:0 0 7px;height:2px;background:#e2e8e4;margin-top:15px"></div>');
  return `<div style="display:flex;align-items:flex-start;margin:10px 0 2px;border:1px solid var(--hdv-line);border-radius:12px;padding:12px 8px">${dots}</div>
    <div class="hdv-sub" style="text-align:center;color:var(--hdv-mut);font-size:10px;margin:0 0 4px">Tap a step to mark it — saves instantly &amp; shows on the dashboard too</div>`;
}
/* Attach a delivery-proof photo (signed invoice / dropped-off goods) — same shape V4 reads (o.podSigned). */
function attachPod(o) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height; const max = 1100;
        if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        try { o.podSigned = cv.toDataURL('image/jpeg', 0.6); } catch (e) { toast('Could not read that image'); return; }
        o.podSignedAt = todayStr();
        if (!trkDone(o, 'delivered')) trkSet(o, 'delivered', true); else saveOrder(o);   // proof of delivery -> mark delivered
        toast('Delivery proof attached'); refreshSheet();
      };
      img.onerror = () => toast('Could not read that image');
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };
  inp.click();
}
function podViewer(o) {
  return (body) => {
    const src = o.podSigned || o.podGoods;
    body.innerHTML = `<div class="hdv-sheettitle">Delivery proof</div>
      <div class="hdv-sheetsub">${o.podSignedAt ? 'attached ' + esc(niceDate(o.podSignedAt)) : ''}</div>
      <img src="${src}" alt="delivery proof" style="width:100%;border-radius:10px;border:1px solid var(--hdv-line)">
      <div class="hdv-actions">
        <button class="hdv-btnG slim" data-act="repod">Replace</button>
        <button class="hdv-btnG slim danger" data-act="delpod">Remove</button>
        <button class="hdv-btnP" data-act="pclose">Close</button>
      </div>`;
    body.onclick = e => {
      const t = e.target.closest('[data-act]'); if (!t) return;
      if (t.dataset.act === 'repod') { closeSheet(); attachPod(o); }
      else if (t.dataset.act === 'delpod') { o.podSigned = ''; o.podSignedAt = ''; saveOrder(o); toast('Removed'); closeSheet(); }
      else if (t.dataset.act === 'pclose') closeSheet();
    };
  };
}

function packSheet(custId, orderId) {
  return (body) => {
    const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
    // Works on the open order by default, or a specific (e.g. just-placed) order by id.
    const orderOf = () => orderId
      ? (asList(orders()).find(o => o && o.id === orderId) || null)
      : openOrderOf(custId);
    const lineData = () => { const o = orderOf(); return (o && Array.isArray(o.lines)) ? o.lines : []; };

    const updateProg = () => {
      const lines = lineData(), all = lines.length, done = lines.filter(l => l && l.packed).length;
      const cnt = body.querySelector('#pack-count'); if (cnt) cnt.textContent = `${done} / ${all} packed`;
      const bar = body.querySelector('#pack-bar'); if (bar) bar.style.width = (all ? Math.round(done / all * 100) : 0) + '%';
      const lbl = body.querySelector('#pack-alllbl'); if (lbl) lbl.style.display = (all && done === all) ? '' : 'none';
    };

    const render = () => {
      const lines = lineData(), all = lines.length;
      let h = `<div class="hdv-sheettitle">Packing · ${esc(cust.name)}</div>
        <div class="hdv-sheetsub">Tap a row to tick it off${(orderOf() || {}).packStartedAt ? ' · started by ' + esc((orderOf() || {}).packStartedBy || '?') + ' · ' + esc(packStamp((orderOf() || {}).packStartedAt)) : ''}</div>
        <div class="hdv-packprog"><span id="pack-count"></span><span id="pack-alllbl" class="hdv-packdone-lbl">✓ all packed</span></div>
        <div class="hdv-packbar"><div id="pack-bar" class="hdv-packbar-fill" style="width:0%"></div></div>`;
      h += noteBanner((orderOf() || {}).comment);
      if (!all) {
        h += emptyHTML('No lines on this order yet');
      } else {
        h += lines.map(l => {
          const qty = Number(l.qty) || 0;
          const isKg = String(l.name || '').includes('/kg') || l.unit === 'kg';
          return `<div class="hdv-pack-row${l.packed ? ' hdv-pack-done' : ''}" data-key="${esc(l.key)}">
            <div class="hdv-pack-tick">${l.packed ? '✓' : ''}</div>
            <div class="hdv-pack-qty">${qty}${l.unit ? '<span class="hdv-pack-unit"> ' + esc(l.unit) + '</span>' : ''}</div>
            <div class="hdv-pack-name">${esc(l.name)}${l.note ? `<div class="hdv-who" style="font-weight:600">📝 ${esc(l.note)}</div>` : ''}${l.subNote ? `<div class="hdv-who" style="color:var(--hdv-amber);font-weight:700">⚠ ${esc(l.subNote)}</div>` : ''}</div>
            <button class="hdv-btnG slim" data-act="sub" data-key="${esc(l.key)}" style="flex:0 0 auto;margin-left:6px;padding:6px 9px" title="short / substituted">⚠</button>
            ${isKg ? `<button class="hdv-btnG slim" data-act="weigh" data-key="${esc(l.key)}" style="flex:0 0 auto;margin-left:6px;padding:6px 9px">⚖ kg</button>` : ''}
          </div>`;
        }).join('');
      }
      h += `<div class="hdv-actions">
        ${all ? `<button class="hdv-btnG slim" data-act="reset">Untick all</button>` : ''}
        <button class="hdv-btnG slim" data-act="done">Close</button>
        ${all ? `<button class="hdv-btnP" data-act="finish">${(orderOf() || {}).packedAt ? 'Re-finish ✓' : 'Finish pack'}</button>` : ''}
      </div>`;
      body.innerHTML = h;
      updateProg();
    };
    render();

    body.onclick = e => {
      const t = e.target.closest('[data-act]');
      if (t) {
        if (t.dataset.act === 'done') { closeSheet(); return; }
        if (t.dataset.act === 'reset') {
          const o = orderOf(); if (o) { (o.lines || []).forEach(l => { if (l) l.packed = false; }); saveOrder(o); }
          render(); return;
        }
        if (t.dataset.act === 'weigh') {                 // enter the ACTUAL packed weight -> reprices in place
          const o = orderOf();
          const l = o && (o.lines || []).find(x => x.key === t.dataset.key); if (!l) return;
          const inp = document.createElement('input');
          inp.type = 'number'; inp.step = '0.001'; inp.min = '0'; inp.inputMode = 'decimal';
          inp.className = 'hdv-in'; inp.style.width = '84px'; inp.value = Number(l.qty) || ''; inp.placeholder = 'kg';
          t.replaceWith(inp); inp.focus(); inp.select();
          let dn = false;
          const commit = () => {
            if (dn) return; dn = true;
            const v = parseFloat(inp.value);
            if (isFinite(v) && v > 0) { l.qty = Math.round(v * 1000) / 1000; l.unit = 'kg'; l.packed = true; saveOrder(o); }
            render();
          };
          inp.addEventListener('change', commit);
          inp.addEventListener('blur', commit);
          inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
          return;
        }
        if (t.dataset.act === 'sub') {                    // mark a line short / substituted + note
          const o = orderOf();
          const l = o && (o.lines || []).find(x => x.key === t.dataset.key); if (!l) return;
          const note = window.prompt('Short or substituted — quick note (e.g. "only 2, out of stock" / "swapped for cos"). Blank to clear.', l.subNote || '');
          if (note === null) return;
          if (note.trim()) { l.subNote = note.trim(); l.short = true; } else { delete l.subNote; delete l.short; }
          saveOrder(o); render(); return;
        }
        if (t.dataset.act === 'finish') {                 // Finish pack -> stamp who/when, update P badge + v4
          const o = orderOf(); if (!o) return;
          o.packedAt = new Date().toISOString(); o.packedBy = whoami();
          if (!o.packStartedAt) { o.packStartedAt = o.packedAt; o.packStartedBy = o.packedBy; }
          if (!o.packingDate) o.packingDate = todayStr();
          saveOrder(o);
          toast('Packed ✓ by ' + o.packedBy);
          closeSheet(); refreshSheet(); return;
        }
        return;
      }
      const row = e.target.closest('.hdv-pack-row'); if (!row) return;
      const o = orderOf();
      const l = o && (o.lines || []).find(x => x.key === row.dataset.key);
      if (!l) return;
      l.packed = !l.packed; saveOrder(o);
      row.classList.toggle('hdv-pack-done', !!l.packed);
      const tk = row.querySelector('.hdv-pack-tick'); if (tk) tk.textContent = l.packed ? '✓' : '';
      updateProg();
    };
  };
}

/* ===== Edit an order — view + edit every line / dates / note (matches the v4
   dashboard's order editor). Writes the SAME /custorders record (no duplicate):
   saveOrder does a WHOLE-CHILD PATCH, so we read-modify-write the LIVE mirror
   order object and only touch edited fields — preserving v4-only fields
   (track / payment / remittance / dueDate). A price edit here touches ONLY this
   order's line (never the customer price list / tiers / catalogue). ============ */
function orderById(orderId) {
  return asList(orders()).find(o => o && o.id === orderId) || null;
}

function orderEditSheet(orderId) {
  // working copy — seeded once, survives our own draw() repaints so typing isn't wiped.
  // Opened {static:true} so external store 'change' events never wipe the form; ALL
  // repaints go through draw() (refreshSheet is a no-op on static sheets).
  let L = null, comment = '', oDate = '', pDate = '', dDate = '', confirm = false, _body = null;
  const seed = (o) => {
    L = (Array.isArray(o.lines) ? o.lines : []).map(l => ({
      ...l,                                    // keep every existing line field (note/cost/packed/… + future)
      name: l.name || l.product || '', unit: l.unit || '',
      qty: Number(l.qty) || 0,
      price: (l.price === '' || l.price == null) ? '' : (Number(l.price) || 0)
    }));
    if (!L.length) L.push({ name: '', qty: 1, unit: '', price: '' });
    comment = o.comment || ''; oDate = o.date || ''; pDate = o.packingDate || ''; dDate = o.deliveryDate || '';
  };
  const kept = () => L.filter(l => String(l.name || '').trim() !== '');
  const total = () => kept().reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

  const draw = () => {
    const body = _body; if (!body) return;
    const o = orderById(orderId);
    if (!o) { body.innerHTML = emptyHTML('Order not found'); return; }
    if (L === null) seed(o);
    const cust = asList(customers()).find(c => c && c.id === o.custId) || { name: o.business || '—' };
    const tot = total();

    let h = `<div class="hdv-sheettitle">Edit order · ${esc(cust.name || '—')}</div>
      <div class="hdv-sheetsub">${esc(o.orderNo || orderRef(o))} · ${o.status === 'completed' ? 'placed' : 'open'} order — changes save to the same record (the dashboard sees them too)</div>`;

    h += L.map((l, i) => `<div class="hdv-row" style="align-items:flex-start">
      <div class="hdv-info" style="flex:1">
        <input class="hdv-in" data-lf="name" data-i="${i}" value="${esc(l.name)}" placeholder="item name" style="width:100%;margin:0 0 4px">
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          <input class="hdv-in" data-lf="qty" data-i="${i}" type="number" inputmode="decimal" min="0" value="${l.qty}" style="width:54px;margin:0" aria-label="quantity">
          <input class="hdv-in" data-lf="unit" data-i="${i}" value="${esc(l.unit)}" placeholder="unit" style="width:56px;margin:0" aria-label="unit">
          <span class="hdv-sub">@</span>
          <input class="hdv-in" data-lf="price" data-i="${i}" type="number" inputmode="decimal" min="0" value="${l.price}" placeholder="$" style="width:70px;margin:0" aria-label="price">
          <span class="hdv-sub" data-amt="${i}">${money((Number(l.qty) || 0) * (Number(l.price) || 0)) || '$0.00'}</span>
          <button data-erm="${i}" aria-label="remove line" style="margin-left:auto;background:none;border:0;color:#b91c1c;font-weight:800;font-size:18px;line-height:1;cursor:pointer">&times;</button>
        </div>
      </div>
    </div>`).join('');

    h += `<button class="hdv-btnG slim" data-act="eadd" style="margin:6px 0">+ add line</button>`;

    h += `<div class="hdv-sub" style="margin-top:8px;font-weight:700">Order note</div>
      <input class="hdv-in" data-of="comment" value="${esc(comment)}" placeholder="note for this order" style="width:100%;margin:2px 0 8px">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <label class="hdv-sub">Received<br><input class="hdv-in" data-of="date" type="date" value="${esc(oDate)}" style="margin:2px 0 0"></label>
        <label class="hdv-sub">Packing<br><input class="hdv-in" data-of="packingDate" type="date" value="${esc(pDate)}" style="margin:2px 0 0"></label>
        <label class="hdv-sub">Delivery<br><input class="hdv-in" data-of="deliveryDate" type="date" value="${esc(dDate)}" style="margin:2px 0 0"></label>
      </div>`;
    if (pDate && dDate && dDate < pDate) h += `<div class="hdv-sub" style="color:var(--hdv-amber);margin-top:5px">⚠ delivery date is before packing date</div>`;
    h += `<button class="hdv-btnG slim" data-act="edclr" style="margin:6px 0">Clear packing + delivery</button>`;

    h += `<div class="hdv-total"><span>Order total</span><span id="eTot" class="js-etot">${money(tot)}</span></div>`;
    if (!confirm) {
      h += `<div class="hdv-actions">
        <button class="hdv-btnG slim" data-act="ecancel">Cancel</button>
        <button class="hdv-btnP" data-act="econfirm">Save changes</button>
      </div>`;
    } else {
      h += `<div class="hdv-sheetsub" style="margin-top:6px">Save this order — new total <b class="js-etot">${money(tot)}</b>?</div>
        <div class="hdv-actions">
          <button class="hdv-btnG slim" data-act="ekeep">Keep editing</button>
          <button class="hdv-btnP" data-act="esave">Save · <span class="js-etot">${money(tot)}</span></button>
        </div>`;
    }
    body.innerHTML = h;

    body.oninput = e => {
      const t = e.target, d = t.dataset || {};
      if (d.lf != null) {
        const i = +d.i, f = d.lf;
        if (f === 'qty') L[i].qty = (t.value === '' ? 0 : Math.max(0, Number(t.value) || 0));
        else if (f === 'price') { L[i].price = (t.value === '' ? '' : Math.max(0, Number(t.value) || 0)); L[i].src = 'manual'; }
        else L[i][f] = t.value;
        const amt = body.querySelector(`[data-amt="${i}"]`);
        if (amt) amt.textContent = money((Number(L[i].qty) || 0) * (Number(L[i].price) || 0)) || '$0.00';
        body.querySelectorAll('.js-etot').forEach(el => el.textContent = money(total()));   // keep every total display live
      } else if (d.of != null) {
        if (d.of === 'comment') comment = t.value;
        else if (d.of === 'date') oDate = t.value;
        else if (d.of === 'packingDate') pDate = t.value;
        else if (d.of === 'deliveryDate') dDate = t.value;
      }
    };
    body.onclick = e => {
      const t = e.target.closest('[data-act],[data-erm]');
      if (!t) return;
      if (t.dataset.erm != null) {
        L.splice(+t.dataset.erm, 1);
        if (!L.length) L.push({ name: '', qty: 1, unit: '', price: '' });
        confirm = false; draw(); return;
      }
      const act = t.dataset.act;
      if (act === 'eadd') { L.push({ name: '', qty: 1, unit: '', price: '' }); confirm = false; draw(); }
      else if (act === 'edclr') { pDate = ''; dDate = ''; confirm = false; draw(); }
      else if (act === 'ecancel') closeSheet();
      else if (act === 'econfirm') { confirm = true; draw(); }
      else if (act === 'ekeep') { confirm = false; draw(); }
      else if (act === 'esave') applyOrderEdits(orderId, { L, comment, oDate, pDate, dDate });
    };
  };

  return (body) => { _body = body; draw(); };
}

function applyOrderEdits(orderId, ed) {
  const o = orderById(orderId);   // re-resolve the LIVE object at save time (no stale clone)
  if (!o) { toast('Order no longer exists'); closeSheet(); return; }
  // rebuild kept lines (drop blank-name rows, like v4); resolve a catalogue key for
  // hand-typed lines so Buy Run / till / cost still work.
  o.lines = ed.L.filter(l => String(l.name || '').trim() !== '').map(l => {
    const name = String(l.name).trim();
    let key = l.key, sup = l.sup;
    // resolve / re-resolve the catalogue key (exact-then-fuzzy, the same matcher as Import)
    // so Buy Run / till / cost still work — and a renamed line never keeps a stale key.
    const ok = key && catalog().some(x => x.key === key && x.name === name);
    if (!ok) { const hit = matchProduct(name); key = hit ? hit.key : undefined; if (hit) sup = hit.cat || hit.sup || sup; }
    const line = {
      ...l,                                    // keep every other line field (note/cost/packed/… + future)
      name, unit: l.unit || '',
      qty: Math.max(0, Number(l.qty) || 0),
      price: (l.price === '' || l.price == null) ? '' : Math.max(0, Number(l.price) || 0),
      src: l.src || 'manual'
    };
    if (key) line.key = key; else delete line.key;
    if (sup != null) line.sup = sup;
    return line;
  });
  o.total = Math.round(orderTotal(o.lines) * 100) / 100;   // keep the shared record's total fresh (v4 reads o.total)
  o.comment = ed.comment || '';
  if (ed.oDate) o.date = ed.oDate;            // received date — never blanked (match v4)
  o.packingDate = ed.pDate || null;           // blank clears
  o.deliveryDate = ed.dDate || null;          // blank clears
  o.editedAt = todayStr(); o.editedBy = whoami();
  o.v4editedBy = whoami();                     // so the v4 dashboard's "edited by" shows it too
  saveOrder(o);                                // whole-child PATCH /custorders — same id, NO duplicate
  toast('Order updated · ' + money(orderTotal(o.lines)));
  closeSheet();
}

function reviewSheet(body, custId) {
  const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
  const o = openOrderOf(custId);
  const lines = o && Array.isArray(o.lines) ? o.lines : [];
  const total = orderTotal(lines);
  const needPrice = lines.some(l => l.price === '' || l.price == null);
  const run = runById(cust.runId);
  const di = run ? deliveryInfo(run) : null;
  const delDate = di ? di.date : null;

  let h = `<div class="hdv-sheettitle">${esc(cust.name)}</div>
    <div class="hdv-sheetsub">${delDate ? 'For delivery ' + esc(niceDate(delDate)) : 'Open order · ' + esc((o && o.date) || todayStr())}</div>`;
  if (o && o.comment) h += noteBanner(o.comment);

  const tqStatus = o ? tillQueueStatus(o.id) : null;
  const hasCosts = secureLoaded();

  if (!lines.length) {
    h += emptyHTML('No lines on this order yet');
  } else {
    let totalCost = 0, totalSell = 0, belowCost = 0, lossSum = 0;
    h += lines.map(l => {
      const lq = Number(l.qty) || 0;
      const lSell = lq * (Number(l.price) || 0);
      const priceHtml = (l.price === '' || l.price == null)
        ? `<span class="hdv-red" data-act="price" data-key="${esc(l.key)}">SET&nbsp;PRICE</span>`
        : `<span class="hdv-price" data-act="price" data-key="${esc(l.key)}">${money(Number(l.price))}</span>`;
      let marginHtml = '';
      if (hasCosts) {
        const cost = costOf(l.key);
        if (cost != null && cost > 0 && l.price != null && l.price !== '') {
          const lCost = lq * cost;
          const margin = lSell - lCost;
          const pct = lSell > 0 ? Math.round((margin / lSell) * 100) : 0;
          totalCost += lCost;
          totalSell += lSell;
          const loss = margin < 0;                              // margin gate: priced BELOW cost
          if (loss) { belowCost++; lossSum += -margin; }
          marginHtml = `<div class="hdv-margin ${loss ? 'hdv-margin-loss' : (pct < 20 ? 'hdv-margin-low' : '')}">${loss ? '⚠ BELOW COST · ' : ''}${pct}% · ${money(margin)}</div>`;
        } else {
          totalSell += lSell;
        }
      }
      return `<div class="hdv-row">
        <div class="hdv-info">
          <div class="hdv-name">${esc(l.name)}</div>
          <div class="hdv-sub">${srcLabel(l.src) || 'price'} · line ${money(lSell)}</div>
          ${marginHtml}
          ${lineNote(l)}
        </div>
        ${priceHtml}
        ${lineStepper(l, lq)}
      </div>`;
    }).join('');
    h += `<div class="hdv-total"><span>Total</span><span>${money(total)}</span></div>`;
    if (hasCosts && totalCost > 0 && totalSell > 0) {
      const totalMargin = totalSell - totalCost;
      const totalPct = Math.round((totalMargin / totalSell) * 100);
      h += `<div class="hdv-total hdv-total-margin"><span>Margin</span><span>${totalPct}% · ${money(totalMargin)}</span></div>`;
    }
    if (cust.minOrder && total < Number(cust.minOrder)) {
      h += `<div class="hdv-err">Below minimum order ${money(Number(cust.minOrder))} — short ${money(Number(cust.minOrder) - total)}</div>`;
    }
    if (needPrice) {
      const nNeed = lines.filter(l => l.price === '' || l.price == null).length;
      h += `<button class="hdv-pricebanner" data-act="reviewprices">⚠ ${nNeed} item${nNeed === 1 ? '' : 's'} need a price — tap to set them</button>`;
    }
    if (hasCosts && belowCost > 0) {   // margin gate — never sell at a loss unawares
      h += `<div class="hdv-err" style="background:rgba(185,28,28,.12);border-radius:10px;padding:10px 12px;font-weight:800">⚠ ${belowCost} item${belowCost === 1 ? '' : 's'} priced BELOW COST — you'd lose ${money(lossSum)}. Tap a price to fix.</div>`;
    }

    // Till queue status badge
    if (tqStatus) {
      const statusLabel = { queued: 'Queued for till', sent: 'Sent to till', error: 'Till error' }[tqStatus.status] || tqStatus.status;
      const statusCls = tqStatus.status === 'error' ? 'hdv-tq-error' : tqStatus.status === 'sent' ? 'hdv-tq-sent' : 'hdv-tq-queued';
      h += `<div class="hdv-tq-status ${statusCls}">${statusLabel}${tqStatus.error ? ' — ' + esc(tqStatus.error) : ''}</div>`;
    }

    const packedN = lines.filter(l => l && l.packed).length;
    const nNeed = lines.filter(l => l.price === '' || l.price == null).length;
    // Price-gate: can't place (or send to till) with a $0/blank line — set them first.
    const cta = nNeed
      ? `<button class="hdv-btnP" data-act="reviewprices">Set ${nNeed} price${nNeed === 1 ? '' : 's'} first</button>`
      : (hasCosts && belowCost > 0)
        ? `<button class="hdv-btnP" data-act="complete" style="background:var(--hdv-amber)">Place anyway · ${belowCost} below cost</button>`
        : `<button class="hdv-btnP" data-act="complete">Done — place order</button>`;
    h += `<div class="hdv-actions">
      <button class="hdv-btnB" data-act="pack">📦 Pack${packedN ? ` · ${packedN}/${lines.length}` : ''}</button>
      <button class="hdv-btnG slim" data-act="share">Text</button>
      <button class="hdv-btnG slim" data-act="invpdf">Invoice PDF</button>
      <button class="hdv-btnG slim" data-act="orderform">Order form</button>
      <button class="hdv-btnG slim" data-act="note">📝 Note</button>
      ${customerId() ? '' : '<button class="hdv-btnG slim" data-act="editorder">✏️ Edit</button>'}
      <button class="hdv-btnG slim" data-act="pl">P&amp;L</button>
      ${cta}
    </div>`;
  }

  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, key = t.dataset.key;
    const c = asList(customers()).find(x => x && x.id === custId) || { id: custId, name: '' };
    if (act === 'inc') changeLine(c, key, 1);
    else if (act === 'dec') changeLine(c, key, -1);
    else if (act === 'editqty') editQtyInline(t, c, key);
    else if (act === 'addkg' || act === 'editkg') editWeightInline(t, c, key);
    else if (act === 'price') editPriceInline(t, c, key);
    else if (act === 'share') shareText(orderText(c, openOrderOf(custId)));
    else if (act === 'note') editOrderNote(custId);
    else if (act === 'editorder') {
      const oo = openOrderOf(custId);
      if (oo) openSheet(orderEditSheet(oo.id), { static: true });
      else toast('No open order to edit');
    }
    else if (act === 'invpdf') {
      const o = openOrderOf(custId);
      if (!o || !(o.lines || []).length) { toast('No lines yet'); return; }
      const invNo = orderRef(o);
      shareInvoice(invoiceData(invNo, c, o)).then(s => {
        if (s === 'downloaded') toast('Invoice PDF saved');
      }).catch(() => toast('Could not make the PDF'));
    }
    else if (act === 'complete') completeOrder(custId);
    else if (act === 'orderform') { if (!openOrderForm(openOrderOf(custId), c)) toast('Allow pop-ups to open the order form'); }
    else if (act === 'pl') openSheet(plSheet(custId), { static: true });
    else if (act === 'pack') openSheet(packSheet(custId), { static: true });
    else if (act === 'reviewprices') openSheet(priceReviewSheet(custId), { static: true });
  };
}

function sendToTill(cust, order) {
  if (!order || !(order.lines || []).length) { toast('No lines to send'); return; }
  const rec = queueForTill(order, cust.name, cust.eposId || null);
  toast('Queued for till · ' + money(rec.total));
  refreshSheet();
}

function completeOrder(custId) {
  const o = openOrderOf(custId);
  if (!o || !(o.lines || []).length) { toast('Nothing to complete'); return; }
  const cust = asList(customers()).find(c => c && c.id === custId) || {};
  const run = runById(cust.runId);
  const di = run ? deliveryInfo(run) : null;
  const delDate = di ? di.date : todayStr();
  o.status = 'completed';            // 'open' | 'completed' (kept compatible with the classic app)
  o.completed = todayStr();
  o.placedAt = Date.now();
  o.deliveryDate = o.deliveryDate || delDate;   // keep a delivery date the editor set; else default from the run
  o.runId = cust.runId || '';
  if (!o.orderNo) o.orderNo = makeOrderNo(delDate);
  saveOrder(o);                      // patches /custorders, emits 'change'
  mode = 'list'; curId = null; clearSearch();
  rerenderNow();
  // Confirmation sheet — and the ONLY place "Send to till" now lives (post-Done).
  openSheet(b => placedConfirmSheet(b, custId, o.id));
}

/* Shown right after Done. Confirms the placed order and offers the optional,
   deliberate "Send to till" (the only till action in the whole flow now).
   Re-pack and invoice are reachable here too. */
function placedConfirmSheet(body, custId, orderId) {
  const render = () => {
    const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
    const o = asList(orders()).find(x => x && x.id === orderId);
    if (!o) { body.innerHTML = emptyHTML('Order not found'); return; }
    const lines = o.lines || [];
    const total = orderTotal(lines);
    const all = lines.length, packed = lines.filter(l => l && l.packed).length;
    const tq = tillQueueStatus(o.id);
    let h = `<div class="hdv-sheettitle">✓ Order ${esc(o.orderNo || orderRef(o))} placed</div>
      <div class="hdv-sheetsub">${esc(cust.name)} · ${money(total)}${o.deliveryDate ? ' · deliver ' + esc(niceDate(o.deliveryDate)) : ''}</div>
      <div class="hdv-kv"><span class="hdv-mut">Items</span><b>${all}${all ? ` · ${packed}/${all} packed` : ''}</b></div>`;
    if (tq) {
      const lbl = { queued: 'Queued for till', sent: 'Sent to till ✓', error: 'Till error' }[tq.status] || tq.status;
      const cls = tq.status === 'error' ? 'hdv-tq-error' : tq.status === 'sent' ? 'hdv-tq-sent' : 'hdv-tq-queued';
      h += `<div class="hdv-tq-status ${cls}">${lbl}${tq.error ? ' — ' + esc(tq.error) : ''}</div>`;
    }
    const showSend = !tq || tq.status === 'error';   // hide once queued/sent
    h += `<div class="hdv-actions">
      <button class="hdv-btnG slim" data-act="pack">📦 ${all && packed === all ? 'Re-pack' : 'Pack'}</button>
      <button class="hdv-btnG slim" data-act="invpdf">Invoice PDF</button>
      ${showSend ? `<button class="hdv-btnB" data-act="sendtill">Send to till</button>` : ''}
      <button class="hdv-btnP" data-act="close">Done</button>
    </div>`;
    body.innerHTML = h;
  };
  render();
  body.onclick = e => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '' };
    const o = asList(orders()).find(x => x && x.id === orderId);
    if (t.dataset.act === 'close') { closeSheet(); return; }
    if (t.dataset.act === 'sendtill') { if (o) { sendToTill(cust, o); render(); } return; }
    if (t.dataset.act === 'pack') { openSheet(packSheet(custId, orderId), { static: true }); return; }
    if (t.dataset.act === 'invpdf') {
      if (!o || !(o.lines || []).length) { toast('No lines'); return; }
      shareInvoice(invoiceData(orderRef(o), cust, o))
        .then(s => { if (s === 'downloaded') toast('Invoice PDF saved'); })
        .catch(() => toast('Could not make the PDF'));
      return;
    }
  };
}

/* Sortable order number: <deliveryYYYYMMDD>-#### (#### = that day's sequence). */
function makeOrderNo(delDate) {
  // Simple continuous 4-digit reference, starting at 0100 (owner 2026-06-13).
  // Ignores the old date-based refs (their digit run is far above 9999).
  let max = 99;
  for (const o of asList(orders())) {
    if (!o || !o.orderNo) continue;
    const n = parseInt(String(o.orderNo).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n >= 100 && n <= 9999) max = Math.max(max, n);
  }
  return String(max + 1).padStart(4, '0');
}

/* The reference shown for an order: its assigned number, or the next one as a
   provisional preview while the order is still open. */
function orderRef(o) {
  return (o && o.orderNo) ? o.orderNo : makeOrderNo(o && o.deliveryDate);
}

/* ---- order history + reorder ---------------------------------------- */

function completedOrdersOf(custId) {
  return asList(orders())
    .filter(o => o && o.custId === custId && o.status === 'completed')
    .sort((a, b) => (b.placedAt || 0) - (a.placedAt || 0) ||
      String(b.deliveryDate || b.completed || '').localeCompare(String(a.deliveryDate || a.completed || '')));
}

/* This customer's most-ordered products (their "order guide" / usuals),
   ranked by how often they've ordered each, then by total quantity. */
function usualsFor(custId, limit = 12) {
  const freq = new Map();
  for (const o of asList(orders())) {
    if (!o || o.custId !== custId || o.status !== 'completed') continue;
    for (const l of (o.lines || [])) {
      const f = freq.get(l.key) || { n: 0, qty: 0 };
      f.n += 1; f.qty += Number(l.qty) || 0; freq.set(l.key, f);
    }
  }
  const map = new Map(catalog().map(p => [p.key, p]));
  return Array.from(freq.entries())
    .sort((a, b) => b[1].n - a[1].n || b[1].qty - a[1].qty)
    .map(([k]) => map.get(k)).filter(Boolean).slice(0, limit);
}

function historySheet(body, custId) {
  const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
  const list = completedOrdersOf(custId);
  // editable date chips (received / packing / delivery) — save to the SHARED order, so V4 sees them
  const dchip = (lbl, f, o) => `<label style="font-size:10.5px;color:var(--hdv-mut);font-weight:700;line-height:1.1">${lbl}<br><input type="date" data-df="${f}" data-id="${esc(o.id)}" value="${esc(o[f] || '')}" style="font-size:12px;padding:4px 6px;border:1px solid var(--hdv-line,#dcdcdc);border-radius:6px;margin-top:2px"></label>`;
  let h = `<div class="hdv-sheettitle">Order history · ${esc(cust.name)}</div>`;
  if (!list.length) {
    h += emptyHTML('No past orders yet');
  } else {
    h += list.map(o => {
      const n = Array.isArray(o.lines) ? o.lines.length : 0;
      const tq = tillQueueStatus(o.id);
      const tqTxt = tq ? ' · ' + ({ queued: 'queued for till', sent: 'sent to till ✓', error: 'till error' }[tq.status] || tq.status) : '';
      return `<div class="hdv-row">
        <div class="hdv-info">
          <div class="hdv-name">${esc(o.orderNo || 'Order')} · ${money(orderTotal(o.lines))}</div>
          <div class="hdv-sub">${o.deliveryDate ? 'deliver ' + esc(niceDate(o.deliveryDate)) : esc(o.completed || '')} · ${n} item${n === 1 ? '' : 's'}${tqTxt}${paidProofDone(o) ? ' · <b style="color:var(--hdv-green)">Completed</b>' : ' · <b style="color:var(--hdv-red)">Unpaid</b>'}${o.packedAt ? ' · <b style="color:var(--hdv-green)">📦 packed</b> by ' + esc(o.packedBy || '?') : (o.packStartedAt ? ' · 📦 packing (' + esc(o.packStartedBy || '?') + ')' : '')}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${dchip('Received', 'date', o)}${dchip('Pack', 'packingDate', o)}${dchip('Deliver', 'deliveryDate', o)}</div>
        </div>
        <button class="hdv-btnG slim" data-act="pack" data-id="${esc(o.id)}">${packBtnLabel(o)}</button>
        ${(!tq || tq.status === 'error') ? `<button class="hdv-btnG slim" data-act="sendtill" data-id="${esc(o.id)}">→ Till</button>` : ''}
        <button class="hdv-btnG slim" data-act="inv" data-id="${esc(o.id)}">Invoice</button>
        ${customerId() ? '' : `<button class="hdv-btnG slim" data-act="editorder" data-id="${esc(o.id)}">✏️ Edit</button>`}
        <button class="hdv-btnG slim" data-act="again" data-id="${esc(o.id)}">Again</button>
      </div>`;
    }).join('');
    let billed = 0, paid = 0;
    for (const o of list) { const t = orderTotal(o.lines); billed += t; if (o.paid) paid += t; }
    const owing = billed - paid;
    h += `<div class="hdv-total"><span>Billed</span><span>${money(billed)}</span></div>`;
    h += `<div class="hdv-total"><span>Paid</span><span style="color:var(--hdv-green)">${money(paid)}</span></div>`;
    h += `<div class="hdv-total" style="font-weight:900"><span>Owing</span><span style="color:${owing > 0 ? 'var(--hdv-red)' : 'var(--hdv-green)'}">${money(owing)}</span></div>`;
    h += `<div class="hdv-actions">
      <button class="hdv-btnG slim" data-act="ststext">Text statement</button>
      <button class="hdv-btnP" data-act="hclose">Close</button>
    </div>`;
  }
  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'hclose') { closeSheet(); return; }
    if (t.dataset.act === 'ststext') { shareText(statementText(cust, list)); return; }
    const src = asList(orders()).find(o => o && o.id === t.dataset.id);
    if (!src) return;
    if (t.dataset.act === 'again') reorder(custId, src);
    else if (t.dataset.act === 'editorder') openSheet(orderEditSheet(src.id), { static: true });
    else if (t.dataset.act === 'inv') openSheet(b => invoiceSheet(b, custId, src.id));
    else if (t.dataset.act === 'sendtill') sendToTill(cust, src);   // queue a placed order to the till (refreshSheet re-renders the badge)
    else if (t.dataset.act === 'pack') {                            // Start pack (first open stamps who/when) -> open the checklist
      if (!src.packStartedAt) {
        src.packStartedAt = new Date().toISOString(); src.packStartedBy = whoami();
        if (!src.packingDate) src.packingDate = todayStr();
        saveOrder(src); toast('Packing started by ' + src.packStartedBy);
      }
      openSheet(packSheet(custId, src.id), { static: true });
    }
  };
  // edit a date (received / packing / delivery) inline — writes to the shared order; change bubbles to body
  body.onchange = e => {
    const inp = e.target.closest('input[data-df]'); if (!inp) return;
    const o = asList(orders()).find(x => x && x.id === inp.dataset.id); if (!o) return;
    const f = inp.dataset.df;
    if (f === 'date') { if (!inp.value) { inp.value = o.date || ''; return; } o.date = inp.value; }  // received date can't be blank
    else { o[f] = inp.value || ''; }                                                                 // packing/delivery: blank clears
    saveOrder(o);
    toast((f === 'date' ? 'Date received' : f === 'packingDate' ? 'Packing date' : 'Delivery date') + ' saved');
    refreshSheet();
  };
}

/* Plain-text account statement for a customer — every completed invoice with
   paid/owing status + the running balance, ready to text/email a restaurant. */
function statementText(cust, list) {
  let billed = 0, paid = 0;
  const rows = list.map(o => {
    const t = orderTotal(o.lines); billed += t; if (o.paid) paid += t;
    const d = o.deliveryDate ? niceDate(o.deliveryDate) : (o.completed || '');
    return `${(o.orderNo || 'Order')}  ${d}  ${money(t)}  ${o.paid ? 'PAID' : 'OWING'}`;
  });
  const owing = billed - paid;
  return [
    'STATEMENT — ' + (cust.name || ''),
    BIZ.name, 'ABN ' + BIZ.abn, '',
    rows.join('\n'), '',
    'Billed: ' + money(billed),
    'Paid:   ' + money(paid),
    'OWING:  ' + money(owing), '',
    'Pay: ' + (BIZ.accName ? BIZ.accName + '  ' : '') + 'BSB ' + BIZ.bsb + '  Acc ' + BIZ.acc,
    BIZ.name + ' · ' + BIZ.phone
  ].filter(s => s !== '').join('\n');
}

/* ---- Outstanding (AR): every placed-but-unpaid invoice + total owed ---- */
function outstandingSheet(body) {
  const render = () => {
    const owed = asList(orders()).filter(o =>
      o && o.status === 'completed' && !o.paid && Array.isArray(o.lines) && o.lines.length);
    owed.sort((a, b) =>
      String(a.deliveryDate || a.completed || '').localeCompare(String(b.deliveryDate || b.completed || '')) ||
      custName(a.custId).localeCompare(custName(b.custId)));
    const total = owed.reduce((s, o) => s + orderTotal(o.lines), 0);
    let h = `<div class="hdv-sheettitle">Outstanding invoices</div>
      <div class="hdv-sheetsub">${owed.length} unpaid · ${money(total)} owed</div>`;
    if (!owed.length) {
      h += emptyHTML('All invoices paid 🎉');
    } else {
      h += owed.map(o => `<div class="hdv-row">
        <div class="hdv-info">
          <div class="hdv-name">${esc(custName(o.custId))} · ${money(orderTotal(o.lines))}</div>
          <div class="hdv-sub">${esc(o.orderNo || 'Order')}${o.deliveryDate ? ' · ' + esc(niceDate(o.deliveryDate)) : (o.completed ? ' · ' + esc(o.completed) : '')}</div>
        </div>
        <button class="hdv-btnG slim" data-act="opaid" data-id="${esc(o.id)}">Mark paid</button>
      </div>`).join('');
    }
    h += `<div class="hdv-actions"><button class="hdv-btnP" data-act="odone">Done</button></div>`;
    body.innerHTML = h;
  };
  render();
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'odone') { closeSheet(); return; }
    if (t.dataset.act === 'opaid') {
      const o = asList(orders()).find(x => x && x.id === t.dataset.id);
      if (o) { o.paid = todayStr(); saveOrder(o); toast('Marked paid'); render(); }
    }
  };
}

/* ---- invoice (GST-free — owner 2026-06-12: "currently we are all gst free") */

function invoiceSheet(body, custId, orderId) {
  const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
  const o = asList(orders()).find(x => x && x.id === orderId);
  if (!o) { body.innerHTML = emptyHTML('Order not found'); return; }
  const lines = Array.isArray(o.lines) ? o.lines : [];
  const total = orderTotal(lines);
  const invNo = orderRef(o);

  let h = `<div class="hdv-sheettitle">Invoice ${esc(invNo)}</div>
    <div class="hdv-sheetsub">${esc(cust.name)} · ${o.deliveryDate ? 'delivered ' + esc(niceDate(o.deliveryDate)) : esc(o.completed || '')}</div>`;
  if (o.comment) h += noteBanner(o.comment);
  h += lines.map(l => {
    const lq = Number(l.qty) || 0, lp = Number(l.price) || 0;
    return `<div class="hdv-row">
      <div class="hdv-info"><div class="hdv-name">${esc(l.name)}</div>
        <div class="hdv-sub">${lq} × ${money(lp)}</div>${lineNote(l)}</div>
      <span class="hdv-price">${money(lq * lp)}</span>
    </div>`;
  }).join('');
  h += `<div class="hdv-total"><span>Total (GST-free)</span><span>${money(total)}</span></div>`;
  h += `<div class="hdv-sub" style="padding:6px 0 0">Payment: BSB ${BIZ.bsb} · Acc ${BIZ.acc} · Ref ${esc(invNo)}</div>`;
  if (cust.terms) h += `<div class="hdv-sub" style="padding:2px 0">Terms: ${esc(cust.terms === 'COD' ? 'Pay on delivery' : cust.terms.replace('days', ' days'))}</div>`;
  h += trackerHtml3(o);                                   // shared Ordered→Packed→Delivered→Emailed→Paid tracker
  const tq3 = tillQueueStatus(o.id);
  if (tq3) { const lbl3 = { queued: 'Queued for till', sent: 'Sent to till ✓', error: 'Till error' }[tq3.status] || tq3.status; h += `<div class="hdv-tq-status ${tq3.status === 'error' ? 'hdv-tq-error' : tq3.status === 'sent' ? 'hdv-tq-sent' : 'hdv-tq-queued'}">${lbl3}${tq3.error ? ' — ' + esc(tq3.error) : ''}</div>`; }
  const done3 = paidProofDone(o);
  h += `<div class="hdv-sub" style="padding:4px 0;font-weight:800;color:${done3 ? 'var(--hdv-green)' : 'var(--hdv-red)'}">${done3 ? '● Completed — paid &amp; proof on file' : (o.paid ? '○ Unpaid — attach the payment proof to complete' : '○ Unpaid')}</div>`;
  if (o.remittance) h += `<div class="hdv-sub" style="color:var(--hdv-green);font-weight:700">📎 Payment proof attached${o.remittanceAt ? ' · ' + esc(niceDate(o.remittanceAt)) : ''}</div>`;
  if (o.podSigned || o.podGoods) h += `<div class="hdv-sub" style="color:var(--hdv-green);font-weight:700">🚚 Delivery proof attached</div>`;
  h += `<div class="hdv-actions">
    ${customerId() ? '' : '<button class="hdv-btnG slim" data-act="iedit">✏️ Edit</button>'}
    <button class="hdv-btnG slim" data-act="ishare">Text</button>
    <button class="hdv-btnG slim" data-act="oform">Order form</button>
    <button class="hdv-btnG slim" data-act="paid">${o.paid ? 'Mark unpaid' : 'Mark paid'}</button>
    <button class="hdv-btnG slim" data-act="remit">${o.remittance ? '📎 View payment proof' : '📎 Add payment proof'}</button>
    <button class="hdv-btnG slim" data-act="pod">${(o.podSigned || o.podGoods) ? '🚚 Delivery proof' : '🚚 Add delivery proof'}</button>
    <button class="hdv-btnG slim" data-act="sendtill">📤 Send to till</button>
    <button class="hdv-btnG slim" data-act="idone">Done</button>
    <button class="hdv-btnP" data-act="ipdf">Share PDF</button>
  </div>`;

  body.innerHTML = h;
  body.onclick = e => {
    const trk = e.target.closest('[data-trk]');
    if (trk) { const k = trk.dataset.trk, on = !trkDone(o, k); trkSet(o, k, on); toast(k.charAt(0).toUpperCase() + k.slice(1) + (on ? ' ✓' : ' cleared')); refreshSheet(); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'iedit') openSheet(orderEditSheet(o.id), { static: true });
    else if (t.dataset.act === 'ishare') shareText(invoiceText(invNo, cust, o));
    else if (t.dataset.act === 'paid') { const on = !o.paid; trkSet(o, 'paid', on); toast(on ? 'Marked paid' : 'Marked unpaid'); refreshSheet(); }
    else if (t.dataset.act === 'oform') { if (!openOrderForm(o, cust)) toast('Allow pop-ups to open the order form'); }
    else if (t.dataset.act === 'remit') { if (o.remittance) openSheet(remittanceViewer(o)); else attachRemittance(o); }
    else if (t.dataset.act === 'pod') { if (o.podSigned || o.podGoods) openSheet(podViewer(o)); else attachPod(o); }
    else if (t.dataset.act === 'sendtill') { queueForTill(o, cust.name, cust.eposId || null); toast('Queued for till'); refreshSheet(); }
    else if (t.dataset.act === 'ipdf') {
      shareInvoice(invoiceData(invNo, cust, o)).then(s => {
        if (s === 'downloaded') toast('Invoice PDF saved');
      }).catch(() => toast('Could not make the PDF'));
    }
    else if (t.dataset.act === 'idone') closeSheet();
  };
}

/* Attach a payment proof (remittance / bank-statement screenshot) to an invoice.
   Compressed client-side (max 1100px, JPEG) so it stays small; stored on the
   order and persisted by saveOrder. Attaching also marks the invoice paid. */
function attachRemittance(o) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height; const max = 1100;
        if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        try { o.remittance = cv.toDataURL('image/jpeg', 0.6); }
        catch (e) { toast('Could not read that image'); return; }
        o.remittanceAt = todayStr();
        if (!o.paid) o.paid = todayStr();          // proof attached -> mark paid
        saveOrder(o);
        toast('Payment proof attached');
        refreshSheet();
      };
      img.onerror = () => toast('Could not read that image');
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };
  inp.click();
}

function remittanceViewer(o) {
  return (body) => {
    body.innerHTML = `<div class="hdv-sheettitle">Payment proof</div>
      <div class="hdv-sheetsub">${o.remittanceAt ? 'attached ' + esc(niceDate(o.remittanceAt)) : ''}</div>
      <img src="${o.remittance}" alt="remittance" style="width:100%;border-radius:10px;border:1px solid var(--hdv-line)">
      <div class="hdv-actions">
        <button class="hdv-btnG slim" data-act="reremit">Replace</button>
        <button class="hdv-btnG slim danger" data-act="delremit">Remove</button>
        <button class="hdv-btnP" data-act="vclose">Close</button>
      </div>`;
    body.onclick = e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      if (t.dataset.act === 'vclose') closeSheet();
      else if (t.dataset.act === 'reremit') attachRemittance(o);
      else if (t.dataset.act === 'delremit') { delete o.remittance; delete o.remittanceAt; saveOrder(o); toast('Proof removed'); closeSheet(); }
    };
  };
}

function invoiceTerms(cust) {
  return cust.terms === 'COD' ? 'Pay on delivery'
    : cust.terms ? 'Payment terms: ' + cust.terms.replace('days', ' days') : '';
}

/* Delivery line for the docket: date + the customer's delivery time. */
function deliveryText(cust, o) {
  return [o && o.deliveryDate ? niceDate(o.deliveryDate) : '', (cust && cust.deliveryTime) || '']
    .filter(Boolean).join(' · ');
}

/* Data object shared with the PDF generator (pdfinvoice.js). */
function invoiceData(invNo, cust, o) {
  return {
    biz: BIZ,
    invNo,
    date: niceDate(o.completed || o.deliveryDate || todayStr()),
    customer: cust.name || '',
    custAddr: cust.address || cust.deliveryAddress || cust.addr || '',
    custPhone: cust.phone || cust.mobile || '',
    custEmail: cust.email || '',
    deliver: deliveryText(cust, o),
    orderRef: o.orderNo || o.id,
    lines: (o.lines || []).map(l => ({
      name: l.name, qty: Number(l.qty) || 0, price: Number(l.price) || 0, unit: l.unit || ''
    })),
    total: orderTotal(o.lines),
    gstFree: true,
    terms: invoiceTerms(cust)
  };
}

function invoiceText(invNo, cust, o) {
  const lines = (o.lines || []).map(l => {
    const lq = Number(l.qty) || 0, lp = Number(l.price) || 0;
    return `${lq} x ${l.name} @ ${money(lp)} = ${money(lq * lp)}` + (l.note ? ` (${l.note})` : '');
  });
  const total = orderTotal(o.lines);
  return [
    'TAX INVOICE ' + invNo,
    BIZ.name,
    'ABN ' + BIZ.abn,
    BIZ.addr,
    (BIZ.contacts || ('Ph ' + BIZ.phone)),
    BIZ.email,
    '',
    'Bill to: ' + (cust.name || ''),
    (cust.address || cust.deliveryAddress || cust.addr || ''),
    (cust.phone || cust.mobile || ''),
    deliveryText(cust, o) ? 'Delivery: ' + deliveryText(cust, o) : '',
    'Order: ' + (o.orderNo || o.id),
    (o.comment ? 'Note: ' + o.comment : ''),
    '',
    lines.join('\n'),
    '',
    'TOTAL: ' + money(total) + '  (all items GST-free)',
    '',
    'Payment: ' + (BIZ.accName ? BIZ.accName + '  ' : '') + 'BSB ' + BIZ.bsb + '  Acc ' + BIZ.acc + '  Ref ' + invNo,
    invoiceTerms(cust)
  ].filter(s => s !== '').join('\n');
}

/* Copy a past order's lines into the customer's open order. */
function reorder(custId, src) {
  const o = openOrderOf(custId) || ensureOpenOrder(custId);
  if (!Array.isArray(o.lines)) o.lines = [];
  for (const l of (src.lines || [])) {
    const i = o.lines.findIndex(x => x.key === l.key);
    if (i >= 0) o.lines[i].qty = (Number(o.lines[i].qty) || 0) + (Number(l.qty) || 0);
    else o.lines.push({ key: l.key, name: l.name, sup: l.sup, unit: l.unit || '', qty: Number(l.qty) || 0, price: l.price, src: l.src || 'tier' });
  }
  saveOrder(o);
  closeSheet();
  toast('Copied to a new order');
  mode = 'take'; curId = custId; clearSearch(); rerenderNow();
}

/* ---- standing (repeat) orders ---------------------------------------- */

function standingSheet(body, cust) {
  let st = standingFor(cust.id) ||
    { custId: cust.id, weekdays: [], lines: [], active: true };
  // work on a copy so Cancel discards cleanly
  st = JSON.parse(JSON.stringify(st));
  if (!Array.isArray(st.lines)) st.lines = [];
  if (!Array.isArray(st.weekdays)) st.weekdays = [];

  const render = () => {
    const dayBtns = WD.map((w, i) =>
      `<label style="display:flex;align-items:center;gap:5px;border:1px solid var(--hdv-line);border-radius:8px;padding:7px 10px;font-size:14px;color:var(--hdv-text)">
        <input type="checkbox" class="st-day" value="${i}"${st.weekdays.includes(i) ? ' checked' : ''}> ${w}</label>`).join('');

    let linesHtml;
    if (!st.lines.length) {
      linesHtml = emptyHTML('No items yet — copy them from an order below');
    } else {
      linesHtml = st.lines.map((l, i) => `<div class="hdv-row">
        <div class="hdv-info"><div class="hdv-name">${esc(l.name || l.key)}</div></div>
        <div class="hdv-step">
          <button class="hdv-sbtn" data-act="sdec" data-i="${i}" aria-label="less">&minus;</button>
          <span class="hdv-qty">${Number(l.qty) || 0}</span>
          <button class="hdv-sbtn plus" data-act="sinc" data-i="${i}" aria-label="more">+</button>
        </div>
      </div>`).join('');
    }

    const open = openOrderOf(cust.id);
    const last = completedOrdersOf(cust.id)[0];

    body.innerHTML = `
      <div class="hdv-sheettitle">Repeat order · ${esc(cust.name)}</div>
      <div class="hdv-sheetsub">Placed automatically before each delivery's cut-off, at that day's prices</div>
      <label class="hdv-lbl">Delivery days</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px">${dayBtns}</div>
      <label class="hdv-lbl">Items</label>
      ${linesHtml}
      <div style="display:flex;gap:8px;padding:8px 0 0">
        ${open && (open.lines || []).length ? '<button class="hdv-btnG slim" data-act="copyopen">Copy current order</button>' : ''}
        ${last && (last.lines || []).length ? '<button class="hdv-btnG slim" data-act="copylast">Copy last order</button>' : ''}
      </div>
      <label class="hdv-lbl" style="display:flex;align-items:center;gap:8px;margin-top:12px">
        <input type="checkbox" id="st-active"${st.active !== false ? ' checked' : ''}> Active</label>
      <div class="hdv-err" id="st-err"></div>
      <div class="hdv-actions">
        <button class="hdv-btnG" data-act="cancel">Cancel</button>
        <button class="hdv-btnP" data-act="save">Save repeat order</button>
      </div>`;
  };
  render();

  const grabDays = () => {
    st.weekdays = Array.from(body.querySelectorAll('.st-day'))
      .filter(x => x.checked).map(x => parseInt(x.value, 10));
  };

  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'cancel') { closeSheet(); return; }
    if (act === 'sinc' || act === 'sdec') {
      grabDays();
      const i = parseInt(t.dataset.i, 10);
      const l = st.lines[i];
      if (!l) return;
      l.qty = (Number(l.qty) || 0) + (act === 'sinc' ? 1 : -1);
      if (l.qty <= 0) st.lines.splice(i, 1);
      st.active = body.querySelector('#st-active').checked;
      render();
      return;
    }
    if (act === 'copyopen' || act === 'copylast') {
      grabDays();
      const src = act === 'copyopen' ? openOrderOf(cust.id) : completedOrdersOf(cust.id)[0];
      if (src) {
        st.lines = (src.lines || []).map(l =>
          ({ key: l.key, name: l.name, sup: l.sup, unit: l.unit || '', qty: Number(l.qty) || 0 }));
      }
      st.active = body.querySelector('#st-active').checked;
      render();
      return;
    }
    if (act !== 'save') return;
    grabDays();
    st.active = body.querySelector('#st-active').checked;
    if (st.active && !st.weekdays.length) {
      body.querySelector('#st-err').textContent = 'Pick at least one delivery day';
      return;
    }
    if (st.active && !st.lines.length) {
      body.querySelector('#st-err').textContent = 'Add at least one item (copy an order)';
      return;
    }
    saveStanding(st);
    generateStandingOrders();      // place immediately if a window is open
    closeSheet();
    toast(st.active ? 'Repeat order on' : 'Repeat order saved (off)');
    rerenderNow();
  };
}

/* ---- daily ops: market buy list + per-customer pick slips ----------- */

function custName(id) {
  const c = asList(customers()).find(x => x && x.id === id);
  return c ? c.name : '(unknown)';
}

function placedFor(date) {
  return asList(orders()).filter(o =>
    o && o.status === 'completed' && o.deliveryDate === date &&
    Array.isArray(o.lines) && o.lines.length);
}

/* Short pack-progress label for a placed order (used in the run view). */
function packLabel(o) {
  const ls = (o.lines || []).filter(Boolean);
  if (!ls.length) return '';
  const p = ls.filter(l => l.packed).length;
  return p === 0 ? 'unpacked' : (p === ls.length ? 'packed ✓' : p + '/' + ls.length + ' packed');
}

/* Customer order note banner (o.comment from the v2 customer app, e.g. "ring on
   arrival") — surfaced so whoever picks/packs/delivers actually sees it. */
function noteBanner(text) {
  if (!text) return '';
  return `<div style="background:var(--hdv-lt);border-left:3px solid var(--hdv-green);border-radius:8px;` +
    `padding:8px 10px;margin:6px 0;font-size:13px;color:var(--hdv-text)"><b>📝 Note:</b> ${esc(text)}</div>`;
}
/* Per-line note (line.note, e.g. "extra ripe"). */
function lineNote(l) {
  return (l && l.note) ? `<div class="hdv-who">📝 ${esc(l.note)}</div>` : '';
}
/* Staff add/edit the order note (picker instructions, e.g. "ring on arrival"). */
function editOrderNote(custId) {
  const o = openOrderOf(custId);
  if (!o) { toast('No open order'); return; }
  const v = window.prompt('Order note (e.g. "ring on arrival", "leave at back door")', o.comment || '');
  if (v === null) return;                         // cancelled
  o.comment = v.trim(); saveOrder(o);
  toast(o.comment ? 'Note saved' : 'Note cleared');
  refreshSheet();
}

/* Sum every placed line for a delivery date by product -> what to buy. */
function aggregateBuy(dayOrders) {
  const agg = new Map();
  for (const o of dayOrders) for (const l of (o.lines || [])) {
    const cur = agg.get(l.key) || { name: l.name, cat: l.sup, qty: 0 };
    cur.qty += Number(l.qty) || 0;
    agg.set(l.key, cur);
  }
  return Array.from(agg.values());
}

function pickingSheet(body) {
  const completed = asList(orders()).filter(o =>
    o && o.status === 'completed' && o.deliveryDate && Array.isArray(o.lines) && o.lines.length);
  const dates = Array.from(new Set(completed.map(o => o.deliveryDate))).sort();

  if (!dates.length) {
    body.innerHTML = `<div class="hdv-sheettitle">Orders &amp; picking</div>` +
      emptyHTML('No placed orders yet — take an order and tap “Place order”');
    body.onclick = e => { const t = e.target.closest('[data-act]'); if (t && t.dataset.act === 'pdone') closeSheet(); };
    return;
  }
  if (!pickDate || !dates.includes(pickDate)) {
    const today = todayStr();
    pickDate = dates.find(d => d >= today) || dates[dates.length - 1];
  }

  const dayOrders = placedFor(pickDate);
  const dateChips = dates.map(d =>
    `<button class="hdv-chip${d === pickDate ? ' on' : ''}" data-act="pdate" data-d="${esc(d)}">${esc(niceDate(d))}</button>`).join('');

  let h = `<div class="hdv-sheettitle">Run · ${esc(niceDate(pickDate))}</div>
    <div class="hdv-sheetsub">${dayOrders.length} order${dayOrders.length === 1 ? '' : 's'} placed for this delivery</div>
    <div class="hdv-chips" style="position:static;padding:8px 0">${dateChips}</div>
    <div style="display:flex;gap:8px;padding:2px 0 6px">
      <button class="${pickMode === 'buy' ? 'hdv-btnP' : 'hdv-btnG'} slim" data-act="pmode" data-m="buy">Buy list</button>
      <button class="${pickMode === 'cust' ? 'hdv-btnP' : 'hdv-btnG'} slim" data-act="pmode" data-m="cust">By customer</button>
    </div>`;

  if (pickMode === 'buy') {
    const items = aggregateBuy(dayOrders);
    const byCat = new Map();
    for (const it of items) { if (!byCat.has(it.cat)) byCat.set(it.cat, []); byCat.get(it.cat).push(it); }
    for (const [cat, arr] of Array.from(byCat.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      h += `<div class="hdv-sec">${esc(cat || 'Other')}</div>`;
      arr.sort((a, b) => a.name.localeCompare(b.name));
      h += arr.map(it => `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name">${esc(it.name)}</div></div><span class="hdv-price">${it.qty}</span></div>`).join('');
    }
  } else {
    for (const o of dayOrders.slice().sort((a, b) => custName(a.custId).localeCompare(custName(b.custId)))) {
      const tq = tillQueueStatus(o.id);
      const tqTag = tq ? ' · ' + ({ queued: 'queued for till', sent: 'sent to till ✓', error: 'till error' }[tq.status] || tq.status) : '';
      h += `<div class="hdv-sec" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>${esc(custName(o.custId))}${o.orderNo ? ' · ' + esc(o.orderNo) : ''} · ${esc(packLabel(o))}${tqTag}</span>
        <button class="hdv-btnG slim" data-act="ppack" data-id="${esc(o.id)}" data-cust="${esc(o.custId)}" style="padding:3px 10px;font-size:12px;flex:0 0 auto">Pack</button>
      </div>`;
      h += noteBanner(o.comment);
      h += (o.lines || []).map(l => `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name">${esc(l.name)}</div>${lineNote(l)}</div><span class="hdv-price">${Number(l.qty) || 0}</span></div>`).join('');
    }
  }

  h += `<div class="hdv-actions">
    <button class="hdv-btnG" data-act="pshare">Share</button>
    <button class="hdv-btnP" data-act="pdone">Done</button>
  </div>`;

  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'pdate') { pickDate = t.dataset.d; pickingSheet(body); }
    else if (act === 'pmode') { pickMode = t.dataset.m; pickingSheet(body); }
    else if (act === 'ppack') openSheet(packSheet(t.dataset.cust, t.dataset.id), { static: true });   // pack a placed order from the run
    else if (act === 'pshare') shareText(pickText(pickDate, pickMode));
    else if (act === 'pdone') closeSheet();
  };
}

function pickText(date, m) {
  const day = placedFor(date);
  let txt = `Happy Days — ${m === 'buy' ? 'buy list' : 'pick slips'} for delivery ${niceDate(date)}\n`;
  if (m === 'buy') {
    txt += aggregateBuy(day).sort((a, b) => a.name.localeCompare(b.name))
      .map(it => `${it.qty} x ${it.name}`).join('\n');
  } else {
    for (const o of day) {
      txt += `\n— ${custName(o.custId)}${o.orderNo ? ' (' + o.orderNo + ')' : ''} —\n` +
        (o.comment ? `📝 ${o.comment}\n` : '') +
        (o.lines || []).map(l => `${Number(l.qty) || 0} x ${l.name}${l.note ? ' (' + l.note + ')' : ''}`).join('\n') + '\n';
    }
  }
  return txt;
}

function orderText(cust, o) {
  if (!o) return '';
  const run = runById(cust && cust.runId);
  const di = run ? deliveryInfo(run) : null;
  const del = o.deliveryDate || (di ? di.date : null);
  const rows = (o.lines || []).map(l => {
    const lp = Number(l.price) || 0, lq = Number(l.qty) || 0;
    return `${lq} x ${l.name}` + (lp ? ` @ ${money(lp)} = ${money(lp * lq)}` : '') + (l.note ? ` (${l.note})` : '');
  });
  return `Happy Days — order for ${cust ? cust.name : ''}` +
    (o.orderNo ? ` (${o.orderNo})` : '') +
    (del ? `\nFor delivery: ${niceDate(del)}` : '') +
    (o.comment ? `\nNote: ${o.comment}` : '') + '\n' +
    rows.join('\n') +
    `\nTotal: ${money(orderTotal(o.lines))}` +
    '\n\nHappy Days Fruit Veg & Grocer · 0430 033 127';
}

/* ---- customer add / edit form --------------------------------------- */

function customerSheet(body, existing) {
  const c = existing || {};
  const val = x => esc(x == null ? '' : x);
  const tlist = asList(tiers());
  const tierOpts = (tlist.length ? tlist : [{ id: 'retail', name: 'retail' }])
    .map(t => `<option value="${esc(t.id)}"${c.tierId === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
  const runOpts = '<option value="">— none —</option>' + asList(runs())
    .map(r => `<option value="${esc(r.id)}"${c.runId === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
  const typeOpts = [['restaurant', 'Restaurant'], ['cafe', 'Cafe'], ['agedcare', 'Aged care'], ['wholesale', 'Wholesale'], ['retail', 'Retail']]
    .map(([v, l]) => `<option value="${v}"${c.type === v ? ' selected' : ''}>${l}</option>`).join('');
  const termOpts = [['COD', 'COD (pay on delivery)'], ['7days', '7 days'], ['14days', '14 days'], ['30days', '30 days']]
    .map(([v, l]) => `<option value="${v}"${c.terms === v ? ' selected' : ''}>${l}</option>`).join('');
  const half = 'flex:1;min-width:0';
  const row = 'display:flex;gap:10px';

  body.innerHTML = `
    <div class="hdv-sheettitle">${existing ? 'Edit customer' : 'New customer'}</div>
    <label class="hdv-lbl" for="cf-name">Name *</label>
    <input class="hdv-in" id="cf-name" placeholder="e.g. Corner Cafe" autocomplete="off" value="${val(c.name)}">
    <div style="${row}">
      <div style="${half}"><label class="hdv-lbl" for="cf-type">Type</label>
        <select class="hdv-in" id="cf-type">${typeOpts}</select></div>
      <div style="${half}"><label class="hdv-lbl" for="cf-tier">Price level</label>
        <select class="hdv-in" id="cf-tier">${tierOpts}</select></div>
    </div>
    <div style="${row}">
      <div style="${half}"><label class="hdv-lbl" for="cf-phone">Phone</label>
        <input class="hdv-in" id="cf-phone" type="tel" placeholder="04xx xxx xxx" value="${val(c.phone)}"></div>
      <div style="${half}"><label class="hdv-lbl" for="cf-contact">Contact person</label>
        <input class="hdv-in" id="cf-contact" placeholder="e.g. Maria" value="${val(c.contact)}"></div>
    </div>
    <label class="hdv-lbl" for="cf-email">Email</label>
    <input class="hdv-in" id="cf-email" type="email" autocapitalize="none" spellcheck="false" placeholder="name@email.com" value="${val(c.email)}">
    <label class="hdv-lbl" for="cf-addr">Address</label>
    <input class="hdv-in" id="cf-addr" placeholder="Street address" value="${val(c.address)}">
    <div style="${row}">
      <div style="${half}"><label class="hdv-lbl" for="cf-sub">Suburb</label>
        <input class="hdv-in" id="cf-sub" placeholder="Suburb" value="${val(c.suburb)}"></div>
      <div style="${half}"><label class="hdv-lbl" for="cf-run">Delivery run</label>
        <select class="hdv-in" id="cf-run">${runOpts}</select></div>
    </div>
    <label class="hdv-lbl" for="cf-delivtime">Delivery time <span class="hdv-mut">(prints on the docket)</span></label>
    <input class="hdv-in" id="cf-delivtime" placeholder="e.g. by 6:00am" value="${val(c.deliveryTime)}">
    <div style="${row}">
      <div style="${half}"><label class="hdv-lbl" for="cf-min">Min order $</label>
        <input class="hdv-in" id="cf-min" type="number" inputmode="decimal" min="0" placeholder="0" value="${c.minOrder != null ? esc(c.minOrder) : ''}"></div>
      <div style="${half}"><label class="hdv-lbl" for="cf-terms">Payment terms</label>
        <select class="hdv-in" id="cf-terms">${termOpts}</select></div>
    </div>
    <label class="hdv-lbl" for="cf-notes">Notes</label>
    <input class="hdv-in" id="cf-notes" placeholder="Delivery / picking notes" value="${val(c.notes)}">
    ${existing ? `
    <label class="hdv-lbl">Customer login <span class="hdv-mut">(lets them order for themselves)</span></label>
    <div style="${row}">
      <div style="${half}"><input class="hdv-in" id="cf-luser" placeholder="username"
        autocomplete="off" autocapitalize="none" spellcheck="false"></div>
      <div style="${half}"><input class="hdv-in" id="cf-lpass" placeholder="temp password (6+)"
        autocomplete="off" autocapitalize="none" spellcheck="false"></div>
    </div>
    <button class="hdv-btnG slim" data-act="mklogin" style="margin-top:4px">Create login</button>` : ''}
    <div class="hdv-err" id="cf-err"></div>
    <div class="hdv-actions">
      <button class="hdv-btnG" data-act="cancel">Cancel</button>
      <button class="hdv-btnP" data-act="save">${existing ? 'Save changes' : 'Save customer'}</button>
    </div>`;

  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'cancel') { closeSheet(); return; }
    if (t.dataset.act === 'mklogin') {
      const err = body.querySelector('#cf-err');
      const u = (body.querySelector('#cf-luser') || {}).value || '';
      const p = (body.querySelector('#cf-lpass') || {}).value || '';
      if (!u.trim() || p.length < 6) { err.textContent = 'Enter a username and a 6+ character password'; return; }
      t.disabled = true; t.textContent = 'Creating…';
      createCustomerLogin(c.id, u, p)
        .then(r => { err.textContent = ''; toast('Login created: ' + r.email); t.textContent = 'Login created ✓'; })
        .catch(e2 => { err.textContent = e2.message || 'Could not create the login'; t.disabled = false; t.textContent = 'Create login'; });
      return;
    }
    if (t.dataset.act !== 'save') return;
    const g = id => body.querySelector(id).value.trim();
    const name = g('#cf-name');
    if (!name) { body.querySelector('#cf-err').textContent = 'Name is required'; return; }
    const minRaw = g('#cf-min');
    saveCustomer(Object.assign({}, c, {
      id: c.id || ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      name,
      type: g('#cf-type'),
      tierId: g('#cf-tier'),
      phone: g('#cf-phone'),
      contact: g('#cf-contact'),
      email: g('#cf-email'),
      address: g('#cf-addr'),
      suburb: g('#cf-sub'),
      runId: g('#cf-run'),
      deliveryTime: g('#cf-delivtime'),
      minOrder: minRaw === '' ? null : (parseFloat(minRaw) || 0),
      terms: g('#cf-terms'),
      notes: g('#cf-notes'),
      prices: c.prices || {}
    }));
    closeSheet();
    toast(existing ? 'Customer saved' : 'Customer added');
  };
}

/* ---- per-customer special prices (a sparse price list) --------------- */

function pricesSheet(body, custId) {
  const findCust = () => asList(customers()).find(c => c && c.id === custId);
  let cust = findCust() || { id: custId, name: '?', prices: {} };

  body.innerHTML = `
    <div class="hdv-sheettitle">Special prices · ${esc(cust.name)}</div>
    <div class="hdv-sheetsub">Search a product and set this customer's price. Blank = standard shelf price.</div>
    <input class="hdv-in" id="pe-q" placeholder="Search products…" autocomplete="off" autocapitalize="off" spellcheck="false">
    <div id="pe-res"></div>
    <div class="hdv-actions"><button class="hdv-btnP" data-act="done">Done</button></div>`;

  const res = body.querySelector('#pe-res');
  const qel = body.querySelector('#pe-q');

  const rowHtml = p => {
    const cur = cust.prices && cust.prices[p.key];
    const shelf = (typeof p.sell === 'number' && p.sell > 0) ? 'shelf ' + money(p.sell) : 'no shelf price';
    const v = (cur === '' || cur == null) ? '' : Number(cur);
    return `<div class="hdv-row">
      <div class="hdv-info"><div class="hdv-name">${esc(p.name)}</div>
        <div class="hdv-sub">${esc(shelf)}</div></div>
      <input class="hdv-pin pe-price" data-key="${esc(p.key)}" type="number" step="0.01" min="0"
        inputmode="decimal" placeholder="${typeof p.sell === 'number' ? p.sell.toFixed(2) : '—'}" value="${v}">
    </div>`;
  };

  const render = () => {
    cust = findCust() || cust;
    const q = qel.value.trim();
    let list;
    if (q) {
      list = searchCatalog(q).slice(0, 25);
    } else {
      const map = new Map(catalog().map(p => [p.key, p]));
      list = Object.keys(cust.prices || {}).map(k => map.get(k)).filter(Boolean);
    }
    if (!list.length) {
      res.innerHTML = emptyHTML(q ? `No products match “${esc(q)}”` : 'No special prices yet — search to add one');
      return;
    }
    res.innerHTML = (q ? '' : `<div class="hdv-sec">${list.length} special price${list.length === 1 ? '' : 's'}</div>`) +
      list.map(rowHtml).join('');
  };
  render();

  qel.addEventListener('input', render);
  res.addEventListener('change', e => {
    const inp = e.target.closest('.pe-price');
    if (!inp) return;
    cust = findCust() || cust;
    const prices = Object.assign({}, cust.prices || {});
    const raw = inp.value.trim();
    if (raw === '') delete prices[inp.dataset.key];
    else { const v = parseFloat(raw); if (isFinite(v) && v >= 0) prices[inp.dataset.key] = Math.round(v * 100) / 100; }
    saveCustomer(Object.assign({}, cust, { prices }));
    cust = findCust() || cust;
    if (!qel.value.trim()) render();        // refresh the overrides list
  });
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (t && t.dataset.act === 'done') closeSheet();
  };
}

/* ---- delivery runs & cut-offs --------------------------------------- */

function runsAdminSheet(body) {
  const rlist = asList(runs());
  let h = `<div class="hdv-sheettitle">Delivery runs &amp; cut-offs</div>
    <div class="hdv-sheetsub">When customers must order by, and which days you deliver</div>`;
  if (!rlist.length) h += emptyHTML('No runs yet — add one');
  for (const r of rlist) {
    const di = deliveryInfo(r);
    h += `<div class="hdv-row">
      <div class="hdv-info">
        <div class="hdv-name">${esc(r.name)}${r.active === false ? ' · off' : ''}</div>
        <div class="hdv-sub">Order by ${esc(cutoffLabel(r))} · delivers ${esc(daysLabel(r.deliveryDays))}${di ? ` · next ${esc(niceDate(di.date))}` : ''}</div>
      </div>
      <button class="hdv-btnG slim" data-act="editrun" data-id="${esc(r.id)}">Edit</button>
    </div>`;
  }
  h += `<div class="hdv-actions"><button class="hdv-btnP" data-act="addrun">+ Add a run</button></div>`;
  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'editrun') openSheet(b => runEditSheet(b, runById(t.dataset.id)), { static: true });
    else if (t.dataset.act === 'addrun') openSheet(b => runEditSheet(b, null), { static: true });
  };
}

function runEditSheet(body, existing) {
  const r = existing || { cutoffTime: '21:00', cutoffDayOffset: -1, deliveryDays: [1, 2, 3, 4, 5, 6], active: true };
  const offOpts = [[0, 'Same day'], [-1, 'The day before'], [-2, '2 days before']]
    .map(([v, l]) => `<option value="${v}"${Number(r.cutoffDayOffset) === v ? ' selected' : ''}>${l}</option>`).join('');
  const dayBtns = WD.map((w, i) =>
    `<label style="display:flex;align-items:center;gap:5px;border:1px solid var(--hdv-line);border-radius:8px;padding:7px 10px;font-size:14px;color:var(--hdv-text)">
      <input type="checkbox" class="rd-dc" value="${i}"${(r.deliveryDays || []).includes(i) ? ' checked' : ''}> ${w}</label>`).join('');

  body.innerHTML = `
    <div class="hdv-sheettitle">${existing ? 'Edit run' : 'New delivery run'}</div>
    <label class="hdv-lbl" for="rf-name">Name *</label>
    <input class="hdv-in" id="rf-name" placeholder="e.g. Morning delivery" value="${esc(r.name || '')}">
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label class="hdv-lbl" for="rf-time">Order cut-off time</label>
        <input class="hdv-in" id="rf-time" type="time" value="${esc(r.cutoffTime || '21:00')}"></div>
      <div style="flex:1"><label class="hdv-lbl" for="rf-off">Cut-off is</label>
        <select class="hdv-in" id="rf-off">${offOpts}</select></div>
    </div>
    <label class="hdv-lbl">Delivery days</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">${dayBtns}</div>
    <label class="hdv-lbl" style="display:flex;align-items:center;gap:8px;margin-top:12px">
      <input type="checkbox" id="rf-active"${r.active !== false ? ' checked' : ''}> Active</label>
    <div class="hdv-err" id="rf-err"></div>
    <div class="hdv-actions">
      <button class="hdv-btnG" data-act="back">Back</button>
      <button class="hdv-btnP" data-act="save">Save run</button>
    </div>`;

  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'back') { openSheet(runsAdminSheet); return; }
    if (t.dataset.act !== 'save') return;
    const name = body.querySelector('#rf-name').value.trim();
    if (!name) { body.querySelector('#rf-err').textContent = 'Name is required'; return; }
    const days = Array.from(body.querySelectorAll('.rd-dc')).filter(x => x.checked).map(x => parseInt(x.value, 10));
    saveRun(Object.assign({}, r, {
      id: r.id || ('run' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
      name,
      cutoffTime: body.querySelector('#rf-time').value || '21:00',
      cutoffDayOffset: parseInt(body.querySelector('#rf-off').value, 10) || 0,
      deliveryDays: days,
      active: body.querySelector('#rf-active').checked
    }));
    toast('Run saved');
    openSheet(runsAdminSheet);
  };
}

/* ---- price levels (customer groups) --------------------------------- */

function ruleLabel(rule) {
  rule = rule || { type: 'shop' };
  if (rule.type === 'shopAdj') {
    const p = Number(rule.pct) || 0;
    if (p === 0) return 'Shelf price';
    return p < 0 ? `${Math.abs(p)}% off shelf` : `${p}% above shelf`;
  }
  if (rule.type === 'costPlus') return 'Shelf price · set a discount to use this group';
  if (rule.type === 'manual') return 'Manual price each time';
  return 'Shelf price';
}

function groupsSheet(body) {
  const list = asList(tiers());
  let h = `<div class="hdv-sheettitle">Price levels (customer groups)</div>
    <div class="hdv-sheetsub">A default price for each customer type. Individual customer prices still override these.</div>`;
  if (!list.length) h += emptyHTML('No price levels yet — add one');
  for (const t of list) {
    h += `<div class="hdv-row">
      <div class="hdv-info">
        <div class="hdv-name">${esc(t.name)}</div>
        <div class="hdv-sub">${esc(ruleLabel(t.rule))}</div>
      </div>
      <button class="hdv-btnG slim" data-act="editgrp" data-id="${esc(t.id)}">Edit</button>
    </div>`;
  }
  h += `<div class="hdv-actions"><button class="hdv-btnP" data-act="addgrp">+ Add group</button></div>`;
  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'editgrp') openSheet(b => groupEditSheet(b, asList(tiers()).find(x => x && x.id === t.dataset.id)), { static: true });
    else if (t.dataset.act === 'addgrp') openSheet(b => groupEditSheet(b, null), { static: true });
  };
}

function groupEditSheet(body, existing) {
  const t = existing || { rule: { type: 'shop' } };
  const rule = t.rule || { type: 'shop' };
  const isAdj = rule.type === 'shopAdj';
  const pct = Number(rule.pct) || 0;

  body.innerHTML = `
    <div class="hdv-sheettitle">${existing ? 'Edit price level' : 'New price level'}</div>
    <label class="hdv-lbl" for="gf-name">Name *</label>
    <input class="hdv-in" id="gf-name" placeholder="e.g. Cafés" value="${esc(t.name || '')}">
    <label class="hdv-lbl" for="gf-type">Pricing</label>
    <select class="hdv-in" id="gf-type">
      <option value="shop"${!isAdj ? ' selected' : ''}>Shelf price (no change)</option>
      <option value="shopAdj"${isAdj ? ' selected' : ''}>% off / above shelf</option>
    </select>
    <div id="gf-pctwrap" style="${isAdj ? '' : 'display:none'}">
      <label class="hdv-lbl" for="gf-pct">Adjustment % <span class="hdv-mut">(−10 = 10% cheaper, 5 = 5% dearer)</span></label>
      <input class="hdv-in" id="gf-pct" type="number" step="1" inputmode="numeric" value="${isAdj ? pct : -10}">
      <div class="hdv-sub" id="gf-eg" style="padding:2px 2px 0"></div>
    </div>
    <div class="hdv-err" id="gf-err"></div>
    <div class="hdv-actions">
      <button class="hdv-btnG" data-act="cancel">Cancel</button>
      <button class="hdv-btnP" data-act="save">Save</button>
    </div>`;

  const typeSel = body.querySelector('#gf-type');
  const pctWrap = body.querySelector('#gf-pctwrap');
  const pctInp = body.querySelector('#gf-pct');
  const eg = body.querySelector('#gf-eg');
  const updateEg = () => {
    const p = Number(pctInp.value) || 0;
    const out = Math.round(4.99 * (1 + p / 100) * 100) / 100;
    eg.textContent = `Example: a ${money(4.99)} item becomes ${money(out)}`;
  };
  const syncType = () => {
    pctWrap.style.display = typeSel.value === 'shopAdj' ? '' : 'none';
    if (typeSel.value === 'shopAdj') updateEg();
  };
  typeSel.addEventListener('change', syncType);
  pctInp.addEventListener('input', updateEg);
  syncType();

  body.onclick = e => {
    const tt = e.target.closest('[data-act]');
    if (!tt) return;
    if (tt.dataset.act === 'cancel') { openSheet(groupsSheet); return; }
    if (tt.dataset.act !== 'save') return;
    const name = body.querySelector('#gf-name').value.trim();
    if (!name) { body.querySelector('#gf-err').textContent = 'Name is required'; return; }
    saveTier(Object.assign({}, t, {
      id: t.id || ('tier' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
      name,
      rule: typeSel.value === 'shopAdj'
        ? { type: 'shopAdj', pct: Math.round(Number(pctInp.value) || 0) }
        : { type: 'shop' }
    }));
    toast('Price level saved');
    openSheet(groupsSheet);
  };
}

/* ---- specials (promo prices for all customers) ---------------------- */

function specialsSheet(body) {
  const activeList = () => asList(specials()).filter(s => s && s.price != null && s.price !== '' && (!s.until || s.until >= todayStr()));
  const recFor = key => asList(specials()).find(s => s && s.key === key);

  body.innerHTML = `
    <div class="hdv-sheettitle">Specials</div>
    <div class="hdv-sheetsub">A promo price for ALL customers on a product. Clear the box to remove it.</div>
    <input class="hdv-in" id="sp-q" placeholder="Search a product to put on special…" autocomplete="off" autocapitalize="off" spellcheck="false">
    <div id="sp-res"></div>
    <div class="hdv-actions"><button class="hdv-btnP" data-act="done">Done</button></div>`;

  const res = body.querySelector('#sp-res');
  const qel = body.querySelector('#sp-q');

  const rowHtml = p => {
    const rec = recFor(p.key);
    const v = (rec && rec.price != null && rec.price !== '') ? Number(rec.price) : '';
    const shelf = (typeof p.sell === 'number' && p.sell > 0) ? 'shelf ' + money(p.sell) : 'no shelf price';
    return `<div class="hdv-row">
      <div class="hdv-info"><div class="hdv-name">${esc(p.name)}</div>
        <div class="hdv-sub">${esc(shelf)}</div></div>
      <input class="hdv-pin sp-price" data-key="${esc(p.key)}" type="number" step="0.01" min="0"
        inputmode="decimal" placeholder="promo $" value="${v}">
    </div>`;
  };

  const render = () => {
    const q = qel.value.trim();
    let list;
    if (q) list = searchCatalog(q).slice(0, 25);
    else {
      const map = new Map(catalog().map(p => [p.key, p]));
      list = activeList().map(s => map.get(s.key)).filter(Boolean);
    }
    if (!list.length) {
      res.innerHTML = emptyHTML(q ? `No products match “${esc(q)}”` : 'No specials on right now — search to add one');
      return;
    }
    res.innerHTML = (q ? '' : `<div class="hdv-sec">${list.length} on special</div>`) + list.map(rowHtml).join('');
  };
  render();

  qel.addEventListener('input', render);
  res.addEventListener('change', e => {
    const inp = e.target.closest('.sp-price');
    if (!inp) return;
    const key = inp.dataset.key;
    const p = catalog().find(x => x.key === key);
    const rec = recFor(key) || { key, name: p ? p.name : key, until: '' };
    const raw = inp.value.trim();
    rec.price = raw === '' ? null : (parseFloat(raw) || 0);
    saveSpecial(rec);
    if (!qel.value.trim()) render();
  });
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (t && t.dataset.act === 'done') closeSheet();
  };
}

/* =========================================================== MORE view */

/* Change-password sheet (v3.4): the live session authorises the change —
   built so a forgotten staff password never locks the team out. */
function changePwSheet(body) {
  const u = auth.user();
  body.innerHTML = `
    <div class="hdv-sheettitle">Change password</div>
    <div class="hdv-sheetsub">New password for <b>${esc(u ? u.name : '')}</b> (6+ characters).
      Your phone stays signed in.</div>
    <label class="hdv-lbl">New password</label>
    <input class="hdv-in" id="pw1" type="password" autocomplete="new-password">
    <label class="hdv-lbl">Type it again</label>
    <input class="hdv-in" id="pw2" type="password" autocomplete="new-password">
    <div class="hdv-err" id="pwerr"></div>
    <div class="hdv-actions">
      <button class="hdv-btnG" data-close="1">Cancel</button>
      <button class="hdv-btnP" data-pw-save>Save</button>
    </div>`;
  body.onclick = async (e) => {
    if (!e.target.closest('[data-pw-save]')) return;
    const p1 = body.querySelector('#pw1').value;
    const p2 = body.querySelector('#pw2').value;
    const err = body.querySelector('#pwerr');
    if (p1.length < 6) { err.textContent = 'Use at least 6 characters.'; return; }
    if (p1 !== p2) { err.textContent = 'The two passwords don’t match.'; return; }
    err.textContent = '';
    const btn = e.target.closest('[data-pw-save]');
    btn.disabled = true;
    try {
      await auth.changePassword(p1);
      closeSheet();
      toast('Password changed');
    } catch (ex) {
      err.textContent = ex.message || 'Could not change the password.';
      btn.disabled = false;
    }
  };
}

export function renderMore(root) {
  ensureCss();
  setActive(() => renderMore(root));

  const u = auth.user();                       // blob | email string | null
  const who = u ? String(u.email || u) : '';
  const uname = who ? who.split('@')[0] : '';

  let h = `<div class="hdv-head"><div class="hdv-h1">More</div><span class="hdv-ver-badge">${VERSION}</span></div>`;

  // account
  h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">${who ? 'Signed in' : 'Not signed in'}</div>
      <div class="hdv-count">${who ? esc(uname) : 'Sign in to sync customers &amp; orders'}</div>
    </div>
    <button class="hdv-btnG slim" data-act="${who ? 'logout' : 'login'}">
      ${who ? 'Log out' : 'Sign in'}</button>
  </div>`;

  // change password (staff only): the signed-in session authorises it, so a
  // forgotten password is recoverable from any staff phone (v3.4).
  if (who && !customerId()) h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Change password</div>
      <div class="hdv-count">Set a new password for ${esc(uname)} — no old password needed</div>
    </div>
    <button class="hdv-btnG slim" data-act="chpw">Change</button>
  </div>`;

  // sync (v3.3: the outbox makes the offline reality visible reassurance)
  const waiting = outboxCount();
  h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Sync</div>
      <div class="hdv-count">${navigator.onLine ? 'Online' : 'Offline'} · last synced ${lastSyncText()}
        · ${waiting ? `<span style="color:var(--hdv-amber);font-weight:700">syncing ${waiting}…</span>` : 'all saved'}</div>
    </div>
    <button class="hdv-btnG slim" data-act="sync">Sync now</button>
  </div>`;

  // Buying history — read-only window into V4 (staff only; data loads from the locked vault after login)
  if (who && !customerId()) h += `<div class="hdv-card" data-view="buyhist" style="cursor:pointer">
    <div class="hdv-info">
      <div class="hdv-name">📊 Buying history</div>
      <div class="hdv-count">Market runs, spend by supplier &amp; buy-price history (kg per box, price trends)</div>
    </div>
    <button class="hdv-btnG slim" data-view="buyhist">Open</button>
  </div>`;

  const isCust = !!customerId();   // customer logins see no admin tools

  // price levels
  if (!isCust) h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Price levels (customer groups)</div>
      <div class="hdv-count">Default pricing per customer type</div>
    </div>
    <button class="hdv-btnG slim" data-act="groups">Manage</button>
  </div>`;

  // stock (out today)
  if (!isCust) {
    const n = outList().length;
    h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Stock — out today</div>
      <div class="hdv-count">${n ? n + ' item' + (n === 1 ? '' : 's') + ' marked out' : 'Mark items customers can’t order today'}</div>
    </div>
    <button class="hdv-btnG slim" data-act="stock">Manage</button>
  </div>`;
  }

  // specials
  if (!isCust) h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Specials</div>
      <div class="hdv-count">Promo prices for all customers</div>
    </div>
    <button class="hdv-btnG slim" data-act="specials">Manage</button>
  </div>`;

  // broadcast
  if (!isCust) h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Message customers</div>
      <div class="hdv-count">Text a special or notice to a customer group</div>
    </div>
    <button class="hdv-btnG slim" data-act="broadcast">Open</button>
  </div>`;

  // delivery runs
  if (!isCust) h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Delivery runs &amp; cut-offs</div>
      <div class="hdv-count">When customers order by &amp; which days you deliver</div>
    </div>
    <button class="hdv-btnG slim" data-act="runs">Manage</button>
  </div>`;

  // classic app
  if (!isCust) h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Classic app</div>
      <div class="hdv-count">The original Happy Days app</div>
    </div>
    <a class="hdv-link" href="../index.html">Open ›</a>
  </div>`;

  // shop details
  h += `<div class="hdv-card" style="display:block">
    <div class="hdv-name">Happy Days Fruit Veg &amp; Grocer</div>
    <div class="hdv-count" style="margin:4px 0 10px">
      Unit 4, 684–700 Frankston-Dandenong Rd, Carrum Downs VIC 3201</div>
    <div class="hdv-kv"><span class="hdv-mut">Ravi</span>
      <a class="hdv-link" href="tel:0430033127">0430 033 127</a></div>
    <div class="hdv-kv"><span class="hdv-mut">Jas</span>
      <a class="hdv-link" href="tel:0415703336">0415 703 336</a></div>
    <div class="hdv-kv"><span class="hdv-mut">Abhi</span>
      <a class="hdv-link" href="tel:0408752385">0408 752 385</a></div>
    <div class="hdv-kv"><span class="hdv-mut">Email</span>
      <a class="hdv-link" href="mailto:happydaysgrocer@gmail.com">happydaysgrocer@gmail.com</a></div>
  </div>`;

  h += `<div class="hdv-ver">Happy Days In-House ${VERSION} · till prices synced ${PRICES_CHECKED}</div><div class="hdv-pad"></div>`;

  root.innerHTML = h;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'login') openSheet(loginSheet, { static: true });
    else if (act === 'logout') { auth.logout(); toast('Logged out'); rerenderNow(); }
    else if (act === 'chpw') openSheet(changePwSheet, { static: true });
    else if (act === 'sync') doSync(t);
    else if (act === 'runs') openSheet(runsAdminSheet);
    else if (act === 'groups') openSheet(groupsSheet);
    else if (act === 'specials') openSheet(b => specialsSheet(b), { static: true });
    else if (act === 'broadcast') openSheet(b => broadcastSheet(b), { static: true });
    else if (act === 'stock') openSheet(b => stockSheet(b), { static: true });
  };
}

/* ---- stock: mark items out for today --------------------------------- */

function stockSheet(body) {
  body.innerHTML = `
    <div class="hdv-sheettitle">Stock — out today</div>
    <div class="hdv-sheetsub">Marked items can’t be ordered today; everything resets at midnight.</div>
    <input class="hdv-in" id="st-q" placeholder="Search a product…" autocomplete="off" autocapitalize="off" spellcheck="false">
    <div id="st-res"></div>
    <div class="hdv-actions"><button class="hdv-btnP" data-act="stdone">Done</button></div>`;

  const res = body.querySelector('#st-res');
  const qel = body.querySelector('#st-q');

  const rowHtml = p => {
    const out = isOut(p.key);
    return `<div class="hdv-row">
      <div class="hdv-info"><div class="hdv-name">${esc(p.name)}</div>
        <div class="hdv-sub">${esc(p.cat)}</div></div>
      <button class="${out ? 'hdv-btnP' : 'hdv-btnG'} slim" data-act="sttog"
        data-key="${esc(p.key)}" data-name="${esc(p.name)}">${out ? 'Back in stock' : 'Out today'}</button>
    </div>`;
  };

  const render = () => {
    const q = qel.value.trim();
    let list;
    if (q) list = searchCatalog(q).slice(0, 25);
    else {
      const map = new Map(catalog().map(p => [p.key, p]));
      list = outList().map(a => map.get(a.key) || { key: a.key, name: a.name, cat: '' });
    }
    if (!list.length) {
      res.innerHTML = emptyHTML(q ? `No products match “${esc(q)}”` : 'Nothing marked out — search to mark an item');
      return;
    }
    res.innerHTML = (q ? '' : `<div class="hdv-sec">${list.length} out today</div>`) + list.map(rowHtml).join('');
  };
  render();

  qel.addEventListener('input', render);
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'stdone') { closeSheet(); return; }
    if (t.dataset.act !== 'sttog') return;
    const key = t.dataset.key;
    setOut(key, t.dataset.name, !isOut(key));
    render();
  };
}

/* ---- broadcast: message a customer group ----------------------------- */

function broadcastSheet(body) {
  let group = '';   // '' = everyone

  const render = () => {
    const msg = (body.querySelector('#bc-msg') || {}).value || '';
    const all = asList(customers());
    const list = group ? all.filter(c => c.type === group) : all;
    const withPhone = list.filter(c => String(c.phone || '').trim());

    const chips = [['', 'All'], ['cafe', 'Cafés'], ['restaurant', 'Restaurants'], ['agedcare', 'Aged care'], ['wholesale', 'Wholesale'], ['retail', 'Retail']]
      .map(([v, l]) => `<button class="hdv-chip${group === v ? ' on' : ''}" data-act="bgrp" data-g="${v}">${l}</button>`).join('');

    let rows = '';
    if (!list.length) {
      rows = emptyHTML('No customers in this group yet');
    } else {
      rows = list.map(c => {
        const phone = String(c.phone || '').trim();
        const sms = phone
          ? `<a class="hdv-link" href="sms:${esc(phone.replace(/\s+/g, ''))}${msg ? '?&body=' + encodeURIComponent(msg) : ''}">SMS ›</a>`
          : '<span class="hdv-mut" style="font-size:12px">no phone</span>';
        return `<div class="hdv-row">
          <div class="hdv-info"><div class="hdv-name">${esc(c.name)}</div>
            <div class="hdv-sub">${esc([typeLabel(c.type), phone].filter(Boolean).join(' · '))}</div></div>
          ${sms}
        </div>`;
      }).join('');
    }

    body.innerHTML = `
      <div class="hdv-sheettitle">Message customers</div>
      <div class="hdv-sheetsub">Write once, then tap SMS on each customer — or copy all numbers</div>
      <div class="hdv-chips" style="position:static;padding:8px 0">${chips}</div>
      <label class="hdv-lbl" for="bc-msg">Message</label>
      <textarea class="hdv-in" id="bc-msg" rows="3"
        placeholder="e.g. Zucchini special today — $1 each. Order by 9pm for tomorrow.">${esc(msg)}</textarea>
      <div class="hdv-sec">${withPhone.length} of ${list.length} have a phone number</div>
      ${rows}
      <div class="hdv-actions">
        <button class="hdv-btnG" data-act="bcopy">Copy numbers</button>
        <button class="hdv-btnP" data-act="bdone">Done</button>
      </div>`;
  };
  render();

  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'bgrp') { group = t.dataset.g; render(); }
    else if (act === 'bcopy') {
      const all = asList(customers());
      const list = group ? all.filter(c => c.type === group) : all;
      const nums = list.map(c => String(c.phone || '').trim()).filter(Boolean).join(', ');
      if (!nums) { toast('No phone numbers in this group'); return; }
      navigator.clipboard.writeText(nums)
        .then(() => toast('Numbers copied'))
        .catch(() => toast('Could not copy'));
    }
    else if (act === 'bdone') closeSheet();
  };
  // refresh SMS links when the message changes (links carry the body text)
  body.addEventListener('change', e => {
    if (e.target && e.target.id === 'bc-msg') render();
  });
}

function doSync(btn) {
  btn.disabled = true; btn.textContent = 'Syncing…';
  pull()
    .then(() => { setLastSync(); toast('Synced'); })
    .catch(() => toast('Sync failed — offline?'))
    .finally(() => rerenderNow());
}

function setLastSync() {
  try { localStorage.setItem('hd2.lastSync', String(Date.now())); } catch (e) { /* ignore */ }
}

function lastSyncText() {
  let t = 0;
  try { t = Number(localStorage.getItem('hd2.lastSync') || 0); } catch (e) { /* ignore */ }
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const hrs = Math.round(m / 60);
  if (hrs < 24) return hrs + ' h ago';
  return new Date(t).toLocaleDateString();
}

/* ---- login bottom-sheet (same accounts as the classic app) ------------ */

export function loginSheet(body) {
  body.innerHTML = `
    <div class="hdv-sheettitle">Sign in</div>
    <div class="hdv-sheetsub">Same account as the classic app</div>
    <label class="hdv-lbl" for="hdv-li-u">Username</label>
    <input class="hdv-in" id="hdv-li-u" autocomplete="username"
      autocapitalize="none" spellcheck="false" placeholder="username">
    <label class="hdv-lbl" for="hdv-li-p">Password</label>
    <input class="hdv-in" id="hdv-li-p" type="password"
      autocomplete="current-password" placeholder="password">
    <div class="hdv-err" id="hdv-li-err"></div>
    <div class="hdv-actions">
      <button class="hdv-btnG" data-act="cancel">Cancel</button>
      <button class="hdv-btnP" data-act="go">Sign in</button>
    </div>`;

  const err = body.querySelector('#hdv-li-err');
  const submit = async () => {
    const u = body.querySelector('#hdv-li-u').value.trim();
    const p = body.querySelector('#hdv-li-p').value;
    if (!u || !p) { err.textContent = 'Enter username and password'; return; }
    const btn = body.querySelector('[data-act="go"]');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await auth.login(u, p);
      await pull();
      setLastSync();
      closeSheet();
      toast('Signed in');
      rerenderNow();
    } catch (e2) {
      err.textContent = 'Sign-in failed — check username & password';
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  };

  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'cancel') closeSheet();
    else if (t.dataset.act === 'go') submit();
  };
  // onkeydown (not addEventListener): the sheet body is a persistent
  // singleton, so a property reassignment replaces any previous handler
  // instead of stacking one per open (Enter would submit N times).
  body.onkeydown = e => { if (e.key === 'Enter') submit(); };
}
