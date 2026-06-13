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

import { shareInvoice } from './pdfinvoice.js';

/* Business + payment details — one source for the text invoice and the PDF.
   (Trading name only; the legal entity is intentionally not shown.) */
const BIZ = {
  name: 'Happy Days Fruit, Veg & Grocery',
  abn: '95 688 893 156',
  addr: 'Unit 4, 684-700 Frankston-Dandenong Rd, Carrum Downs VIC 3201',
  phone: '0430 033 127',
  email: 'happydaysgrocer@gmail.com',
  bsb: '063-118',
  acc: '10669177'
};

/* ------------------------------------------------------- view state */

let mode = 'list';   // 'list' (customer cards) | 'take' (take-order screen)
let curId = null;    // customer id when mode === 'take'
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
    <div style="display:flex;gap:8px">
      <button class="hdv-btnG slim" data-act="picking">Picking</button>
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
    const meta = [
      c.type ? typeLabel(c.type) : '',
      n ? `${n} item${n === 1 ? '' : 's'} on open order` : 'No open order',
      c.phone ? esc(c.phone) : ''
    ].filter(Boolean).join(' · ');
    return `<div class="hdv-card" data-act="cust" data-id="${esc(c.id)}">
      <div class="hdv-info">
        <div class="hdv-name">${esc(c.name || '(unnamed)')}</div>
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
    if (t.dataset.act === 'cust') {
      mode = 'take'; curId = t.dataset.id; takeCat = '';
      clearSearch(); rerenderNow();
    } else if (t.dataset.act === 'edit') {
      const c = asList(customers()).find(x => x && x.id === t.dataset.id);
      if (c) openSheet(b => customerSheet(b, c), { static: true });
    } else if (t.dataset.act === 'newcust') {
      openSheet(b => customerSheet(b, null), { static: true });
    } else if (t.dataset.act === 'picking') {
      openSheet(pickingSheet);
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
    else if (act === 'price') editPriceInline(t2, cust, key);
    else if (act === 'addkg' || act === 'editkg') editWeightInline(t2, cust, key);
    else if (act === 'editcust') openSheet(b => customerSheet(b, cust), { static: true });
    else if (act === 'prices') openSheet(b => pricesSheet(b, cust.id), { static: true });
    else if (act === 'history') openSheet(b => historySheet(b, cust.id));
    else if (act === 'standing') openSheet(b => standingSheet(b, cust), { static: true });
    else if (act === 'review') openSheet(b => reviewSheet(b, cust.id));
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
    const tp = tierPrice(cust.id, p.key);
    priceHtml = tp === 'SETCOST'
      ? '<span class="hdv-red">SET&nbsp;COST</span>'
      : `<span class="hdv-price dim">${typeof tp === 'number' ? money(tp) : '—'}</span>`;
  }
  const onSpecial = !!specialFor(p.key);
  const out = isOut(p.key);
  const sub = [p.cat, (typeof p.sell === 'number' && p.sell > 0) ? 'shop ' + money(p.sell) : '']
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
    // the stepper so the line can still be reduced/removed.
    stepper = (out && qty === 0) ? '' : stepperHTML(p.key, qty);
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
    const tp = tierPrice(cust.id, key);
    o.lines.push({
      key, name: p.name, sup: p.cat, unit: '',
      qty: delta,
      price: typeof tp === 'number' ? tp : '',   // '' until manually set
      src: 'tier'
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
    const tp = tierPrice(cust.id, key);
    line = { key, name: p ? p.name : key, sup: p ? p.cat : '', unit: 'kg', qty: 0,
      price: typeof tp === 'number' ? tp : '', src: 'tier' };
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

  const isRestoOrCafe = ['restaurant', 'cafe'].includes(cust.tierId);
  const tqStatus = o ? tillQueueStatus(o.id) : null;
  const hasCosts = secureLoaded();

  if (!lines.length) {
    h += emptyHTML('No lines on this order yet');
  } else {
    let totalCost = 0, totalSell = 0;
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
          const pct = Math.round((margin / lSell) * 100);
          totalCost += lCost;
          totalSell += lSell;
          marginHtml = `<div class="hdv-margin ${pct < 20 ? 'hdv-margin-low' : ''}">${pct}% · ${money(margin)}</div>`;
        } else {
          totalSell += lSell;
        }
      }
      return `<div class="hdv-row">
        <div class="hdv-info">
          <div class="hdv-name">${esc(l.name)}</div>
          <div class="hdv-sub">${l.src === 'manual' ? 'manual price' : 'tier price'}
            · line ${money(lSell)}</div>
          ${marginHtml}
        </div>
        ${priceHtml}
        ${stepperHTML(l.key, lq)}
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

    // Till queue status badge
    if (tqStatus) {
      const statusLabel = { queued: 'Queued for till', sent: 'Sent to till', error: 'Till error' }[tqStatus.status] || tqStatus.status;
      const statusCls = tqStatus.status === 'error' ? 'hdv-tq-error' : tqStatus.status === 'sent' ? 'hdv-tq-sent' : 'hdv-tq-queued';
      h += `<div class="hdv-tq-status ${statusCls}">${statusLabel}${tqStatus.error ? ' — ' + esc(tqStatus.error) : ''}</div>`;
    }

    h += `<div class="hdv-actions">
      <button class="hdv-btnG slim" data-act="share">Text</button>
      <button class="hdv-btnG slim" data-act="invpdf">PDF</button>
      ${isRestoOrCafe ? `<button class="hdv-btnB" data-act="sendtill">Send to till</button>` : ''}
      <button class="hdv-btnP" data-act="complete">Place order</button>
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
    else if (act === 'price') editPriceInline(t, c, key);
    else if (act === 'share') shareText(orderText(c, openOrderOf(custId)));
    else if (act === 'invpdf') {
      const o = openOrderOf(custId);
      if (!o || !(o.lines || []).length) { toast('No lines yet'); return; }
      const invNo = orderRef(o);
      shareInvoice(invoiceData(invNo, c, o)).then(s => {
        if (s === 'downloaded') toast('Invoice PDF saved');
      }).catch(() => toast('Could not make the PDF'));
    }
    else if (act === 'complete') completeOrder(custId);
    else if (act === 'sendtill') sendToTill(c, openOrderOf(custId));
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
  o.deliveryDate = delDate;
  o.runId = cust.runId || '';
  if (!o.orderNo) o.orderNo = makeOrderNo(delDate);
  saveOrder(o);                      // patches /custorders, emits 'change'
  closeSheet();
  mode = 'list'; curId = null; clearSearch();
  toast('Order placed · ' + o.orderNo);
  rerenderNow();
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
  let h = `<div class="hdv-sheettitle">Order history · ${esc(cust.name)}</div>`;
  if (!list.length) {
    h += emptyHTML('No past orders yet');
  } else {
    h += list.map(o => {
      const n = Array.isArray(o.lines) ? o.lines.length : 0;
      return `<div class="hdv-row">
        <div class="hdv-info">
          <div class="hdv-name">${esc(o.orderNo || 'Order')} · ${money(orderTotal(o.lines))}</div>
          <div class="hdv-sub">${o.deliveryDate ? 'deliver ' + esc(niceDate(o.deliveryDate)) : esc(o.completed || '')} · ${n} item${n === 1 ? '' : 's'}</div>
        </div>
        <button class="hdv-btnG slim" data-act="inv" data-id="${esc(o.id)}">Invoice</button>
        <button class="hdv-btnG slim" data-act="again" data-id="${esc(o.id)}">Again</button>
      </div>`;
    }).join('');
  }
  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const src = asList(orders()).find(o => o && o.id === t.dataset.id);
    if (!src) return;
    if (t.dataset.act === 'again') reorder(custId, src);
    else if (t.dataset.act === 'inv') openSheet(b => invoiceSheet(b, custId, src.id));
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
  h += lines.map(l => {
    const lq = Number(l.qty) || 0, lp = Number(l.price) || 0;
    return `<div class="hdv-row">
      <div class="hdv-info"><div class="hdv-name">${esc(l.name)}</div>
        <div class="hdv-sub">${lq} × ${money(lp)}</div></div>
      <span class="hdv-price">${money(lq * lp)}</span>
    </div>`;
  }).join('');
  h += `<div class="hdv-total"><span>Total (GST-free)</span><span>${money(total)}</span></div>`;
  h += `<div class="hdv-sub" style="padding:6px 0 0">Payment: BSB ${BIZ.bsb} · Acc ${BIZ.acc} · Ref ${esc(invNo)}</div>`;
  if (cust.terms) h += `<div class="hdv-sub" style="padding:2px 0">Terms: ${esc(cust.terms === 'COD' ? 'Pay on delivery' : cust.terms.replace('days', ' days'))}</div>`;
  h += `<div class="hdv-actions">
    <button class="hdv-btnG slim" data-act="ishare">Text</button>
    <button class="hdv-btnG slim" data-act="idone">Done</button>
    <button class="hdv-btnP" data-act="ipdf">Share PDF</button>
  </div>`;

  body.innerHTML = h;
  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'ishare') shareText(invoiceText(invNo, cust, o));
    else if (t.dataset.act === 'ipdf') {
      shareInvoice(invoiceData(invNo, cust, o)).then(s => {
        if (s === 'downloaded') toast('Invoice PDF saved');
      }).catch(() => toast('Could not make the PDF'));
    }
    else if (t.dataset.act === 'idone') closeSheet();
  };
}

function invoiceTerms(cust) {
  return cust.terms === 'COD' ? 'Pay on delivery'
    : cust.terms ? 'Payment terms: ' + cust.terms.replace('days', ' days') : '';
}

/* Data object shared with the PDF generator (pdfinvoice.js). */
function invoiceData(invNo, cust, o) {
  return {
    biz: BIZ,
    invNo,
    date: niceDate(o.completed || o.deliveryDate || todayStr()),
    customer: cust.name || '',
    deliver: o.deliveryDate ? niceDate(o.deliveryDate) : '',
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
    return `${lq} x ${l.name} @ ${money(lp)} = ${money(lq * lp)}`;
  });
  const total = orderTotal(o.lines);
  return [
    'TAX INVOICE ' + invNo,
    BIZ.name,
    'ABN ' + BIZ.abn,
    BIZ.addr,
    'Ph ' + BIZ.phone + ' · ' + BIZ.email,
    '',
    'Bill to: ' + (cust.name || ''),
    o.deliveryDate ? 'Delivery date: ' + niceDate(o.deliveryDate) : '',
    'Order: ' + (o.orderNo || o.id),
    '',
    lines.join('\n'),
    '',
    'TOTAL: ' + money(total) + '  (all items GST-free)',
    '',
    'Payment: BSB ' + BIZ.bsb + '  Acc ' + BIZ.acc + '  Ref ' + invNo,
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
      h += `<div class="hdv-sec">${esc(custName(o.custId))}${o.orderNo ? ' · ' + esc(o.orderNo) : ''}</div>`;
      h += (o.lines || []).map(l => `<div class="hdv-row"><div class="hdv-info"><div class="hdv-name">${esc(l.name)}</div></div><span class="hdv-price">${Number(l.qty) || 0}</span></div>`).join('');
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
        (o.lines || []).map(l => `${Number(l.qty) || 0} x ${l.name}`).join('\n') + '\n';
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
    return `${lq} x ${l.name}` + (lp ? ` @ ${money(lp)} = ${money(lp * lq)}` : '');
  });
  return `Happy Days — order for ${cust ? cust.name : ''}` +
    (o.orderNo ? ` (${o.orderNo})` : '') +
    (del ? `\nFor delivery: ${niceDate(del)}` : '') + '\n' +
    rows.join('\n') +
    `\nTotal: ${money(orderTotal(o.lines))}` +
    '\n\nHappy Days Fruit, Veg & Grocery · 0430 033 127';
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
    <div class="hdv-name">Happy Days Fruit, Veg &amp; Grocery</div>
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
