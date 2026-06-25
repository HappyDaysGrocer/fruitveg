/* Happy Days v3 (in-house) — pdfinvoice.js
   A tiny, dependency-free PDF generator for customer order invoices, so an
   order can be shared/printed as a real PDF. No libraries, no build step,
   works offline. Layout MATCHES the V4 dashboard invoice (logo + biz block,
   bill-to, # / Item / Qty / Unit / Price / Amount, Subtotal/GST/Total, payment
   box) so the app and dashboard invoices are identical. The SAME generator is
   used by the V4 dashboard (a copy lives in Dashboard V4\\live3.js — keep in sync).
   `invoicePdfBytes()` is pure (returns a Uint8Array, unit-testable in Node). */

/* Standard Helvetica glyph widths (units/1000 em), ASCII 32–126. */
const HW = (() => {
  const w = new Array(256).fill(556);
  const set = (from, arr) => arr.forEach((v, i) => { w[from + i] = v; });
  set(32, [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278]);
  set(48, [556, 556, 556, 556, 556, 556, 556, 556, 556, 556]);
  set(58, [278, 278, 584, 584, 584, 556, 1015]);
  set(65, [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611]);
  set(91, [278, 278, 278, 469, 556, 333]);
  set(97, [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500]);
  set(123, [334, 260, 334, 584]);
  return w;
})();

function ascii(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/≈/g, '~')
    .replace(/ /g, ' ').replace(/[^\x20-\x7E]/g, '');
}
function pesc(s) { return ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function widthOf(str, size, bold) {
  const s = ascii(str);
  let u = 0;
  for (let i = 0; i < s.length; i++) u += HW[s.charCodeAt(i)] || 556;
  return u / 1000 * size * (bold ? 1.035 : 1);
}
function fit(str, maxW, size, bold) {
  let s = ascii(str);
  if (widthOf(s, size, bold) <= maxW) return s;
  while (s.length > 1 && widthOf(s + '...', size, bold) > maxW) s = s.slice(0, -1);
  return s + '...';
}
const dollars = (n) => '$' + (Number(n) || 0).toFixed(2);

/* Decode a base64 JPEG data-URL to a binary string + pixel W/H (from the SOF marker),
   so the logo can be embedded as a /DCTDecode image XObject. null if not a usable JPEG. */
function jpegInfo(dataUrl) {
  if (!dataUrl || String(dataUrl).indexOf('base64,') < 0 || !/jpe?g/i.test(String(dataUrl).slice(0, 30))) return null;
  const b64 = String(dataUrl).split('base64,')[1];
  let bin;
  try { bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); } catch (e) { return null; }
  let i = 2, w = 0, h = 0;
  while (i < bin.length - 9) {
    if (bin.charCodeAt(i) !== 0xFF) { i++; continue; }
    const m = bin.charCodeAt(i + 1);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      h = (bin.charCodeAt(i + 5) << 8) | bin.charCodeAt(i + 6);
      w = (bin.charCodeAt(i + 7) << 8) | bin.charCodeAt(i + 8);
      break;
    }
    i += 2 + ((bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3));
  }
  return (w && h) ? { bin: bin, w: w, h: h } : null;
}

/* ---- page geometry (A4 portrait, points) ---- */
const PAGE_W = 595, PAGE_H = 842;
const LEFT = 42, RIGHT = PAGE_W - 42, TOP = PAGE_H - 50, BOTTOM = 60;
const GREEN_F = '0.082 0.4 0.184 rg', GREEN_S = '0.082 0.4 0.184 RG', BLACK_F = '0 0 0 rg', BLACK_S = '0 0 0 RG';

export function invoicePdfBytes(d) {
  const biz = d.biz || {};
  const img = jpegInfo(d.logo);
  const pages = [];
  let ops = null, y = 0;

  const T = (x, yy, str, size, bold) =>
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pesc(str)}) Tj ET`);
  const TR = (xr, yy, str, size, bold) => T(xr - widthOf(str, size, bold), yy, str, size, bold);
  const RULE = (yy, x1 = LEFT, x2 = RIGHT, w = 0.6) =>
    ops.push(`${w} w ${x1} ${yy.toFixed(1)} m ${x2} ${yy.toFixed(1)} l S`);
  const lbl = (x, yy, str, right) => { ops.push('0.5 0.5 0.5 rg'); (right ? TR : T)(x, yy, str, 8, true); ops.push(BLACK_F); };

  // numeric column right-edges
  const C_QTY = 358, C_UNIT = 416, C_PRICE = 484, C_AMT = RIGHT;
  const tableHead = () => {
    lbl(LEFT, y, '#'); lbl(LEFT + 18, y, 'ITEM');
    lbl(C_QTY, y, 'QTY', true); lbl(C_UNIT, y, 'UNIT', true); lbl(C_PRICE, y, 'PRICE', true); lbl(C_AMT, y, 'AMOUNT', true);
    y -= 5; ops.push(GREEN_S); RULE(y, LEFT, RIGHT, 1); ops.push(BLACK_S); y -= 13;
  };

  let rowN = 0;
  const newPage = (first) => {
    if (ops) pages.push(ops);
    ops = []; y = TOP;
    // header: logo (left) + business block (right)
    let logoBottom;
    if (img) {
      const hH = 62, wW = Math.round(hH * img.w / img.h);
      ops.push(`q ${wW} 0 0 ${hH} ${LEFT} ${(TOP - hH).toFixed(1)} cm /Im0 Do Q`);
      logoBottom = TOP - hH;
    } else { T(LEFT, TOP - 15, biz.name || 'Happy Days', 17, true); logoBottom = TOP - 22; }
    let by = TOP - 2;
    TR(RIGHT, by, biz.name || 'Happy Days', 13, true); by -= 13;
    if (biz.abn) { TR(RIGHT, by, 'ABN ' + biz.abn, 8.5); by -= 11; }
    if (biz.addr) { TR(RIGHT, by, fit(biz.addr, 340, 8.5), 8.5); by -= 11; }
    if (biz.contacts) { TR(RIGHT, by, fit(biz.contacts, 340, 8.5), 8.5); by -= 11; }
    if (biz.email) { TR(RIGHT, by, biz.email, 8.5); by -= 11; }
    y = Math.min(logoBottom, by) - 12;
    ops.push(GREEN_S); RULE(y, LEFT, RIGHT, 1.6); ops.push(BLACK_S); y -= 22;
    ops.push(GREEN_F); T(LEFT, y, 'TAX INVOICE', 18, true); ops.push(BLACK_F);
    if (first) {
      let yL = y - 22, yR = y - 22;
      lbl(LEFT, yL, 'BILL TO / DELIVER TO'); yL -= 13;
      T(LEFT, yL, d.customer || '', 11.5, true); yL -= 13;
      if (d.custContact) { T(LEFT, yL, ascii(d.custContact), 9.5); yL -= 11; }
      if (d.custAddr) {
        var _aw = String(d.custAddr);
        if (widthOf(_aw, 9.5) <= 330) { T(LEFT, yL, _aw, 9.5); yL -= 11; }
        else { var _ws = _aw.split(' '), _l1 = '', _l2 = ''; for (var _wi = 0; _wi < _ws.length; _wi++) { if (widthOf((_l1 ? _l1 + ' ' : '') + _ws[_wi], 9.5) <= 330) _l1 += (_l1 ? ' ' : '') + _ws[_wi]; else _l2 += (_l2 ? ' ' : '') + _ws[_wi]; } T(LEFT, yL, _l1, 9.5); yL -= 11; if (_l2) { T(LEFT, yL, fit(_l2, 330, 9.5), 9.5); yL -= 11; } }
      }
      if (d.custPhone) { T(LEFT, yL, ascii(d.custPhone), 9.5); yL -= 11; }
      if (d.custEmail) { T(LEFT, yL, ascii(d.custEmail), 9.5); yL -= 11; }
      if (d.custAbn) { T(LEFT, yL, 'ABN ' + d.custAbn, 9.5); yL -= 11; }
      lbl(RIGHT, yR, 'INVOICE #', true); yR -= 13;
      TR(RIGHT, yR, d.invNo || '', 11, true); yR -= 15;
      const dd = d.deliveryDate || d.date || '';
      if (dd) { lbl(RIGHT, yR, 'DELIVERY DATE', true); yR -= 12; TR(RIGHT, yR, ascii(dd), 9.5); yR -= 11; }
      y = Math.min(yL, yR) - 12;
    } else { y -= 8; }
    tableHead();
  };

  newPage(true);

  for (const l of (d.lines || [])) {
    if (y < BOTTOM + 80) newPage(false);
    rowN++;
    const qty = Number(l.qty) || 0, price = Number(l.price) || 0;
    ops.push(GREEN_F); T(LEFT, y, String(rowN), 9.5, true); ops.push(BLACK_F);
    T(LEFT + 18, y, fit(l.name || '', C_QTY - (LEFT + 18) - 45, 10), 10);
    TR(C_QTY, y, String(l.qty == null ? qty : l.qty), 10);
    TR(C_UNIT, y, ascii(l.unit || ''), 10);
    TR(C_PRICE, y, dollars(price), 10);
    TR(C_AMT, y, dollars(qty * price), 10);
    y -= 14;
  }

  // totals
  const sub = (d.total != null ? Number(d.total) : (d.lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
  if (y < BOTTOM + 110) newPage(false);
  var LBLX = C_AMT - 152;   // labels LEFT-aligned here so the wide "$0.00 (GST-free)" value (right-aligned at C_AMT) never collides with them
  y -= 2; RULE(y, LBLX, RIGHT, 0.6); y -= 16;
  T(LBLX, y, 'Subtotal', 10); TR(C_AMT, y, dollars(sub), 10); y -= 14;
  T(LBLX, y, 'GST', 10); TR(C_AMT, y, '$0.00 (GST-free)', 10); y -= 20;
  ops.push(GREEN_S); RULE(y + 14, LBLX, RIGHT, 1); ops.push(BLACK_S);   // rule sits ABOVE the Total text (previously struck through it)
  ops.push(GREEN_F); T(LBLX, y, 'Total', 12.5, true); TR(C_AMT, y, dollars(sub), 12.5, true); ops.push(BLACK_F); y -= 28;

  // payment box (mirrors the V4 "Payment — bank transfer" panel)
  if (biz.bsb || biz.acc) {
    if (y < BOTTOM + 70) newPage(false);
    const boxH = 58, boxTop = y;
    ops.push(`0.94 0.965 0.945 rg ${LEFT} ${(boxTop - boxH).toFixed(1)} ${(RIGHT - LEFT).toFixed(1)} ${boxH} re f`);
    ops.push(`${GREEN_S} 0.8 w ${LEFT} ${(boxTop - boxH).toFixed(1)} ${(RIGHT - LEFT).toFixed(1)} ${boxH} re S`); ops.push(BLACK_S);
    ops.push(BLACK_F);
    let py = boxTop - 16;
    ops.push(GREEN_F); T(LEFT + 12, py, 'Payment - bank transfer', 10, true); ops.push(BLACK_F); py -= 14;
    T(LEFT + 12, py, 'BSB ' + (biz.bsb || '') + '     Account ' + (biz.acc || '') + '     Name ' + (biz.accName || biz.legal || ''), 9.5); py -= 13;
    T(LEFT + 12, py, 'Please use reference ' + (d.invNo || d.orderRef || ''), 9.5);
    y = boxTop - boxH - 16;
  }
  if (d.terms) { T(LEFT, y, ascii(d.terms), 9); y -= 12; }
  T(LEFT, y, 'Thank you for your business.', 9);

  pages.push(ops);
  return buildPdf(pages, img);
}

/* Serialise content-op pages into a valid single-file PDF. Optional `image` = a JPEG
   ({bin,w,h}) embedded as XObject /Im0 (referenced by the content's `q … cm /Im0 Do Q`). */
function buildPdf(pages, image) {
  const objs = [];
  const hasImg = !!(image && image.bin);
  const IMG_OBJ = 5;                                  // image XObject (when present) = object 5
  const FIRST_PAGE_OBJ = hasImg ? 6 : 5;
  const kids = [];
  pages.forEach((_, i) => kids.push((FIRST_PAGE_OBJ + i * 2) + ' 0 R'));

  objs[0] = `<</Type/Catalog/Pages 2 0 R>>`;
  objs[1] = `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${pages.length}>>`;
  objs[2] = `<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>`;
  objs[3] = `<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>`;
  if (hasImg) objs[4] = `<</Type/XObject/Subtype/Image/Width ${image.w}/Height ${image.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${image.bin.length}>>\nstream\n${image.bin}\nendstream`;
  pages.forEach((pg, i) => {
    const content = pg.join('\n');
    const pageObj = FIRST_PAGE_OBJ + i * 2;
    const contObj = pageObj + 1;
    const res = `/Font<</F1 3 0 R/F2 4 0 R>>` + (hasImg ? `/XObject<</Im0 ${IMG_OBJ} 0 R>>` : '');
    objs[pageObj - 1] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_W} ${PAGE_H}]/Resources<<${res}>>/Contents ${contObj} 0 R>>`;
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
const PL_QTY = 300, PL_COST = 385, PL_SELL = 465, PL_PROFIT = RIGHT;

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

function fileName(d) {
  const who = ascii(d.customer || 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Happy Days ${ascii(d.invNo || 'invoice')} ${who}`.replace(/\s+/g, ' ').trim() + '.pdf';
}
function plFileName(d) {
  const who = ascii(d.customer || 'order').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Happy Days P-and-L ${who}`.replace(/\s+/g, ' ').trim() + '.pdf';
}

async function sharePdfBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  try {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export async function shareInvoice(d) { return sharePdfBytes(invoicePdfBytes(d), fileName(d)); }
export async function sharePL(d) { return sharePdfBytes(plPdfBytes(d), plFileName(d)); }
