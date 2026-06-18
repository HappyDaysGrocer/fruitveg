/* Happy Days v3 (in-house) — home.js
   Operational OVERVIEW dashboard. MONEY-FREE BY DESIGN: no sales / cost / profit
   figures ever — all $ lives in V4 only (owner rule, see app-v3-directive). This
   shows at-a-glance OPERATIONAL counts (orders, buy run, stock, customers) and is
   one tap into each area. Reuses the hdv-* kit; cards navigate via data-view, which
   app.js's delegated handler turns into go(view). */

import {
  catalog, customers, orders, buyRunList, outList, standingList,
  tillqueue, stockFor, auth, VERSION
} from './store.js';
import { setActive, esc, ensureCss, asList, todayStr } from './catalog.js';

let homeCssDone = false;
function ensureHomeCss() {
  if (homeCssDone || document.getElementById('hdv-home-css')) { homeCssDone = true; return; }
  homeCssDone = true;
  const st = document.createElement('style');
  st.id = 'hdv-home-css';
  st.textContent = `
.hdv-greet{padding:16px 12px 4px}
.hdv-greet .g1{font-size:22px;font-weight:800;color:var(--hdv-text)}
.hdv-greet .g2{font-size:13px;color:var(--hdv-sub);margin-top:3px}
.hdv-dashgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px;padding:10px 12px}
.hdv-dcard{background:var(--hdv-card);border:1px solid var(--hdv-line);border-radius:14px;
  padding:15px 16px;text-align:left;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;
  gap:5px;min-height:108px;box-shadow:0 1px 4px rgba(13,40,24,.06);
  transition:transform .12s ease,box-shadow .12s ease;-webkit-tap-highlight-color:transparent}
.hdv-dcard:active{transform:scale(.98)}
.hdv-dcard:hover{box-shadow:0 5px 16px rgba(13,40,24,.13)}
.hdv-dcard .top{display:flex;align-items:center;justify-content:space-between}
.hdv-dcard .ico{font-size:20px;line-height:1}
.hdv-dcard .arrow{color:var(--hdv-sub);font-size:16px;font-weight:700}
.hdv-dnum{font-size:34px;font-weight:800;line-height:1.05;color:var(--hdv-text);font-variant-numeric:tabular-nums}
.hdv-dnum.alert{color:var(--hdv-red)}
.hdv-dlbl{font-size:13.5px;font-weight:700;color:var(--hdv-text)}
.hdv-dsub{font-size:12px;color:var(--hdv-sub)}
.hdv-dsub.amber{color:var(--hdv-amber);font-weight:700}
.hdv-dsub.blue{color:var(--hdv-blue);font-weight:700}
`;
  document.head.appendChild(st);
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

function card(o) {
  return `<button class="hdv-dcard" data-view="${esc(o.view)}">
    <div class="top"><span class="ico">${o.ico}</span><span class="arrow">&rsaquo;</span></div>
    <div class="hdv-dnum${o.alert ? ' alert' : ''}">${o.num}</div>
    <div class="hdv-dlbl">${esc(o.label)}</div>
    ${o.sub ? `<div class="hdv-dsub${o.subClass ? ' ' + o.subClass : ''}">${esc(o.sub)}</div>` : ''}
  </button>`;
}

export function renderHome(root) {
  ensureCss();
  ensureHomeCss();
  setActive(() => renderHome(root));

  const cat = catalog();
  const open = asList(orders()).filter(o => o && o.status === 'open' && (o.lines || []).length);
  let toPrice = 0;
  for (const o of open) for (const l of (o.lines || [])) if (l && (l.price === '' || l.price == null)) toPrice++;
  const br = buyRunList();
  const brItems = br.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const out = outList().length;
  const today = todayStr();
  let counted = 0;
  for (const p of cat) { const s = stockFor(p.key); if (s && s.at === today) counted++; }
  const reviewN = cat.filter(p => p.review).length;
  const standing = standingList().length;
  const custN = asList(customers()).length;
  const tq = asList(tillqueue()).filter(x => x && (x.status === 'queued' || x.status === 'error')).length;

  const u = (auth.user && auth.user()) || null;
  const first = u && u.email ? String(u.email).split('@')[0].split(/[._-]/)[0] : '';
  const niceName = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  let dateStr = '';
  try { dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }); }
  catch (e) { dateStr = today; }

  let h = `<div class="hdv-greet">
    <div class="g1">${esc(greeting())}${niceName ? ', ' + esc(niceName) : ''}</div>
    <div class="g2">${esc(dateStr)} &middot; Happy Days In-House ${esc(VERSION)}</div>
  </div>`;

  h += '<div class="hdv-dashgrid">';
  h += card({ view: 'orders', ico: '🧾', num: open.length, label: 'Open orders',
    sub: toPrice ? plural(toPrice, 'item') + ' need a price' : (open.length ? 'all priced' : 'none open'),
    subClass: toPrice ? 'amber' : '' });
  h += card({ view: 'buy', ico: '🛒', num: br.length, label: 'Buy run',
    sub: brItems ? plural(brItems, 'item') + ' to buy' : 'nothing to buy' });
  h += card({ view: 'shop', ico: '⛔', num: out, alert: out > 0, label: 'Out of stock',
    sub: out ? 'marked out today' : 'all in stock' });
  h += card({ view: 'shop', ico: '📦', num: counted, label: 'Counted today',
    sub: counted ? 'products counted' : 'no count yet today' });
  h += card({ view: 'orders', ico: '👥', num: custN, label: 'Customers',
    sub: standing ? plural(standing, 'standing order') : 'no standing orders' });
  h += card({ view: 'shop', ico: '🍎', num: cat.length, label: 'Products',
    sub: reviewN ? reviewN + ' new to review' : 'in the catalogue', subClass: reviewN ? 'blue' : '' });
  if (tq) h += card({ view: 'orders', ico: '📤', num: tq, alert: true, label: 'Till queue', sub: 'waiting to send' });
  h += '</div>';

  h += '<div class="hdv-pad"></div>';
  root.innerHTML = h;
  root.onclick = null;   // navigation is handled by app.js's delegated [data-view] handler
}
