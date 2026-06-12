/* align_grocery_prices.cjs — align GROCERY sell prices in shopProducts.js
   with an EPOS Now ProductList export (owner rule, 2026-06-12: everything
   OUTSIDE the produce categories must match the EPOS prices exactly;
   produce keeps its own pricing basis).

   Usage:  node app2/align_grocery_prices.cjs "<path to ProductList .csv>"
   Then:   node app2/build-catalog.cjs                                    */
const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2];
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Usage: node app2/align_grocery_prices.cjs "<EPOS ProductList .csv>"');
  process.exit(1);
}

const PRODUCE = new Set(['A-B', 'C-G', 'H-O', 'P-R', 'S-Z', 'Herbs']);

/* --- minimal CSV parse (handles quoted fields with commas) --- */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const rows = parseCsv(raw);
const hdr = rows[0];
const NAME = hdr.indexOf('Name');
const PRICE = hdr.indexOf('SalePriceIncTax');
if (NAME < 0 || PRICE < 0) { console.error('CSV missing Name/SalePriceIncTax columns'); process.exit(1); }

const epos = new Map(); // lowercased name -> price
for (const r of rows.slice(1)) {
  const name = String(r[NAME] || '').trim();
  const price = parseFloat(r[PRICE]);
  if (name && Number.isFinite(price)) epos.set(name.toLowerCase(), price);
}

const file = path.join(__dirname, '..', 'shopProducts.js');
const src = fs.readFileSync(file, 'utf8');
const SP = new Function(src + '\nreturn SHOP_PRODUCTS;')();

const changes = [], zeroSkipped = [], notInCsv = [];
for (const r of SP) {
  const cat = String(r[0] || '').trim();
  if (PRODUCE.has(cat)) continue;                      // produce keeps its basis
  const name = String(r[3] || '').trim();
  if (!name) continue;
  const ep = epos.get(name.toLowerCase());
  if (ep === undefined) { notInCsv.push(cat + ' | ' + name); continue; }
  if (ep === 0) { zeroSkipped.push(name); continue; }  // unpriced in EPOS — leave
  const cur = (r[7] == null || r[7] === '') ? null : Number(r[7]);
  if (cur === null || Math.abs(cur - ep) > 0.005) {
    changes.push({ cat, name, from: cur, to: ep });
    r[7] = ep;
  }
}

const q = (v) =>
  v === null || v === undefined ? 'null'
    : typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
    : String(v);

const header = src.slice(0, src.indexOf('var SHOP_PRODUCTS'));
const body = 'var SHOP_PRODUCTS = [\n' +
  SP.map((r) => '  [' + r.map(q).join(',') + '],').join('\n') + '\n];\n';
fs.writeFileSync(file, header + body, 'utf8');

console.log('CSV:', path.basename(csvPath), '·', epos.size, 'priced products');
console.log('price changes applied:', changes.length);
for (const c of changes) console.log(`  ${c.cat} | ${c.name} : ${c.from} -> ${c.to}`);
if (zeroSkipped.length) console.log('skipped ($0 in EPOS):', zeroSkipped.join('; '));
console.log('grocery items NOT in this CSV (left unchanged):', notInCsv.length);
for (const n of notInCsv.slice(0, 12)) console.log('  ', n);
