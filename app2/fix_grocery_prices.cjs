/* One-off: align grocery sell prices in shopProducts.js with the EPOS Now
   export 2026_06_05 ProductList ALL.csv (owner 2026-06-12: items outside
   the produce categories must match the EPOS prices exactly). */
const fs = require('fs');
const path = require('path');

const FIX = {
  'Mutti- Paste 440g': 9.95,
  'Dark chocolate almonds': 8.0,
  'Milk Freeze Dried Strawberries 200g': 12.0,
  'COYO Coconut Ice Cream Double Chocolate 500ml': 12.8,
  'COYO Coconut Ice Cream Vanilla Bean 500ml': 12.8,
  'COYO Coconut Milk Frozen Yoghurt Mango 500ml': 11.5,
  'COYO Coconut Milk Frozen Yoghurt Strawberry 500ml': 11.5,
  'Roho Ice Cream Cookie Sandwich Cashew Cream Honeycomb 175g': 9.99,
  'Roho Ice Cream Cookie Sandwich Coconut Vanilla 175g': 9.99,
  'Roho Ice Cream Cookie Sandwich Hazelnut Chocolate 175g': 9.99,
  '10 inch round plate paper equo 25 pack': 4.99,
  '12oz blue cups coffee cups 50 packet': 6.49,
  '16oz green cups coffee cups 50 packet': 7.49,
  '8oz white cups coffee cups 50 packet': 5.99,
  'Di Martino- Dolce & Gabbana Elicoidali 500g': 4.49,
  'Di Martino- Dolce & Gabbana Fusilata Casare 500g': 4.49,
  'Di Martino- Dolce & Gabbana Penne Mezz.Rigate 500g': 4.49,
  'Di Martino- Dolce & Gabbana Spaghetti 500g': 4.49,
  'Everyday /Daawat 5Kg': 14.0,
  'Dove Beauty Bar Original': 8.99
};
const PRODUCE = new Set(['A-B', 'C-G', 'H-O', 'P-R', 'S-Z', 'Herbs']);

const file = path.join(__dirname, '..', 'shopProducts.js');
const src = fs.readFileSync(file, 'utf8');
const SP = new Function(src + '\nreturn SHOP_PRODUCTS;')();

let hits = 0;
const seen = {};
for (const r of SP) {
  const name = String(r[3] || '').trim();
  if (!(name in FIX)) continue;
  if (PRODUCE.has(String(r[0] || '').trim())) continue;
  r[7] = FIX[name];
  hits++;
  seen[name] = (seen[name] || 0) + 1;
}

const q = (v) =>
  v === null || v === undefined ? 'null'
    : typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
    : String(v);

const header = src.slice(0, src.indexOf('var SHOP_PRODUCTS'));
const body = 'var SHOP_PRODUCTS = [\n' +
  SP.map((r) => '  [' + r.map(q).join(',') + '],').join('\n') + '\n];\n';
fs.writeFileSync(file, header + body, 'utf8');

console.log('rows updated:', hits);
const notSeen = Object.keys(FIX).filter((k) => !seen[k]);
console.log('names not matched:', notSeen.length ? notSeen : '(none)');
