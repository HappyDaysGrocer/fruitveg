/* Happy Days v2 — orders.js
   ORDERS view (customer cards -> take-order screen with tier pricing,
   review sheet, complete) and MORE view (login, sync, classic-app link,
   shop details). Reuses the UI kit + reactive core from catalog.js. */

import {
  catalog, categories, searchCatalog,
  customers, orders, tiers,
  saveCustomer, saveOrder, ensureOpenOrder, tierPrice,
  auth, pull
} from './store.js';

import {
  setActive, rerenderNow,
  openSheet, closeSheet, refreshSheet,
  toast, shareText,
  esc, money, asList, qText, todayStr,
  chipsHTML, stepperHTML, emptyHTML, ensureCss
} from './catalog.js';

/* ------------------------------------------------------- view state */

let mode = 'list';   // 'list' (customer cards) | 'take' (take-order screen)
let curId = null;    // customer id when mode === 'take'
let takeCat = '';    // category chip on the take-order screen

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

/* ========================================================= ORDERS view */

export function renderOrders(root) {
  ensureCss();
  setActive(() => renderOrders(root));
  const cust = mode === 'take'
    ? asList(customers()).find(c => c && c.id === curId)
    : null;
  if (mode === 'take' && cust) renderTake(root, cust);
  else { mode = 'list'; renderCustomers(root); }
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
    <button class="hdv-btnG slim" data-act="newcust">+ New customer</button>
  </div>`;

  if (!list.length) {
    h += emptyHTML(q
      ? `No customers match “${esc(qText())}”`
      : 'No customers yet — add your first one');
  }

  for (const c of list) {
    const t = tm[c.tierId];
    const open = openOrderOf(c.id);
    const n = open && Array.isArray(open.lines) ? open.lines.length : 0;
    h += `<div class="hdv-card" data-act="cust" data-id="${esc(c.id)}">
      <div class="hdv-info">
        <div class="hdv-name">${esc(c.name || '(unnamed)')}</div>
        <div class="hdv-count">${
          n ? `${n} item${n === 1 ? '' : 's'} on open order` : 'No open order'
        }${c.phone ? ' · ' + esc(c.phone) : ''}</div>
      </div>
      <span class="hdv-tchip">${esc(t ? t.name : (c.tierId || 'retail'))}</span>
    </div>`;
  }
  h += '<div class="hdv-pad"></div>';

  root.innerHTML = h;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'cust') {
      mode = 'take'; curId = t.dataset.id; takeCat = '';
      clearSearch(); rerenderNow();
    } else if (t.dataset.act === 'newcust') {
      openSheet(newCustomerSheet, { static: true });
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
  if (takeCat) list = list.filter(p => p.cat === takeCat);

  let h = `<div class="hdv-back">
    <button class="hdv-backbtn" data-act="back">‹ Customers</button>
    <div class="hdv-info"><div class="hdv-name">${esc(cust.name)}</div></div>
    <span class="hdv-tchip">${esc(t ? t.name : (cust.tierId || ''))}</span>
  </div>`;

  h += chipsHTML(categories(), takeCat);

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
    for (const c of (takeCat ? [takeCat] : categories())) {
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
    else if (act === 'review') openSheet(b => reviewSheet(b, cust.id));
  };
}

/* One product row on the take-order screen: name + the CUSTOMER tier
   price (tap to edit once a line exists) + stepper bound to order lines. */
function takeRow(p, line, cust) {
  const qty = line ? (Number(line.qty) || 0) : 0;
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
  const sub = [p.cat, (typeof p.sell === 'number' && p.sell > 0) ? 'shop ' + money(p.sell) : '']
    .filter(Boolean).join(' · ');
  return `<div class="hdv-row${qty > 0 ? ' sel' : ''}">
    <div class="hdv-info">
      <div class="hdv-name">${esc(p.name)}</div>
      ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
    </div>
    ${priceHtml}
    ${stepperHTML(p.key, qty)}
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

/* ---- review sheet (lines, qty/price edit, Share, Complete) ------------ */

function reviewSheet(body, custId) {
  const cust = asList(customers()).find(c => c && c.id === custId) || { id: custId, name: '?' };
  const o = openOrderOf(custId);
  const lines = o && Array.isArray(o.lines) ? o.lines : [];
  const total = orderTotal(lines);
  const needPrice = lines.some(l => l.price === '' || l.price == null);

  let h = `<div class="hdv-sheettitle">${esc(cust.name)}</div>
    <div class="hdv-sheetsub">Open order · ${esc((o && o.date) || todayStr())}</div>`;

  if (!lines.length) {
    h += emptyHTML('No lines on this order yet');
  } else {
    h += lines.map(l => {
      const lq = Number(l.qty) || 0;
      const priceHtml = (l.price === '' || l.price == null)
        ? `<span class="hdv-red" data-act="price" data-key="${esc(l.key)}">SET&nbsp;PRICE</span>`
        : `<span class="hdv-price" data-act="price" data-key="${esc(l.key)}">${money(Number(l.price))}</span>`;
      return `<div class="hdv-row">
        <div class="hdv-info">
          <div class="hdv-name">${esc(l.name)}</div>
          <div class="hdv-sub">${l.src === 'manual' ? 'manual price' : 'tier price'}
            · line ${money(lq * (Number(l.price) || 0))}</div>
        </div>
        ${priceHtml}
        ${stepperHTML(l.key, lq)}
      </div>`;
    }).join('');
    h += `<div class="hdv-total"><span>Total</span><span>${money(total)}</span></div>`;
    if (needPrice) h += '<div class="hdv-err">Some lines still need a price</div>';
    h += `<div class="hdv-actions">
      <button class="hdv-btnG" data-act="share">Share</button>
      <button class="hdv-btnP" data-act="complete">Complete</button>
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
    else if (act === 'complete') completeOrder(custId);
  };
}

function completeOrder(custId) {
  const o = openOrderOf(custId);
  if (!o || !(o.lines || []).length) { toast('Nothing to complete'); return; }
  o.status = 'completed';
  o.completed = todayStr();
  saveOrder(o);                 // patches /custorders, emits 'change'
  closeSheet();
  mode = 'list'; curId = null; clearSearch();
  toast('Order completed');
  rerenderNow();
}

function orderText(cust, o) {
  if (!o) return '';
  const rows = (o.lines || []).map(l => {
    const lp = Number(l.price) || 0, lq = Number(l.qty) || 0;
    return `${lq} x ${l.name}` + (lp ? ` @ ${money(lp)} = ${money(lp * lq)}` : '');
  });
  return `Happy Days — order for ${cust ? cust.name : ''} (${o.date || todayStr()})\n` +
    rows.join('\n') +
    `\nTotal: ${money(orderTotal(o.lines))}` +
    '\n\nHappy Days Fruit, Veg & Grocery · 0430 033 127';
}

/* ---- new-customer mini-form (name / phone / tier) --------------------- */

function newCustomerSheet(body) {
  const tlist = asList(tiers());
  const opts = (tlist.length ? tlist : [{ id: 'retail', name: 'retail' }])
    .map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');

  body.innerHTML = `
    <div class="hdv-sheettitle">New customer</div>
    <label class="hdv-lbl" for="hdv-nc-name">Name</label>
    <input class="hdv-in" id="hdv-nc-name" placeholder="e.g. Corner Cafe" autocomplete="off">
    <label class="hdv-lbl" for="hdv-nc-phone">Phone</label>
    <input class="hdv-in" id="hdv-nc-phone" type="tel" placeholder="04xx xxx xxx" autocomplete="off">
    <label class="hdv-lbl" for="hdv-nc-tier">Price tier</label>
    <select class="hdv-in" id="hdv-nc-tier">${opts}</select>
    <div class="hdv-err" id="hdv-nc-err"></div>
    <div class="hdv-actions">
      <button class="hdv-btnG" data-act="cancel">Cancel</button>
      <button class="hdv-btnP" data-act="save">Save customer</button>
    </div>`;

  body.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'cancel') { closeSheet(); return; }
    if (t.dataset.act !== 'save') return;
    const name = body.querySelector('#hdv-nc-name').value.trim();
    if (!name) {
      body.querySelector('#hdv-nc-err').textContent = 'Name is required';
      return;
    }
    saveCustomer({
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      phone: body.querySelector('#hdv-nc-phone').value.trim(),
      tierId: body.querySelector('#hdv-nc-tier').value,
      address: '', contact: '', prices: {}
    });                                   // emits 'change' -> list re-renders
    closeSheet();
    toast('Customer added');
  };
}

/* =========================================================== MORE view */

export function renderMore(root) {
  ensureCss();
  setActive(() => renderMore(root));

  const u = auth.user();                       // blob | email string | null
  const who = u ? String(u.email || u) : '';
  const uname = who ? who.split('@')[0] : '';

  let h = `<div class="hdv-head"><div class="hdv-h1">More</div></div>`;

  // account
  h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">${who ? 'Signed in' : 'Not signed in'}</div>
      <div class="hdv-count">${who ? esc(uname) : 'Sign in to sync customers &amp; orders'}</div>
    </div>
    <button class="hdv-btnG slim" data-act="${who ? 'logout' : 'login'}">
      ${who ? 'Log out' : 'Sign in'}</button>
  </div>`;

  // sync
  h += `<div class="hdv-card">
    <div class="hdv-info">
      <div class="hdv-name">Sync</div>
      <div class="hdv-count">${navigator.onLine ? 'Online' : 'Offline'} · last synced ${lastSyncText()}</div>
    </div>
    <button class="hdv-btnG slim" data-act="sync">Sync now</button>
  </div>`;

  // classic app
  h += `<div class="hdv-card">
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

  h += '<div class="hdv-ver">Happy Days v2.0.0</div><div class="hdv-pad"></div>';

  root.innerHTML = h;
  root.onclick = e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'login') openSheet(loginSheet, { static: true });
    else if (act === 'logout') { auth.logout(); toast('Logged out'); rerenderNow(); }
    else if (act === 'sync') doSync(t);
  };
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

function loginSheet(body) {
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
