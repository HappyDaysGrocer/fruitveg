/* =========================================================================
   app.js — Happy Days v3 IN-HOUSE entry point
   Same architecture as v2, but: HARD LOGIN WALL (directors only, the 6
   @happydaysgrocer.app staff accounts) — nothing renders until signed in —
   and a cost/margin "Money" view fed by the locked /catalog node.
   ========================================================================= */

import { initCatalog, pull, auth, VERSION, needsPwSetup } from './store.js';
import { renderShop, setActive, openSheet } from './catalog.js';
import { renderOrders, renderMore, loginSheet, firstPwSheet } from './orders.js';
import { renderMoney } from './money.js';
import { renderBuy } from './buyrun.js';
import { renderHome } from './home.js';
import { renderBuyHist } from './buyhist.js';
import { openCommandBar } from './searchBar.js';

const VIEWS = { home: renderHome, buy: renderBuy, shop: renderShop, orders: renderOrders, money: renderMoney, more: renderMore, buyhist: renderBuyHist };

let current = 'home';

/* The shell guarantees <main id="view">; create one defensively if missing
   so a markup typo degrades gracefully instead of hard-crashing the boot. */
let viewEl = document.getElementById('view');
if (!viewEl) {
  viewEl = document.createElement('main');
  viewEl.id = 'view';
  document.body.appendChild(viewEl);
}

/* ---------- routing ---------- */

function hashView() {
  const h = (location.hash || '').replace('#', '');
  return VIEWS[h] ? h : 'home';
}

export function go(view) {
  if (!VIEWS[view]) view = 'home';
  if (view !== current) history.pushState({ view }, '', '#' + view);
  current = view;
  render();
}

window.addEventListener('popstate', (e) => {
  const v = (e.state && e.state.view) || hashView();
  current = VIEWS[v] ? v : 'home';
  render();
});

/* ---------- rendering ----------
   Called directly on navigation (go / popstate / boot). Reactive repaints
   on bus 'change' + #q input are handled by catalog.js's setActive core. */

function render() {
  setNavActive();
  // HARD LOGIN WALL — the in-house app shows nothing until a director signs in.
  if (!auth.user()) { renderLoginWall(); return; }
  document.body.classList.remove('hd3-locked');
  maybePromptPwSetup();
  try {
    VIEWS[current](viewEl);
  } catch (err) {
    console.warn('render failed for view "' + current + '"', err);
    viewEl.innerHTML =
      '<div class="hd2-error">Something went wrong loading this screen.<br>' +
      'Pull down to refresh, or tap another tab.</div>';
  }
}

/* The login gate registers itself as the active render, so the 'change'
   that auth.login() emits re-runs render() — and once signed in it paints
   the real view (which then claims the active-render slot). */
function renderLoginWall() {
  document.body.classList.add('hd3-locked');
  setActive(() => render());
  viewEl.innerHTML =
    '<div class="hd3-gate">' +
      '<img src="../happydays-wordmark.png" alt="Happy Days" class="hd3-gate-logo">' +
      '<div class="hd3-gate-title">In-house app ' + VERSION + '</div>' +
      '<div class="hd3-gate-sub">Directors &amp; staff only. Sign in to continue.</div>' +
      '<button class="hd3-gate-btn" data-act="signin">Sign in</button>' +
    '</div>';
  viewEl.onclick = (e) => {
    if (e.target.closest('[data-act="signin"]')) openSheet(loginSheet, { static: true });
  };
}

function setNavActive() {
  const ALIAS = { money: 'more' };          // Money opens from the More menu now → light up More
  const v = ALIAS[current] || current;
  document.querySelectorAll('#nav [data-view]').forEach((btn) => {
    const active = btn.dataset.view === v;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

/* First-login: prompt a new account to set its own password. needsPwSetup() is
   true only right after such a sign-in; shown once per session, deliberate
   (static sheet) so it isn't dismissed by an accidental backdrop tap. */
let _pwPromptShown = false;
function maybePromptPwSetup() {
  if (_pwPromptShown || !needsPwSetup()) return;
  _pwPromptShown = true;
  setTimeout(() => { try { openSheet(firstPwSheet, { static: true }); } catch (e) { /* ignore */ } }, 600);
}

/* ---------- skeleton shown instantly while the catalogue loads ---------- */

function showSkeleton() {
  let rows = '';
  for (let i = 0; i < 9; i++) rows += '<div class="hd2-skel-row"></div>';
  viewEl.innerHTML = '<div class="hd2-skel" aria-hidden="true">' + rows + '</div>';
}

/* ---------- toast (the app never uses alert/prompt) ---------- */

let _toastTimer = 0;
function toast(msg) {
  let el = document.querySelector('.hd2-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'hd2-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = String(msg == null ? '' : msg);
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- chrome wiring: nav, search, scroll ----------
   (The login UI lives in orders.js's MORE view — the hdv-* sheet.) */

function wireChrome() {
  // One delegated handler covers the bottom nav AND any in-view element
  // that carries data-view (e.g. a "go to orders" link in another module).
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]');
    if (nav && VIEWS[nav.dataset.view]) {
      e.preventDefault();
      go(nav.dataset.view);
    }
  });

  // v3.3 command bar: the visible ⚡ button in the header (signed-in only —
  // the gate hides the whole search wrap via body.hd3-locked).
  const cmd = document.getElementById('cmdbtn');
  if (cmd) cmd.addEventListener('click', () => { if (auth.user()) openCommandBar(); });

  // NOTE (integration): reactive re-rendering on bus 'change' and on #q
  // input is owned by the shared core in catalog.js (setActive) — it also
  // restores scroll position and refreshes any open live sheet. Wiring the
  // same triggers here would render every view twice per frame, so app.js
  // deliberately does NOT subscribe. The header-collapse scroll listener
  // likewise lives in the shell (index.html inline script).
}

/* ---------- service worker ---------- */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // SELF-HEAL after a deploy: when a freshly-activated service worker takes
  // control, reload ONCE so the page runs the new code instead of the stale
  // bundle it booted with (clients.claim swaps the controller but not the
  // already-loaded JS). Guarded two ways so it can never loop:
  //   • only armed when the page was ALREADY controlled at boot (so a brand-new
  //     install's first claim never triggers a reload), and
  //   • a one-shot flag so concurrent controllerchange events reload at most once.
  let reloading = false;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }
  // Relative to app3/index.html -> app3/sw.js, scoped to app3/.
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

/* ---------- "new version — tap to update" nudge ----------
   The SW is network-first, but a phone can still be running an OLDER service
   worker / cached bundle (the classic PWA-stuck-on-an-old-build trap). So we
   POLL the deployed store.js (cache-busted, so it bypasses ANY SW/HTTP cache)
   and compare its VERSION to the one THIS running bundle booted with. If they
   differ, the app on screen is stale — show a tap-to-update banner that clears
   the caches, drops the old service worker, and reloads fresh. */
let _updateShown = false;
async function checkForUpdate() {
  if (!navigator.onLine || _updateShown) return;
  try {
    const r = await fetch('./js/store.js?cb=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const m = (await r.text()).match(/VERSION\s*=\s*'([^']+)'/);
    if (m && m[1] && m[1] !== VERSION) showUpdateBanner(m[1]);
  } catch (e) { /* offline / blocked — ignore, try again next time */ }
}

function showUpdateBanner(ver) {
  if (_updateShown || document.getElementById('hd3-update')) return;
  _updateShown = true;
  const b = document.createElement('div');
  b.id = 'hd3-update';
  b.style.cssText = 'position:fixed;left:12px;right:12px;z-index:60;' +
    'bottom:calc(80px + env(safe-area-inset-bottom));background:#15662f;color:#fff;' +
    'border-radius:14px;padding:13px 15px;display:flex;align-items:center;gap:12px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.34);font-family:inherit;cursor:pointer';
  b.innerHTML =
    '<div style="flex:1;line-height:1.3">' +
      '<div style="font-size:14.5px;font-weight:800">✨ New version ready' + (ver ? ' (' + ver + ')' : '') + '</div>' +
      '<div style="font-size:12.5px;opacity:.9">Tap to update — just a second</div></div>' +
    '<div id="hd3-update-btn" style="flex:0 0 auto;background:rgba(255,255,255,.22);' +
      'border-radius:10px;padding:9px 15px;font-weight:800;font-size:13.5px">Update</div>';
  b.onclick = doUpdate;
  document.body.appendChild(b);
}

async function doUpdate() {
  const btn = document.getElementById('hd3-update-btn');
  if (btn) btn.textContent = 'Updating…';
  try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } } catch (e) { /* ignore */ }
  try {
    if (navigator.serviceWorker) {
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map((r) => r.unregister()));
    }
  } catch (e) { /* ignore */ }
  location.reload();
}

/* ---------- base styles for app.js-owned chrome (toast / sheet /
   skeleton). Self-contained so this module never depends on class names
   another builder may or may not have defined. ---------- */

function injectBaseStyles() {
  const css =
  '.hd2-skel-row{height:64px;border-radius:12px;margin:10px 14px;' +
    'background:linear-gradient(90deg,rgba(21,102,47,.07) 25%,rgba(21,102,47,.16) 37%,rgba(21,102,47,.07) 63%);' +
    'background-size:400% 100%;animation:hd2shimmer 1.2s ease infinite}' +
  '@keyframes hd2shimmer{0%{background-position:100% 0}100%{background-position:0 0}}' +
  '.hd2-error{margin:32px 16px;padding:20px;border-radius:12px;text-align:center;' +
    'background:rgba(185,28,28,.08);color:#b91c1c;font-size:15px;line-height:1.5}' +
  '.hd2-toast{position:fixed;left:50%;bottom:calc(76px + env(safe-area-inset-bottom));' +
    'transform:translate(-50%,16px);background:#0d2818;color:#fff;padding:11px 20px;' +
    'border-radius:999px;font-size:14px;opacity:0;pointer-events:none;' +
    'transition:opacity .25s,transform .25s;z-index:1000;max-width:88vw;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.28)}' +
  '.hd2-toast.show{opacity:1;transform:translate(-50%,0)}' +
  // login gate (in-house): hide the search + bottom nav until signed in
  'body.hd3-locked .searchwrap,body.hd3-locked .nav{display:none}' +
  '.hd3-gate{display:flex;flex-direction:column;align-items:center;text-align:center;' +
    'gap:8px;padding:48px 26px}' +
  '.hd3-gate-logo{height:78px;background:#fff;padding:8px 14px;border-radius:14px;' +
    'box-shadow:0 2px 10px rgba(13,40,24,.15)}' +
  '.hd3-gate-title{font-size:21px;font-weight:800;color:#15662f;margin-top:16px}' +
  '.hd3-gate-sub{font-size:14px;color:#5b6e62;max-width:280px;line-height:1.45}' +
  '.hd3-gate-btn{margin-top:18px;width:100%;max-width:280px;min-height:48px;border:0;' +
    'border-radius:12px;background:#15662f;color:#fff;font-size:16px;font-weight:700;cursor:pointer}' +
  '@media (prefers-color-scheme:dark){' +
    '.hd2-toast{background:#e6f0e8;color:#0d2818}' +
    '.hd2-error{background:rgba(252,165,165,.12);color:#fca5a5}' +
    '.hd3-gate-title{color:#7ac794}' +
  '}';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/* ---------- shared helpers for the other modules ---------- */

window.HD = { go, toast, forceUpdate: doUpdate };   // forceUpdate = clear caches + drop SW + reload (More → Update)

/* ---------- boot ---------- */

async function boot() {
  injectBaseStyles();
  showSkeleton();        // paint something within the first frame
  wireChrome();
  registerSW();

  current = hashView();
  history.replaceState({ view: current }, '', '#' + current);

  try { await initCatalog(); } catch (e) { /* store falls back to cache */ }
  render();              // first real paint from local mirrors (offline-first)
  pull();                // background refresh; bus 'change' repaints when done

  setTimeout(checkForUpdate, 3000);   // once the app has settled, see if a newer build is live
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
}

boot();
