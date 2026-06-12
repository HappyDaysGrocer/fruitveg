/* Happy Days v3 (in-house) — stock.js
   COUNT MODE (v3.4, DESIGN.md): scan-first stocktake with progressive
   barcoding. Counts stage as a DRAFT (nothing commits live — prevents
   fat-finger errors); one "Apply N counts" button writes /stock. Scanning
   uses the BarcodeDetector API where the phone has it (Android Chrome);
   everywhere else the search-to-count path does the same job. An unknown
   barcode offers "assign to a product?" — two taps binds it (/barcodes),
   so the 600 products get barcoded progressively as the team counts. */

import {
  catalog, searchCatalog, stockFor, setStockCount, keyForBarcode, assignBarcode
} from './store.js';
import { esc, money, openSheet, closeSheet, toast } from './catalog.js';

/* Draft survives an accidental close — same-day only. */
const DRAFT_KEY = 'hd3.countdraft';

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.date === new Date().toDateString()) return d.counts || {};
  } catch (e) { /* fresh */ }
  return {};
}
function saveDraft(counts) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: new Date().toDateString(), counts }));
  } catch (e) { /* quota */ }
}

let _stream = null;
function stopCamera() {
  if (_stream) { try { _stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* gone */ } }
  _stream = null;
}

export function openCountSheet() {
  const counts = loadDraft();          // {key: {name, qty}}
  let scanMsg = '';                    // status line under the camera
  let pendingCode = null;              // unknown barcode awaiting assignment
  let lastCode = '', lastAt = 0;       // debounce repeated detections
  let body = null;

  const nameFor = (key) => {
    const p = catalog().find((x) => x.key === key);
    return p ? p.name : (String(key).split('||')[1] || key);
  };

  const bump = (key, name, by) => {
    const cur = counts[key] || { name, qty: 0 };
    cur.qty = Math.max(0, (Number(cur.qty) || 0) + by);
    cur.name = name;
    counts[key] = cur;
    saveDraft(counts);
    if (navigator.vibrate) navigator.vibrate(20);
    draw();
  };

  const onCode = (code) => {
    const now = Date.now();
    if (code === lastCode && now - lastAt < 2000) return;   // same label held up
    lastCode = code; lastAt = now;
    const key = keyForBarcode(code);
    if (key) {
      scanMsg = '';
      bump(key, nameFor(key), 1);
      toast('+1 ' + nameFor(key));
    } else {
      pendingCode = code;                                   // -> assign flow
      scanMsg = '';
      draw();
    }
  };

  async function startCamera() {
    if (!('BarcodeDetector' in window)) {
      scanMsg = 'This phone can’t scan in the browser — search below instead.';
      draw(); return;
    }
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false
      });
    } catch (e) {
      scanMsg = 'Camera not available — search below instead.';
      draw(); return;
    }
    scanMsg = 'Point at a barcode…';
    draw();
    const video = body.querySelector('#hdv-cam');
    if (!video) { stopCamera(); return; }
    video.srcObject = _stream;
    await video.play().catch(() => {});
    const detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']
    });
    const tick = async () => {
      if (!_stream || !body || !body.isConnected) { stopCamera(); return; }
      try {
        const found = await detector.detect(video);
        if (found && found.length) onCode(String(found[0].rawValue || ''));
      } catch (e) { /* a bad frame is fine */ }
      if (_stream) setTimeout(tick, 280);
    };
    tick();
  }

  const draw = () => {
    if (!body) return;
    const items = Object.entries(counts);
    const n = items.length;

    let h = `<div class="hdv-sheettitle">Count stock</div>`;

    if (pendingCode) {
      // ---- assign-an-unknown-barcode flow ----
      h += `<div class="hdv-sheetsub">New barcode <b>${esc(pendingCode)}</b> — which product is it?</div>
        <input class="hdv-in" id="hdv-as-q" type="search" placeholder="Search to assign…"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <div id="hdv-as-res"></div>
        <div class="hdv-actions"><button class="hdv-btnG" data-cs="cancel-assign">Skip this barcode</button></div>`;
    } else {
      h += `<div class="hdv-sheetsub">Scan or search; counts stage as a draft until you apply.</div>
        <video id="hdv-cam" playsinline muted
          style="width:100%;max-height:30vh;border-radius:12px;background:#0d2818;${_stream ? '' : 'display:none'}"></video>
        ${_stream ? '' : `<button class="hdv-btnG" style="width:100%" data-cs="cam">📷 Start scanning</button>`}
        ${scanMsg ? `<div class="hdv-sheetsub">${esc(scanMsg)}</div>` : ''}
        <input class="hdv-in" id="hdv-ct-q" type="search" placeholder="Search to count…"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <div id="hdv-ct-res"></div>`;
      if (n) {
        h += `<div class="hdv-sec">Counted — draft (${n})</div>` + items.map(([key, c]) =>
          `<div class="hdv-row sel">
            <div class="hdv-info"><div class="hdv-name">${esc(c.name)}</div></div>
            <div class="hdv-step">
              <button class="hdv-sbtn" data-cs="dec" data-key="${esc(key)}" aria-label="less">&minus;</button>
              <span class="hdv-qty">${c.qty}</span>
              <button class="hdv-sbtn plus" data-cs="inc" data-key="${esc(key)}" aria-label="more">+</button>
            </div>
          </div>`).join('');
      }
      h += `<div class="hdv-actions">
        <button class="hdv-btnG" data-cs="close">Close</button>
        <button class="hdv-btnP" data-cs="apply" ${n ? '' : 'disabled'}>Apply ${n || ''} count${n === 1 ? '' : 's'}</button>
      </div>`;
    }
    body.innerHTML = h;

    // live result rows for whichever search input is on screen
    const wire = (inputId, resId, onPick) => {
      const inp = body.querySelector(inputId), res = body.querySelector(resId);
      if (!inp || !res) return;
      const show = () => {
        const q = inp.value.trim();
        res.innerHTML = !q ? '' : searchCatalog(q).slice(0, 6).map((p) =>
          `<div class="hdv-row" data-cs="pick" data-key="${esc(p.key)}">
            <div class="hdv-info"><div class="hdv-name">${esc(p.name)}</div>
            <div class="hdv-sub">${esc([p.cat, money(p.sell)].filter(Boolean).join(' · '))}</div></div>
          </div>`).join('');
        res.dataset.pick = onPick;
      };
      inp.oninput = show;
      show();
    };
    wire('#hdv-ct-q', '#hdv-ct-res', 'count');
    wire('#hdv-as-q', '#hdv-as-res', 'assign');
  };

  openSheet((b) => {
    body = b;
    draw();
    body.onclick = (e) => {
      const t = e.target.closest('[data-cs]');
      if (!t) return;
      const act = t.dataset.cs, key = t.dataset.key;
      if (act === 'cam') startCamera();
      else if (act === 'inc') bump(key, counts[key].name, 1);
      else if (act === 'dec') bump(key, counts[key].name, -1);
      else if (act === 'pick') {
        const mode = t.parentElement.dataset.pick;
        if (mode === 'assign' && pendingCode) {
          assignBarcode(pendingCode, key, nameFor(key));
          toast('Barcode saved to ' + nameFor(key));
          pendingCode = null;
          bump(key, nameFor(key), 1);     // the scan that taught us also counts
        } else {
          bump(key, nameFor(key), 1);
        }
      }
      else if (act === 'cancel-assign') { pendingCode = null; draw(); }
      else if (act === 'apply') {
        const items = Object.entries(counts);
        items.forEach(([k, c]) => setStockCount(k, c.name, c.qty));
        saveDraft({});
        toast(items.length + ' count' + (items.length === 1 ? '' : 's') + ' saved');
        closeSheet();
      }
      else if (act === 'close') closeSheet();
    };
  }, { static: true, onClose: stopCamera });
}

/* Small helper for the detail sheet & stock rows: "On hand 14 · 13 Jun". */
export function onHandText(key) {
  const r = stockFor(key);
  if (!r || typeof r.qty !== 'number') return '';
  return 'On hand ' + r.qty + (r.at ? ' · counted ' + r.at : '');
}
