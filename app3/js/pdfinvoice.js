/* Happy Days v3 (in-house) — pdfinvoice.js
   A tiny, dependency-free PDF generator for customer order invoices, so an
   order can be shared with the customer as a real PDF (tap Share → WhatsApp /
   email). No libraries, no build step, works offline at the market.

   It builds an A4 "TAX INVOICE" with our business name + ABN + address, the
   customer's business name, the order lines + total, and our payment details
   (BSB / account). `invoicePdfBytes()` is pure (returns a Uint8Array, so it is
   unit-testable in Node); `shareInvoice()` wraps it for the phone. */

/* Standard Helvetica glyph widths (units/1000 em), ASCII 32–126 — lets us
   right-align the money column and truncate long names accurately. */
const HW = (() => {
  const w = new Array(256).fill(556);
  const set = (from, arr) => arr.forEach((v, i) => { w[from + i] = v; });
  set(32, [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278]); // sp ! " # $ % & ' ( ) * + , - . /
  set(48, [556, 556, 556, 556, 556, 556, 556, 556, 556, 556]); // 0-9
  set(58, [278, 278, 584, 584, 584, 556, 1015]); // : ; < = > ? @
  set(65, [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611]); // A-Z
  set(91, [278, 278, 278, 469, 556, 333]); // [ \ ] ^ _ `
  set(97, [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500]); // a-z
  set(123, [334, 260, 334, 584]); // { | } ~
  return w;
})();

/* Latin-1 only — fold the handful of non-ASCII glyphs an invoice might carry. */
function ascii(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/≈/g, '~')
    .replace(/ /g, ' ').replace(/[^\x20-\x7E]/g, '');
}
function pesc(s) { return ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function widthOf(str, size, bold) {
  const s = ascii(str);
  let u = 0;
  for (let i = 0; i < s.length; i++) u += HW[s.charCodeAt(i)] || 556;
  return u / 1000 * size * (bold ? 1.035 : 1);
}
/* Trim a string to fit maxW points at a given size (… if cut). */
function fit(str, maxW, size, bold) {
  let s = ascii(str);
  if (widthOf(s, size, bold) <= maxW) return s;
  while (s.length > 1 && widthOf(s + '...', size, bold) > maxW) s = s.slice(0, -1);
  return s + '...';
}
const dollars = (n) => '$' + (Number(n) || 0).toFixed(2);

/* ---- page geometry (A4 portrait, points) ---- */
const PAGE_W = 595, PAGE_H = 842;
const LEFT = 42, RIGHT = PAGE_W - 42, TOP = PAGE_H - 50, BOTTOM = 60;
const COL_QTY = 320, COL_UNIT = 430, COL_AMT = RIGHT;   // right edges of numeric cols

export function invoicePdfBytes(d) {
  const biz = d.biz || {};
  const pages = [];          // each = array of content op strings
  let ops = null, y = 0;

  const T = (x, yy, str, size, bold) =>
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pesc(str)}) Tj ET`);
  const TR = (xr, yy, str, size, bold) => T(xr - widthOf(str, size, bold), yy, str, size, bold);
  const RULE = (yy, x1 = LEFT, x2 = RIGHT, w = 0.6) =>
    ops.push(`${w} w ${x1} ${yy.toFixed(1)} m ${x2} ${yy.toFixed(1)} l S`);

  const tableHead = () => {
    T(LEFT, y, 'Item', 9, true);
    TR(COL_QTY, y, 'Qty', 9, true);
    TR(COL_UNIT, y, 'Unit', 9, true);
    TR(COL_AMT, y, 'Amount', 9, true);
    y -= 6; RULE(y); y -= 14;
  };

  const newPage = (first) => {
    if (ops) pages.push(ops);
    ops = [];
    y = TOP;
    // header band — trading name fitted to the left of the TAX INVOICE title
    const taxW = widthOf('TAX INVOICE', 16, true);
    const nameMaxW = (RIGHT - taxW - 20) - LEFT;
    T(LEFT, y, fit(biz.name || 'Happy Days', nameMaxW, 14, true), 14, true); y -= 15;
    const legalAbn = [biz.legal || '', biz.abn ? 'ABN ' + biz.abn : ''].filter(Boolean).join('  ·  ');
    if (legalAbn) { T(LEFT, y, legalAbn, 9); y -= 12; }
    if (biz.addr) { T(LEFT, y, biz.addr, 9); y -= 12; }
    if (biz.phone || biz.email) {
      T(LEFT, y, [biz.phone ? 'Ph ' + biz.phone : '', biz.email].filter(Boolean).join('  ·  '), 9); y -= 12;
    }
    // invoice title block (right)
    TR(RIGHT, TOP, 'TAX INVOICE', 16, true);
    TR(RIGHT, TOP - 18, d.invNo || '', 10);
    if (d.date) TR(RIGHT, TOP - 31, d.date, 10);
    y -= 6; RULE(y, LEFT, RIGHT, 1.2); y -= 20;
    if (first) {
      T(LEFT, y, 'Bill to', 9, true); y -= 13;
      T(LEFT, y, d.customer || '', 12, true); y -= 14;
      if (d.deliver) { T(LEFT, y, 'Delivery: ' + d.deliver, 9); y -= 12; }
      if (d.orderRef) { T(LEFT, y, 'Order: ' + d.orderRef, 9); y -= 12; }
      y -= 8;
    } else { y -= 4; }
    tableHead();
  };

  newPage(true);

  for (const l of (d.lines || [])) {
    if (y < BOTTOM + 40) newPage(false);
    const qty = Number(l.qty) || 0, price = Number(l.price) || 0;
    T(LEFT, y, fit(l.name || '', COL_QTY - LEFT - 60, 10), 10);
    TR(COL_QTY, y, String(qty) + (l.unit ? ' ' + ascii(l.unit) : ''), 10);
    TR(COL_UNIT, y, dollars(price), 10);
    TR(COL_AMT, y, dollars(qty * price), 10);
    y -= 15;
  }

  // total
  y -= 2; RULE(y); y -= 18;
  T(COL_UNIT - 70, y, 'TOTAL' + (d.gstFree ? ' (GST-free)' : ''), 11, true);
  TR(COL_AMT, y, dollars(d.total), 12, true);
  y -= 26;

  // payment details block
  if (biz.bsb || biz.acc) {
    if (y < BOTTOM + 70) newPage(false);
    RULE(y, LEFT, RIGHT, 0.6); y -= 16;
    T(LEFT, y, 'Payment details', 10, true); y -= 14;
    if (biz.accName) { T(LEFT, y, 'Account name: ' + biz.accName, 10); y -= 13; }
    const bsbAcc = [biz.bsb ? 'BSB ' + biz.bsb : '', biz.acc ? 'Account ' + biz.acc : ''].filter(Boolean).join('     ');
    if (bsbAcc) { T(LEFT, y, bsbAcc, 10); y -= 13; }
    T(LEFT, y, 'Reference: ' + (d.invNo || d.orderRef || ''), 10); y -= 16;
  }
  if (d.terms) { T(LEFT, y, ascii(d.terms), 9); y -= 13; }
  T(LEFT, y, 'Thank you for your business.', 9); y -= 12;

  pages.push(ops);
  return buildPdf(pages);
}

/* Serialise an array of content-op pages (Helvetica F1 / Helvetica-Bold F2)
   into a valid single-file PDF. Shared by every document type. */
function buildPdf(pages) {
  const objs = [];                                   // objs[n-1] = body string of object n
  const NUM_FONTS = 2, FIRST_PAGE_OBJ = 3 + NUM_FONTS; // 1 cat, 2 pages, 3-4 fonts, then pages+contents
  const kids = [];
  pages.forEach((_, i) => kids.push((FIRST_PAGE_OBJ + i * 2) + ' 0 R'));

  objs[0] = `<</Type/Catalog/Pages 2 0 R>>`;
  objs[1] = `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${pages.length}>>`;
  objs[2] = `<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>`;
  objs[3] = `<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>`;
  pages.forEach((pg, i) => {
    const content = pg.join('\n');
    const pageObj = FIRST_PAGE_OBJ + i * 2;
    const contObj = pageObj + 1;
    objs[pageObj - 1] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_W} ${PAGE_H}]` +
      `/Resources<</Font<</F1 3 0 R/F2 4 0 R>>>>/Contents ${contObj} 0 R>>`;
    objs[contObj - 1] = `<</Length ${content.length}>>\nstream\n${content}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < objs.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/* ---- P&L sheet (INTERNAL — carries cost + profit; for staff, not customers) ---- */
const PL_QTY = 300, PL_COST = 385, PL_SELL = 465, PL_PROFIT = RIGHT;   // right edges

export function plPdfBytes(d) {
  const biz = d.biz || {};
  const pages = [];
  let ops = null, y = 0;
  const T = (x, yy, str, size, bold) =>
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pesc(str)}) Tj ET`);
  const TR = (xr, yy, str, size, bold) => T(xr - widthOf(str, size, bold), yy, str, size, bold);
  const RULE = (yy, x1 = LEFT, x2 = RIGHT, w = 0.6) =>
    ops.push(`${w} w ${x1} ${yy.toFixed(1)} m ${x2} ${yy.toFixed(1)} l S`);

  const tableHead = () => {
    T(LEFT, y, 'Item', 9, true);
    TR(PL_QTY, y, 'Qty', 9, true);
    TR(PL_COST, y, 'Cost', 9, true);
    TR(PL_SELL, y, 'Sell', 9, true);
    TR(PL_PROFIT, y, 'Profit', 9, true);
    y -= 6; RULE(y); y -= 14;
  };

  const newPage = (first) => {
    if (ops) pages.push(ops);
    ops = []; y = TOP;
    const titleW = widthOf('PROFIT / LOSS', 16, true);
    T(LEFT, y, fit(biz.name || 'Happy Days', (RIGHT - titleW - 20) - LEFT, 14, true), 14, true); y -= 15;
    if (biz.addr) { T(LEFT, y, biz.addr, 9); y -= 12; }
    TR(RIGHT, TOP, 'PROFIT / LOSS', 16, true);
    TR(RIGHT, TOP - 18, 'INTERNAL - staff only', 9, true);
    if (d.date) TR(RIGHT, TOP - 31, d.date, 10);
    y -= 6; RULE(y, LEFT, RIGHT, 1.2); y -= 20;
    if (first) {
      T(LEFT, y, 'Customer', 9, true); y -= 13;
      T(LEFT, y, d.customer || '', 12, true); y -= 14;
      if (d.orderRef) { T(LEFT, y, 'Order: ' + d.orderRef, 9); y -= 12; }
      y -= 8;
    } else { y -= 4; }
    tableHead();
  };
  newPage(true);

  for (const l of (d.lines || [])) {
    if (y < BOTTOM + 50) newPage(false);
    const qty = Number(l.qty) || 0, uc = Number(l.cost) || 0, us = Number(l.sell) || 0;
    const lc = qty * uc, ls = qty * us;
    T(LEFT, y, fit(l.name || '', PL_QTY - LEFT - 52, 10), 10);
    TR(PL_QTY, y, String(qty) + (l.unit ? ' ' + ascii(l.unit) : ''), 10);
    TR(PL_COST, y, dollars(lc), 10);
    TR(PL_SELL, y, dollars(ls), 10);
    TR(PL_PROFIT, y, dollars(ls - lc), 10);
    y -= 15;
  }

  const t = d.totals || {};
  y -= 2; RULE(y); y -= 18;
  T(LEFT, y, 'TOTALS', 11, true);
  TR(PL_COST, y, dollars(t.cost), 11, true);
  TR(PL_SELL, y, dollars(t.sell), 11, true);
  TR(PL_PROFIT, y, dollars(t.profit), 11, true);
  y -= 19;
  TR(PL_PROFIT, y, 'Margin ' + (t.pct != null ? t.pct + '%' : ''), 10, true);
  y -= 24;
  T(LEFT, y, 'Internal costing - do not share with customers.', 9);

  pages.push(ops);
  return buildPdf(pages);
}

/* Filename like "Happy Days INV-20260613-FATCHEF.pdf" (safe chars only). */
function fileName(d) {
  const who = ascii(d.customer || 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Happy Days ${ascii(d.invNo || 'invoice')} ${who}`.replace(/\s+/g, ' ').trim() + '.pdf';
}

function plFileName(d) {
  const who = ascii(d.customer || 'order').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Happy Days P-and-L ${who}`.replace(/\s+/g, ' ').trim() + '.pdf';
}

/* Share PDF bytes from the phone: native share-sheet with the file when
   available (WhatsApp / email / Messages), else download it. Returns a short
   status string for a toast. */
async function sharePdfBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  try {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';   // user dismissed the sheet
  }
  // fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export async function shareInvoice(d) { return sharePdfBytes(invoicePdfBytes(d), fileName(d)); }
export async function sharePL(d) { return sharePdfBytes(plPdfBytes(d), plFileName(d)); }
