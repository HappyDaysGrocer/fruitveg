/* Happy Days v3 (in-house) — searchBar.js
   The COMMAND BAR (v3.3, DESIGN.md): an optional accelerator, never the
   required path. One overlay: type to jump to any product (detail sheet),
   any customer (Orders view, pre-filtered), or run an action (go to a tab,
   sync now). 100% client-side over the in-memory catalogue + mirrors —
   instant and offline. Opened from the visible ⚡ button in the header. */

import { catalog, searchCatalog, customers, pull, flushOutbox } from './store.js';
import { esc, money, openSheet, closeSheet, toast, productSheet, emptyHTML } from './catalog.js';

/* Static actions registry. Each row teaches itself via the hint text. */
const ACTIONS = [
  { label: 'Go to Buy run', hint: 'the live market list', go: 'buy' },
  { label: 'Go to Stock', hint: 'browse the catalogue', go: 'shop' },
  { label: 'Go to Orders', hint: 'customers & orders', go: 'orders' },
  { label: 'Go to Money', hint: 'costs, margins (sign-in)', go: 'money' },
  { label: 'Go to More', hint: 'tiers, runs, specials, sync', go: 'more' },
  { label: 'Sync now', hint: 'pull latest + send queued changes', run: () => { pull(); flushOutbox(); toast('Syncing…'); } }
];

function matches(q, text) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = String(text).toLowerCase();
  return toks.every((t) => hay.includes(t));
}

export function openCommandBar() {
  openSheet((body) => {
    body.innerHTML = `
      <div class="hdv-sheettitle">Jump to anything</div>
      <input class="hdv-in" id="hdv-cmd-q" type="search" placeholder="Product, customer or action…"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      <div id="hdv-cmd-res"></div>`;
    const input = body.querySelector('#hdv-cmd-q');
    const res = body.querySelector('#hdv-cmd-res');

    const row = (act, key, title, sub) =>
      `<div class="hdv-row" data-cmd="${act}" data-key="${esc(key)}">
        <div class="hdv-info">
          <div class="hdv-name">${esc(title)}</div>
          ${sub ? `<div class="hdv-sub">${esc(sub)}</div>` : ''}
        </div>
      </div>`;

    const draw = () => {
      const q = input.value.trim();
      let h = '';
      const acts = q ? ACTIONS.filter((a) => matches(q, a.label + ' ' + a.hint)) : ACTIONS;
      if (acts.length) {
        h += '<div class="hdv-sec">Actions</div>' +
          acts.map((a, i) => row('act', String(ACTIONS.indexOf(a)), a.label, a.hint)).join('');
      }
      if (q) {
        const custs = customers().filter((c) => matches(q, c.name || '')).slice(0, 4);
        if (custs.length) {
          h += '<div class="hdv-sec">Customers</div>' +
            custs.map((c) => row('cust', c.id, c.name, 'open in Orders')).join('');
        }
        const prods = searchCatalog(q).slice(0, 8);
        if (prods.length) {
          h += '<div class="hdv-sec">Products</div>' +
            prods.map((p) => row('prod', p.key, p.name,
              [p.cat, money(p.sell)].filter(Boolean).join(' · '))).join('');
        }
        if (!acts.length && !custs.length && !prods.length) {
          h += emptyHTML(`Nothing matches “${esc(q)}”`);
        }
      }
      res.innerHTML = h;
    };

    input.oninput = draw;
    draw();
    setTimeout(() => input.focus(), 250);   // after the sheet slide-in

    body.onclick = (e) => {
      const t = e.target.closest('[data-cmd]');
      if (!t) return;
      const kind = t.dataset.cmd, key = t.dataset.key;
      if (kind === 'act') {
        const a = ACTIONS[Number(key)];
        if (!a) return;
        closeSheet();
        if (a.go) window.HD.go(a.go);
        else if (a.run) a.run();
      } else if (kind === 'cust') {
        const c = customers().find((x) => x.id === key);
        closeSheet();
        const q = document.getElementById('q');
        if (q && c) { q.value = c.name; q.dispatchEvent(new Event('input')); }
        window.HD.go('orders');
      } else if (kind === 'prod') {
        openSheet(productSheet(key));       // singleton sheet: replaces this one
      }
    };
  }, { static: true });
}
