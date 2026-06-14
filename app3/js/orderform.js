/* Happy Days v3 (in-house) — orderform.js
   The A4 produce ORDER FORM for clients — ported from the classic app
   (fvCOorderForm). openOrderForm(order, cust) opens a print window of the form
   pre-filled with the customer's details + quantities, with "Print / Save as
   PDF" and "Excel version" (downloads orderform.xlsx) buttons. Layout + item
   lists are the owner-locked ones; keep in lockstep with orderform.xlsx
   (built from this same FV_ORDERFORM by inv-work\_buildform.py). */

import { esc } from './catalog.js';

const FV_ORDERFORM = {
  FRUIT: ['Apples, Granny Smith', 'Apples, Pink Lady', 'Apples, Royal Gala', 'Apricots *', 'Avocado (each)', 'Bananas', 'Berries, Black (pnt) *', 'Berries, Blue (pnt) *', 'Berries, Rasp (pnt) *', 'Berries, Straw (pnt)', 'Dates', 'Grapes, Green', 'Grapes, Red', 'Guava', 'Honey Dew (each)', 'Kiwi Fruit (each)', 'Lemons', 'Limes (each)', 'Mandarins', 'Mangoes (each) *', 'Nectarines Yellow/White *', 'Oranges (Firsts)', 'Oranges (Juicing)', 'Passion Fruit (each)', 'Peaches, Yellow/White *', 'Pears', 'Pineapples, Large (each)', 'Plums', 'Rhubarb (bunch)', 'Rockmelon (each)', 'Watermelon, Seedless', 'Watermelon, Standard'],
  VEGETABLES: ['Alfalfa (pnt)', 'Asparagus', 'Beans', 'Bean Shoots 250g/1kg/3kg', 'Beetroot', 'Bittermelon (Karela)', 'Bok Choi, Shanghai bunch', 'Broccolini (box only)', 'Broccoli', 'Brussel Sprouts *', 'Cabbage, Green (each)', 'Cabbage, Red (each)', 'Cabbage, Wombok (each)', 'Capsicum, Mixed', 'Capsicum, Green', 'Capsicum, Red', 'Capsicum, Yellow', 'Carrots, Dutch (bunch)', 'Carrots, Large', 'Carrots, Juicing (20kg)', 'Carrots, Peeled (10kg)', 'Cauliflower (each)', 'Celeriac (each)', 'Celery (bunch)', 'Chillies, Birds Eye Red', 'Chillies, Bullet', 'Chillies, Long Green', 'Chillies, Long Red', 'Corn (each)', 'Cucumber Continental (ea)', 'Cucumber, Lebanese', 'Eggplant', 'Endive', 'Fennel (each)', 'Kale (bunch)', 'Leeks (each)', 'Lettuce, Oak Green (each)', 'Lettuce, Oak Red (each)', 'Lettuce, Cos (each)', 'Lettuce, Cos Twin Pack', 'Lettuce, Iceberg (each)', 'Mushroom, Button', 'Mushroom, Flats', 'Mushrooms, Mcup', 'Mushrooms (Seconds)', 'Onions, Brown Large', 'Onions, Red', 'Onions, Peeled (10kg)', 'Parsnip', 'Potatoes, Cocktails', 'Potatoes, Kipfler', 'Potatoes, Red (10kg)', 'Potatoes, Washed (10kg)', 'Potatoes, Washed 20kg Lge', 'Potatoes, Peeled (10kg)', 'Potatoes, Sweet', 'Pumpkin, Butternut', 'Pumpkin, Grey', 'Pumpkin, Jap', 'Pumpkin, Peeled (5kg)', 'Radish (bunch)', 'Roquette, Wild', 'Salad Mix (1.5kg)', 'Shallots', 'Silverbeet (bunch)', 'Snow Peas', 'Snow Pea Shoots (pnt)', 'Spinach, Baby Leaf 1.5kg', 'Spinach (bunch)', 'Spring Onions (bunch)', 'Swedes', 'Tomatoes', 'Tomatoes (Seconds)', 'Tomatoes, Cherry (pnt)', 'Tomatoes, Roma', 'Turmeric (fresh)', 'Turnips', 'Watercress', 'Zucchini'],
  HERBS: ['Basil', 'Chervil', 'Chive', 'Coriander', 'Dill', 'Fenugreek (Methi)', 'Garlic', 'Ginger', 'Lemon Grass', 'Mint', 'Oregano', 'Parsley, Continental', 'Parsley, Curly', 'Rosemary', 'Sage', 'Tarragon', 'Thyme', 'Micro Parsley (pot)', 'Micro Shishocress (pot)']
};

function ofTokens(s) {
  return String(s || '').toLowerCase()
    .replace(/\*seasonal/g, ' ').replace(/\([^)]*\)/g, ' ')
    .replace(/firsts|seconds|juicing|twin pack|box only|seedless|standard|\/kg|each|large/g, ' ')
    .replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
}

/* Match the order's lines to form items → { formItemName: qty }. */
function orderFormQtyMap(order) {
  const map = {};
  if (!order || !order.lines) return map;
  const items = [];
  ['FRUIT', 'VEGETABLES', 'HERBS'].forEach(sec =>
    FV_ORDERFORM[sec].forEach(it => items.push({ name: it, toks: ofTokens(it) })));
  (order.lines || []).forEach(l => {
    if (!(Number(l.qty) > 0)) return;
    const lt = ofTokens(l.name);
    if (!lt.length) return;
    let best = null, bs = 0;
    items.forEach(fi => {
      let sc = 0;
      for (const t of lt) { for (const u of fi.toks) { if (t === u) { sc++; break; } } }
      if (sc > bs) { bs = sc; best = fi; }
    });
    if (best && bs > 0) map[best.name] = (map[best.name] || 0) + Number(l.qty);
  });
  return map;
}

const abs = (rel) => { try { return new URL(rel, location.href).href; } catch (e) { return rel; } };

/* Open the printable A4 order form for an order (pre-filled), in a new window. */
export function openOrderForm(order, cust) {
  order = order || { lines: [] };
  cust = cust || {};
  const qmap = orderFormQtyMap(order);
  const hasQ = Object.keys(qmap).length > 0;
  const wm = abs('../happydays-wordmark.png'), ic = abs('../happydays-icons.png');
  const xls = abs('../orderform.xlsx');

  const fld = (lbl, val) => `<div class="off-fld"><span class="off-lbl">${lbl}</span><span class="off-val">${esc(val || '')}</span></div>`;
  const sec = (title, arr) => {
    let h = `<div class="off-sec">${title}</div>`;
    for (let i = 0; i < arr.length; i++) {
      const q = qmap[arr[i]];
      h += `<div class="off-item"><span class="off-nm"><b class="off-no">${i + 1}.</b> ${esc(arr[i])}</span><span class="off-qty">${q ? `<b class="ofqty">${q}</b>` : ''}</span></div>`;
    }
    return h;
  };
  const grid = sec('FRUIT', FV_ORDERFORM.FRUIT) + sec('VEGETABLES', FV_ORDERFORM.VEGETABLES) + sec('HERBS', FV_ORDERFORM.HERBS);

  const css = '@page{size:A4;margin:8mm;}*{box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;color:#0d2818;margin:0;padding:4px;font-size:10px;}'
    + '.off-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:3px solid #15662f;padding:0 2px 5px;margin-bottom:7px;}'
    + '.off-ttl{font-size:17px;font-weight:800;color:#15662f;letter-spacing:1px;line-height:1;}'
    + '.off-wm{height:62px;width:auto;}.off-ic{height:40px;width:auto;flex:none;}'
    + '.off-fields{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;margin:0 0 7px;}'
    + '.off-fld{display:flex;gap:5px;align-items:center;}.off-lbl{font-weight:700;color:#15662f;white-space:nowrap;font-size:9px;background:#eaf4ec;border:1px solid #9aa0a6;border-radius:3px;padding:2px 4px;width:118px;flex:none;overflow:hidden;text-overflow:ellipsis;}.off-val{flex:1;min-width:0;font-weight:600;border:1px solid #9aa0a6;border-radius:3px;min-height:16px;padding:1px 5px;}'
    + '.off-grid{column-count:3;column-gap:11px;}.off-sec{break-inside:avoid;font-weight:800;color:#fff;background:#15662f;padding:1px 6px;border-radius:3px;margin:4px 0 1px;font-size:10px;letter-spacing:.5px;border:1px solid #15662f;}'
    + '.off-item{break-inside:avoid;display:flex;align-items:flex-start;gap:4px;padding:1px 0;}.off-nm{flex:1;min-width:0;font-size:11px;line-height:1.2;border:1px solid #e2e5e9;border-radius:2px;padding:1px 3px;white-space:normal;overflow-wrap:anywhere;}.off-no{color:#15662f;}'
    + '.off-qty{width:26px;height:15px;border:1px solid #9ca3af;border-radius:2px;text-align:center;line-height:14px;color:#b91c1c;font-weight:700;flex:none;font-size:10px;}'
    + '.off-add{margin-top:7px;border:1px solid #cbd5e1;border-radius:4px;padding:5px;min-height:30px;font-size:10px;}.off-add b{color:#15662f;}'
    + '.off-note{text-align:center;font-weight:800;color:#15662f;background:#eaf4ec;border-radius:4px;padding:3px;margin-top:6px;font-size:10px;}.off-foot{text-align:center;font-weight:700;color:#15662f;margin-top:3px;font-size:10px;}.off-addr{text-align:center;color:#6b7280;font-size:8.5px;margin-top:2px;}.noprint{margin-bottom:8px;}@media print{.noprint{display:none;}}';

  const topbar = '<div class="noprint" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
    + '<button onclick="window.print()" style="padding:8px 14px;background:#15662f;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">🖨️ Print / Save as PDF</button>'
    + `<a href="${xls}" download="Happy Days Order Form A4.xlsx" style="padding:8px 14px;background:#1c4587;color:#fff;border-radius:6px;font-weight:700;text-decoration:none;">⬇️ Excel version</a>`
    + (hasQ ? `<label style="font-size:13px;cursor:pointer;"><input type="checkbox" checked onchange="ofToggle(this)"> Include ${esc(cust.name || 'this customer')}’s quantities</label>` : '')
    + '</div>';
  const scr = '<scr' + 'ipt>function ofToggle(cb){var v=cb.checked?"visible":"hidden";var n=document.querySelectorAll(".ofqty");for(var i=0;i<n.length;i++){n[i].style.visibility=v;}}<\/scr' + 'ipt>';

  const html = '<html><head><title>Happy Days Order Form' + (cust.name ? (' - ' + esc(cust.name)) : '') + '</title>'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body>'
    + topbar
    + `<div class="off-head"><div class="off-ttl">ORDER FORM</div><img class="off-wm" src="${wm}" alt="Happy Days Fruit Veg &amp; Grocer" onerror="this.remove()"><img class="off-ic" src="${ic}" alt="" onerror="this.remove()"></div>`
    + '<div class="off-fields">' + fld('Company:', cust.name) + fld('Contact Person:', cust.contact) + fld('Delivery Address:', cust.address) + fld('Phone Number:', cust.phone) + fld('Suburb:', cust.suburb) + fld('Date Required:', '') + fld('Special Delivery Instructions:', '') + fld('Time Required:', cust.deliveryTime) + '</div>'
    + '<div class="off-grid">' + grid + '</div>'
    + '<div style="font-size:8px;color:#6b7280;margin-top:2px;">* = seasonal item</div>'
    + '<div class="off-add"><b>Additional Items Required:</b></div>'
    + '<div class="off-note">📩 Please email or send your order via text message</div>'
    + '<div class="off-foot">✉ happydaysgrocer@gmail.com&nbsp;&nbsp;&nbsp;📞 Ravi 0430 033 127 · Jas 0415 703 336 · Abhi 0408 752 385</div>'
    + '<div class="off-addr">Happy Days Fruit Veg &amp; Grocer&nbsp; · &nbsp;Unit 4, 684–700 Frankston-Dandenong Rd, Carrum Downs VIC 3201</div>'
    + scr + '</body></html>';

  const w = window.open('', '_blank');
  if (!w) { return false; }     // pop-up blocked
  w.document.write(html); w.document.close();
  return true;
}
