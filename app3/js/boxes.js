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
  if (m.loose) return 'loose · by weight';
  return '≈ ' + m.boxes + ' box' + (m.boxes === 1 ? '' : 'es') + ' of ' + m.per + ' ' +
    unitLabel(m.by, m.per) + (m.spare > 0 ? ' (' + m.spare + ' spare)' : '');
}
