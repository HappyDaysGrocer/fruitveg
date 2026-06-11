/* =========================================================================
   app.js — Happy Days v2 entry point (Builder B)
   Boot sequence, routing (history-based), bottom-nav, search wiring,
   login bottom-sheet, toast helper. Exposes window.HD = { go, toast }.
   ========================================================================= */

import { initCatalog, pull, auth } from './store.js';
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

/* ---------- login bottom-sheet ---------- */

function closeSheet() {
  const open = document.querySelector('.hd2-sheet-wrap');
  if (open) open.remove();
}

function openLoginSheet() {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'hd2-sheet-wrap';
  wrap.innerHTML =
    '<div class="hd2-backdrop" data-close></div>' +
    '<form class="hd2-sheet" novalidate>' +
      '<div class="hd2-sheet-handle"></div>' +
      '<h2 class="hd2-sheet-title">Sign in</h2>' +
      '<label class="hd2-field">Username' +
        '<input name="u" type="text" inputmode="text" autocapitalize="none" ' +
        'autocorrect="off" spellcheck="false" autocomplete="username" required>' +
      '</label>' +
      '<label class="hd2-field">Password' +
        '<input name="p" type="password" autocomplete="current-password" required>' +
      '</label>' +
      '<div class="hd2-login-err" hidden></div>' +
      '<div class="hd2-sheet-actions">' +
        '<button type="button" class="hd2-btn hd2-btn-ghost" data-close>Cancel</button>' +
        '<button type="submit" class="hd2-btn">Sign in</button>' +
      '</div>' +
    '</form>';
  document.body.appendChild(wrap);

  const form = wrap.querySelector('form');
  const errEl = wrap.querySelector('.hd2-login-err');
  const submitBtn = wrap.querySelector('button[type=submit]');

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet();
  });
  const onKey = (e) => { if (e.key === 'Escape') { closeSheet(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = form.u.value.trim();
    const p = form.p.value;
    if (!u || !p) {
      errEl.textContent = 'Enter your username and password.';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    try {
      const user = await auth.login(u, p);
      closeSheet();
      document.removeEventListener('keydown', onKey);
      toast('Signed in as ' + (user ? user.name : u));
      pull(); // refresh customers/orders/tiers; bus 'change' re-renders
    } catch (err) {
      errEl.textContent = err && err.message ? err.message : 'Could not sign in.';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  });

  setTimeout(() => { try { form.u.focus(); } catch (e) { /* iOS quirk */ } }, 50);
}

/* ---------- chrome wiring: nav, search, scroll ---------- */

function wireChrome() {
  // One delegated handler covers the bottom nav AND any in-view element
  // that carries data-view (e.g. a "go to orders" link in another module).
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]');
    if (nav && VIEWS[nav.dataset.view]) {
      e.preventDefault();
      go(nav.dataset.view);
      return;
    }
    // Any element with data-login opens the sign-in sheet.
    if (e.target.closest('[data-login]')) {
      e.preventDefault();
      openLoginSheet();
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
  '.hd2-sheet-wrap{position:fixed;inset:0;z-index:900}' +
  '.hd2-backdrop{position:absolute;inset:0;background:rgba(13,40,24,.45);animation:hd2fade .2s ease}' +
  '@keyframes hd2fade{from{opacity:0}to{opacity:1}}' +
  '.hd2-sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;color:#0d2818;' +
    'border-radius:16px 16px 0 0;padding:10px 20px calc(24px + env(safe-area-inset-bottom));' +
    'box-shadow:0 -8px 30px rgba(0,0,0,.18);max-height:85vh;overflow:auto;' +
    'animation:hd2up .25s ease}' +
  '@keyframes hd2up{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}' +
  '.hd2-sheet-handle{width:40px;height:4px;border-radius:2px;background:rgba(13,40,24,.2);margin:4px auto 10px}' +
  '.hd2-sheet-title{margin:4px 0 14px;font-size:20px}' +
  '.hd2-field{display:block;margin:0 0 14px;font-size:13px;font-weight:600;color:rgba(13,40,24,.7)}' +
  '.hd2-field input{display:block;width:100%;box-sizing:border-box;margin-top:6px;height:48px;' +
    'padding:0 14px;font-size:16px;font-weight:400;color:inherit;background:transparent;' +
    'border:1.5px solid rgba(21,102,47,.35);border-radius:10px;outline:none}' +
  '.hd2-field input:focus{border-color:#15662f;box-shadow:0 0 0 3px rgba(21,102,47,.15)}' +
  '.hd2-login-err{margin:0 0 12px;padding:10px 14px;border-radius:10px;font-size:14px;' +
    'background:rgba(185,28,28,.1);color:#b91c1c}' +
  '.hd2-sheet-actions{display:flex;gap:10px;margin-top:6px}' +
  '.hd2-btn{flex:1;height:48px;border:none;border-radius:12px;font-size:16px;font-weight:600;' +
    'background:#15662f;color:#fff;cursor:pointer}' +
  '.hd2-btn:disabled{opacity:.6}' +
  '.hd2-btn-ghost{background:transparent;color:#15662f;border:1.5px solid rgba(21,102,47,.4)}' +
  '@media (prefers-color-scheme:dark){' +
    '.hd2-sheet{background:#14241a;color:#e6f0e8}' +
    '.hd2-sheet-handle{background:rgba(230,240,232,.25)}' +
    '.hd2-field{color:rgba(230,240,232,.7)}' +
    '.hd2-field input{border-color:rgba(122,199,148,.4)}' +
    '.hd2-field input:focus{border-color:#7ac794;box-shadow:0 0 0 3px rgba(122,199,148,.18)}' +
    '.hd2-btn-ghost{color:#7ac794;border-color:rgba(122,199,148,.5)}' +
    '.hd2-toast{background:#e6f0e8;color:#0d2818}' +
    '.hd2-error{background:rgba(252,165,165,.12);color:#fca5a5}' +
  '}';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/* ---------- shared helpers for the other modules ---------- */

window.HD = { go, toast, login: openLoginSheet };

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
