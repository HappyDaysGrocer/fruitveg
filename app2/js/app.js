/* =========================================================================
   app.js — Happy Days v2 entry point (Builder B)
   Boot sequence, routing (history-based), bottom-nav, search wiring,
   login bottom-sheet, toast helper. Exposes window.HD = { go, toast }.
   ========================================================================= */

import { initCatalog, pull } from './store.js';
import { renderShop } from './catalog.js';
import { renderOrders, renderMore } from './orders.js';

const VIEWS = { shop: renderShop, orders: renderOrders, more: renderMore };

let current = 'shop';

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
  return VIEWS[h] ? h : 'shop';
}

export function go(view) {
  if (!VIEWS[view]) view = 'shop';
  if (view !== current) history.pushState({ view }, '', '#' + view);
  current = view;
  render();
}

window.addEventListener('popstate', (e) => {
  const v = (e.state && e.state.view) || hashView();
  current = VIEWS[v] ? v : 'shop';
  render();
});

/* ---------- rendering ----------
   Called directly on navigation (go / popstate / boot). Reactive repaints
   on bus 'change' + #q input are handled by catalog.js's setActive core. */

function render() {
  setNavActive();
  try {
    VIEWS[current](viewEl);
  } catch (err) {
    console.warn('render failed for view "' + current + '"', err);
    viewEl.innerHTML =
      '<div class="hd2-error">Something went wrong loading this screen.<br>' +
      'Pull down to refresh, or tap another tab.</div>';
  }
}

function setNavActive() {
  document.querySelectorAll('[data-view]').forEach((btn) => {
    const active = btn.dataset.view === current;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
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

  // NOTE (integration): reactive re-rendering on bus 'change' and on #q
  // input is owned by the shared core in catalog.js (setActive) — it also
  // restores scroll position and refreshes any open live sheet. Wiring the
  // same triggers here would render every view twice per frame, so app.js
  // deliberately does NOT subscribe. The header-collapse scroll listener
  // likewise lives in the shell (index.html inline script).
}

/* ---------- service worker ---------- */

function registerSW() {
  if ('serviceWorker' in navigator) {
    // Relative to app2/index.html -> app2/sw.js, scoped to app2/.
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  }
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
  '@media (prefers-color-scheme:dark){' +
    '.hd2-toast{background:#e6f0e8;color:#0d2818}' +
    '.hd2-error{background:rgba(252,165,165,.12);color:#fca5a5}' +
  '}';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/* ---------- shared helpers for the other modules ---------- */

window.HD = { go, toast };

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
}

boot();
