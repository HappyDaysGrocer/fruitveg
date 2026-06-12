/* build-catalog.cjs — generate app2/catalog.js (PUBLIC, cost-free).
   Reads ../shopProducts.js (which carries purchase COSTS) and writes a
   catalogue that contains ONLY what a customer may see:
     category, product name, RETAIL sell price, barcode.
   NO purchase cost, NO box/wholesale cost, NO margin — nothing financial
   beyond the shelf price. The v2 customer app loads THIS, never the costy
   shopProducts.js, so costs never reach the public bundle.
   Re-run whenever sell prices change:  node app2/build-catalog.cjs        */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'shopProducts.js');
const OUT = path.join(__dirname, 'catalog.js');

// shopProducts.js is a browser global (var SHOP_PRODUCTS = [...]). Eval it in
// this (non-strict) scope so the var binding becomes visible here.
const code = fs.readFileSync(SRC, 'utf8');
// Run the browser-global script in its own scope and hand back the array.
const SHOP_PRODUCTS = new Function(code + '\nreturn SHOP_PRODUCTS;')();

// Categories NOT offered for delivery/ordering (owner 2026-06-12: no cafe
// counter items, nothing "club", no croissants, no wastage lines).
const EXCLUDE_CAT = /^(cafe\b|cafe-|club\b|croissant|wastage|cakes\b|brownie\b|cookie\b|iced coffee\b)/i;
const EXCLUDE_NAME = /club\s*membership|croissant|wastage/i;
// Barista counter drinks living inside the retail Coffee/Tea categories —
// made at the till, not delivered (owner 2026-06-12: no cafe items).
const EXCLUDE_EXACT = new Set([
  'Babyccino', 'Cappuccino', 'Flat White', 'Latte', 'Long Black',
  'Long Macchiato', 'Magic', 'Mocha', 'Piccolo', 'Short black',
  'Short Macchiato', 'Chai Latte', 'Hot Chocolate', 'Matcha Latte',
  'Tea- Chamomile', 'Tea- Earl Grey', 'Tea- English Breakfast',
  'Tea- Green Tea', 'Tea- Lemon grass and Ginger', 'Tea- Peppermint'
]);

// Woolworths-style aisle for each EPOS category (produce cats A-B…S-Z and
// Herbs stay untouched per the owner). Aisle rides in the row's `g` field;
// the fine category stays in `c` (the catalogue KEY — never changes).
const GROUP_MAP = {
  'Alternative Milk': 'Dairy, Eggs & Fridge',
  'Butter': 'Dairy, Eggs & Fridge',
  'Cheese': 'Dairy, Eggs & Fridge',
  'Vegan Cheese': 'Dairy, Eggs & Fridge',
  'Yogurt': 'Dairy, Eggs & Fridge',
  'Dips': 'Dairy, Eggs & Fridge',
  'Asain': 'Pantry',
  'Biscuits': 'Pantry',
  'Canned Goods': 'Pantry',
  'Cereal': 'Pantry',
  'Confectionary': 'Pantry',
  'Dhal': 'Pantry',
  'Dry Nuts': 'Pantry',
  'Flour': 'Pantry',
  'Grain': 'Pantry',
  'Honey': 'Pantry',
  'Jam': 'Pantry',
  'Oil': 'Pantry',
  'Olives': 'Pantry',
  'Pasata': 'Pantry',
  'Pasta': 'Pantry',
  'Pasta Sauce': 'Pantry',
  'Rice': 'Pantry',
  'Sauce': 'Pantry',
  'Seed': 'Pantry',
  'Spice': 'Pantry',
  'Sugar': 'Pantry',
  'Chips': 'Snacks & Confectionery',
  'Chocolate': 'Snacks & Confectionery',
  'Chocolates': 'Snacks & Confectionery',
  'Coffee': 'Drinks',
  'Tea': 'Drinks',
  'Juice': 'Drinks',
  'Soft Drink': 'Drinks',
  'Water': 'Drinks',
  'Non Alcoholic Wine': 'Drinks',
  'Frozen': 'Freezer',
  'Ice Cream': 'Freezer',
  'Cleaning': 'Household & Personal Care',
  'Toilet': 'Household & Personal Care',
  'Party Goods': 'Household & Personal Care'
};

// Column map: [category0, stall1, phone2, name3, defaultQty4, boxPrice5,
//              cost6, sellPrice7, mustCheck8, barcode9]  — we keep 0,3,7,9 only.
const rows = (Array.isArray(SHOP_PRODUCTS) ? SHOP_PRODUCTS : [])
  .filter((r) => Array.isArray(r) && String(r[3] == null ? '' : r[3]).trim())
  .filter((r) => !EXCLUDE_CAT.test(String(r[0] == null ? '' : r[0]).trim()))
  .filter((r) => !EXCLUDE_NAME.test(String(r[3] == null ? '' : r[3])))
  .filter((r) => !EXCLUDE_EXACT.has(String(r[3] == null ? '' : r[3]).trim()))
  .map((r) => {
    const c = String(r[0] == null ? '' : r[0]).trim();
    const row = {
      c,                                           // category (part of the KEY)
      n: String(r[3]).trim(),                      // name
      s: (r[7] == null || r[7] === '') ? null : Number(r[7]), // sell (retail)
      b: r[9] == null ? '' : String(r[9]).trim()   // barcode
    };
    if (GROUP_MAP[c]) row.g = GROUP_MAP[c];        // Woolies-style aisle
    return row;
  });

// ---- per-piece sell units (owner's per-piece pricing sheet) ----
// perpiece.json: drop[] removes products, rename[] renames, addEach[]
// inserts a per-piece product (Each/Bag/Punnet/Whole/...) after its
// '/kg' base row — Woolworths-style separate each-vs-kg listings.
const PP = JSON.parse(fs.readFileSync(path.join(__dirname, 'perpiece.json'), 'utf8'));

const out = rows.filter((r) => !(PP.drop || []).includes(r.n));
for (const rn of (PP.rename || [])) {
  const hit = out.find((r) => r.n === rn.from);
  if (hit) hit.n = rn.to;
}
for (const a of (PP.addEach || [])) {
  const dup = out.find((r) => r.n === a.name);
  if (dup) {                                   // product already exists:
    if (dup.s == null || dup.s === 0) dup.s = Number(a.price);   // give it the price
    continue;
  }
  const idx = a.from ? out.findIndex((r) => r.n === a.from) : -1;
  if (a.from && idx < 0) console.warn('perpiece: base not found: "' + a.from + '" — appending "' + a.name + '" unanchored');
  const row = { c: idx >= 0 ? out[idx].c : (a.cat || ''), n: a.name, s: Number(a.price), b: '' };
  if (idx >= 0) out.splice(idx + 1, 0, row);
  else out.push(row);
}

const banner =
  '/* catalog.js — PUBLIC product list for the Happy Days v2 customer app.\n' +
  '   AUTO-GENERATED by app2/build-catalog.cjs — do not hand-edit.\n' +
  '   Contains ONLY: category, name, retail sell price, barcode.\n' +
  '   Deliberately carries NO purchase cost / wholesale cost / margin —\n' +
  '   no financial data of any kind reaches the customer-facing bundle. */\n';

const body =
  'window.HD_CATALOG = [\n' +
  out.map((r) => '  ' + JSON.stringify(r)).join(',\n') +
  '\n];\n';

fs.writeFileSync(OUT, banner + body, 'utf8');
console.log('wrote ' + OUT + ' — ' + out.length + ' products, cost-free (' +
  (PP.addEach || []).length + ' per-piece units merged).');
