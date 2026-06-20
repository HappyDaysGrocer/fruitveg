/* Happy Days v3 (in-house) — boxes.js
   Whole-box conversion for the Mandi buy run (port of v1's engine, same
   owner-confirmed sizes). Resolution order: the team's own override from
   /boxsizes (set in the classic app, synced — it WINS so floor corrections
   beat the baked rules) → name-regex rules below → null (no annotation).
   `loose:true` = bought by weight, no box rounding. Pack sizes only —
   nothing sensitive lives in this file. */

import { boxOverrides } from './store.js';

const DEFS = [
  { re: /\bapple/i, per: 12, by: 'kg' },
  { re: /\bzucchini/i, per: 10, by: 'kg' },
  { re: /strawberr/i, per: 12, by: 'punnet' },
  { re: /\bcos\b/i, per: 10, by: 'each' },
  { re: /\bbasil\b|\bcoriander\b|\bmint\b|\bparsley\b|\bdill\b|\bchive\b|\bchervil\b|\boregano\b|\brosemary\b|\bsage\b|\btarragon\b|\bthyme\b|fenugreek|methi/i, per: 10, by: 'bunch' },
  { re: /onion.*brown|brown.*onion|brown\s+loose/i, per: 10, by: 'kg' },
  { re: /onion.*red|red.*onion/i, per: 10, by: 'kg' },
  { re: /spring\s*onion|onion\s*spring/i, per: 10, by: 'bunch' },
  { re: /cauliflower/i, per: 10, by: 'each' },
  { re: /cherr/i, per: 12, by: 'punnet' },
  { re: /avocado/i, per: 20, by: 'each' },
  { re: /blueberr|berries\s*blue|blue\s*berr/i, per: 12, by: 'punnet' },
  { re: /raspberr|berries\s*rasp|rasp\s*berr/i, per: 12, by: 'punnet' },
  { re: /blackberr|berries\s*black|black\s*berr/i, per: 12, by: 'punnet' },
  { re: /carrot.*dutch|dutch.*carrot/i, per: 10, by: 'bunch' },
  { re: /carrot.*catering|catering.*carrot/i, per: 15, by: 'kg' },
  { re: /carrot.*(premium|loose|jack|sumich)|(premium|jack|sumich).*carrot/i, per: 20, by: 'kg' },
  { re: /carrot.*large|large.*carrot/i, per: 20, by: 'kg' },
  { re: /iceberg/i, per: 10, by: 'each' },
  { re: /spinach\s*bunch/i, per: 10, by: 'bunch' },
  { re: /mushroom.*button|button.*mushroom/i, per: 4, by: 'kg' },
  { re: /tomato.*round|tomato.*hydro|tomato.*gourmet/i, per: 10, by: 'kg' },
  { re: /pineapple/i, per: 8, by: 'each' },
  { re: /celery/i, per: 10, by: 'each' },
  { re: /bok\s*cho/i, per: 10, by: 'bunch' },
  { re: /silverbeet|silver\s*beet/i, per: 10, by: 'bunch' },
  { re: /beetroot|beet\s*root/i, per: 20, by: 'kg' },
  { re: /radish/i, per: 10, by: 'bunch' },
  { re: /\bcorn\b/i, per: 24, by: 'each' },
  { re: /garlic/i, per: 10, by: 'kg' },
  { re: /capsicum/i, per: 10, by: 'kg' },
  { re: /cucumber.*cont|continental.*cucumber/i, per: 15, by: 'kg' },
  { re: /cucumber.*leb|lebanese.*cucumber/i, per: 10, by: 'kg' },
  { re: /eggplant/i, per: 7, by: 'kg' },
  { re: /\bbeans\b/i, per: 10, by: 'kg' },
  { re: /grape/i, per: 10, by: 'kg' },
  { re: /\bpear/i, per: 13, by: 'kg' },
  { re: /kiwi/i, per: 9, by: 'kg' },
  { re: /mushroom.*cup|cup.*mushroom/i, per: 4, by: 'kg' },
  { re: /mushroom.*flat|flat.*mushroom/i, per: 4, by: 'kg' },
  { re: /mushroom.*brown|brown.*mushroom/i, per: 3, by: 'kg' },
  { re: /ginger/i, by: 'kg', loose: true },
  { re: /papaya/i, per: 8, by: 'kg' },
  { re: /pumpkin.*jap|jap.*pumpkin/i, per: 28.9, by: 'kg' },
  { re: /pumpkin.*butternut|butternut.*pumpkin/i, per: 24, by: 'kg' },
  { re: /pumpkin.*(grey|gray|queen)|(grey|gray|queen)\s*pumpkin/i, by: 'kg', loose: true },
  { re: /watermelon.*seedless|seedless.*watermelon/i, per: 33.5, by: 'kg' },
  { re: /watermelon/i, by: 'kg', loose: true },
  { re: /tomato.*roma|roma.*tomato/i, per: 10, by: 'kg' },
  { re: /tomato.*truss|truss.*tomato/i, per: 5, by: 'kg' },
  { re: /lemon/i, per: 10, by: 'kg' },
  { re: /orange/i, per: 10, by: 'kg' },
  { re: /banana/i, per: 15, by: 'kg' },
  { re: /broccolini/i, per: 10, by: 'bunch' },
  { re: /\bkale\b/i, per: 10, by: 'bunch' },
  { re: /\boak\b|oakleaf|oak\s*leaf/i, per: 12, by: 'each' }
];

const round2 = (x) => Math.round(x * 100) / 100;

function unitLabel(by, n) {
  if (by === 'kg') return 'kg';
  if (by === 'punnet') return n === 1 ? 'punnet' : 'punnets';
  if (by === 'bunch') return n === 1 ? 'bunch' : 'bunches';
  return n === 1 ? 'piece' : 'pieces';
}

/** Box definition for a product name: team override > baked rule > null. */
export function boxFor(name) {
  const n = String(name || '').toLowerCase().trim();
  const ov = boxOverrides()[n];
  if (ov && +ov.per > 0) return { per: +ov.per, by: ov.by || 'each', loose: false };
  for (const d of DEFS) {
    if (d.re.test(name)) return { per: d.per || 0, by: d.by, loose: !!d.loose };
  }
  return null;
}

/** Whole-box math for a needed qty: round UP, report the spare. */
export function boxMath(name, qty) {
  const def = boxFor(name);
  qty = Number(qty) || 0;
  if (!def || qty <= 0) return null;
  if (def.loose) return { loose: true, by: def.by };
  if (!(def.per > 0)) return null;
  const boxes = Math.ceil(qty / def.per - 1e-9);
  return { boxes, per: def.per, by: def.by, spare: round2(boxes * def.per - qty), loose: false };
}

/** Short row annotation: "≈ 2 boxes of 12 kg (5 spare)" / "loose · by weight". */
export function boxLine(name, qty) {
  const m = boxMath(name, qty);
  if (!m) return '';
  if (m.loose) return 'per kg';
  return '≈ ' + m.boxes + ' box' + (m.boxes === 1 ? '' : 'es') + ' of ' + m.per + ' ' +
    unitLabel(m.by, m.per) + (m.spare > 0 ? ' (' + m.spare + ' spare)' : '');
}

/* ----- purchase (market) unit: how you BUY & STOCK an item -----------------
   The Stock-on-hand page counts in these units (boxes / bags), not retail
   kg/each. Source of the size: team override > baked box rule (boxFor) > a
   pack size written into the SKU name itself (e.g. "Potato Peeled 10kg Bag"). */

const PACK_WORD_RE = /\b(cartons?|boxe?s?|bags?|sacks?|cases?|crates?|trays?|sleeves?|punnets?|packs?|pk)\b/i;

/** Parse a pack size embedded in a SKU name -> {per, by, word} | null.
    "10kg Bag"->{10,kg,bag}  "Mushroom Cups 4kg Box"->{4,kg,box}  "Twin Pack"->{0,each,pack} */
export function parsePack(name) {
  const n = String(name || '');
  const kg = n.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  const g = n.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const wm = n.match(PACK_WORD_RE);
  if (!kg && !g && !wm) return null;
  let per = 0, by = 'each';
  if (kg) { per = parseFloat(kg[1]); by = 'kg'; }
  else if (g) { per = round2(parseFloat(g[1]) / 1000); by = 'kg'; }
  let word = wm ? wm[1].toLowerCase() : 'box';
  if (word === 'pk') word = 'pack';
  word = word.replace(/(es|s)$/, '');            // boxes->box, bags->bag, punnets->punnet
  if (word === 'box' || word === 'boxe' || word === 'bo') word = 'box';
  return { per, by, word };
}

/** The unit you BUY this item in at the market.
    {kind:'box'|'loose'|'none', per, by, word}. */
export function purchaseUnit(name) {
  const box = boxFor(name);          // team override + baked rules (per kg/bunch/etc.)
  const pack = parsePack(name);      // size/word written into the SKU name
  const word = (pack && pack.word) ? pack.word : 'box';
  if (box) {
    if (box.loose) return { kind: 'loose', per: 0, by: box.by || 'kg', word: 'kg' };
    if (box.per > 0) return { kind: 'box', per: box.per, by: box.by, word };
  }
  if (pack) {
    if (pack.per > 0) return { kind: 'box', per: pack.per, by: pack.by, word };
    return { kind: 'box', per: 0, by: 'each', word };   // pack word but no size
  }
  return { kind: 'none', per: 0, by: '', word: '' };
}

/** Short label for the purchase unit: "12kg box" / "box of 10 bunches" / "per kg". */
export function purchaseUnitLabel(name) {
  const u = purchaseUnit(name);
  if (u.kind === 'loose') return 'per kg';          // by weight — count/price by the kilo
  if (u.kind === 'none') return '';
  if (u.per > 0) {
    return u.by === 'kg'
      ? u.per + 'kg ' + u.word
      : u.word + ' of ' + u.per + ' ' + unitLabel(u.by, u.per);
  }
  return u.word;
}
