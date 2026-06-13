/* Happy Days v3 (in-house) — suppliers.js
   Mango-market STALL DIRECTORY: stall number, supplier name and contact
   phone for each stall, plus a product-name index so the buy run can show
   "which stall" and a tap-to-call / tap-to-SMS button beside each line, and
   so the search can be filtered by stall number, stall name or contact.

   Data ported from the classic app's PRODUCTS table (schema was
   [supplier, stall, phone, …]) — the same supplier contacts already shipped
   there, no new exposure. Matching is by produce name with a 4-char-prefix
   compare (so "Onions Brown /kg" resolves to the stall that sells
   "Onion Brown 10kg Bag"). No cost or price data lives in this file. */

/* eslint-disable */
export const SUPPLIERS = [{"supplier":"Sabrini Foods","stall":"","phone":"+61 3 9767 6666"},{"supplier":"Superior Food","stall":"","phone":"(03) 9538 0800"},{"supplier":"Gulli Food","stall":"","phone":"1300 448 554"},{"supplier":"Louis","stall":"35","phone":"0487299761"},{"supplier":"IFP 85 (Dave)","stall":"85","phone":"0413240635"},{"supplier":"Plant Bakery","stall":"","phone":"1300 121 584"},{"supplier":"Mahadeva's Kitchen","stall":"","phone":"0393175653"},{"supplier":"Latorre's","stall":"63","phone":"0400520578"},{"supplier":"C & S Ponte","stall":"139","phone":"0439036119"},{"supplier":"Fresh Mix Produce","stall":"650","phone":"0469712618"},{"supplier":"Gazzola Farms","stall":"56","phone":"0448970522"},{"supplier":"Jims Fresh","stall":"738","phone":""},{"supplier":"LPG (Joey)","stall":"","phone":"0499551343"},{"supplier":"Alba Cheese","stall":"","phone":"+61 3 9330 2282"},{"supplier":"Independent Produce","stall":"85","phone":"0418347071"},{"supplier":"MazCorp","stall":"129","phone":"0408444518"},{"supplier":"Fresh Berry 117","stall":"117","phone":"0418551394"},{"supplier":"Trescano","stall":"79","phone":""},{"supplier":"Baker Boys","stall":"","phone":"0428 437 394"},{"supplier":"Antonello Produce","stall":"13","phone":"0423415213"},{"supplier":"Arcella Bananas","stall":"57","phone":"0405546801"},{"supplier":"Coolibah","stall":"","phone":"0477618024"},{"supplier":"Redimilk","stall":"","phone":"(03) 9702 4262"},{"supplier":"Accredited Distributors","stall":"","phone":"03 9703 8500"},{"supplier":"Tripod Farmers Group","stall":"109","phone":""},{"supplier":"BRP 59 (Andrew)","stall":"59","phone":"0412417668"},{"supplier":"CN Fresh","stall":"8","phone":"0422245868"},{"supplier":"Sculli and Co","stall":"","phone":"0403094011"},{"supplier":"Kim Phu Fresh","stall":"middle","phone":"0411634995"},{"supplier":"Haryana Traders","stall":"","phone":"0485 933 166"},{"supplier":"Young Sang & Co","stall":"45","phone":""},{"supplier":"Perfection Fresh","stall":"47","phone":"0297631877"},{"supplier":"Flavorite Marketing","stall":"85","phone":"0383725610"},{"supplier":"Tripod (Stall 111)","stall":"111","phone":"0401774171"},{"supplier":"JJ's (Jack)","stall":"","phone":"0421888722"},{"supplier":"TEN Farm (Chris)","stall":"","phone":"0411822703"},{"supplier":"Five Senses","stall":"","phone":"(08) 9557 0800"}];
const PIDX = [["bittermelon karela",26],["guava",26],["onion brown",19],["onion red",19],["potato washed",19],["mandarin imperial",3],["lemon",3],["orange navel",3],["orange naval",3],["lime",3],["grapefruit ruby red",3],["grapefruit marsh",3],["kiwifruit nz green",3],["silverbeet",3],["rhubarb",3],["turnip",3],["celeriac",3],["thyme",3],["rosemary",3],["lemongras",3],["cauliflower fresh",30],["blackberrie",31],["celery size",10],["cucumber continental xxl",10],["chinese cabbage",10],["fennel",10],["parsnip",10],["asparagu",10],["brussel sprout",10],["broccoli",10],["avocado has",20],["banana extra large",20],["ladyfinger banana",20],["cucumber lebanese small",7],["melon rock",7],["zucchini",7],["eggplant",7],["capsicum red",7],["capsicum green large",7],["tomatoe roma",7],["bean rugby",7],["green chilli",7],["chilli red bird eye",7],["snow pea",7],["kiwifruit gold",32],["apple jazz",14],["apple pink lady",14],["apple red gala",14],["apple granny smith",14],["pear packham",14],["pear corella",14],["plum",14],["tomato cherry",4],["tomatoe trus",4],["broccolini",4],["grape white seedles",4],["grape red seedles",4],["strawberrie premium",4],["strawberrie regular",4],["cherrie",4],["white nectarine large",4],["yellow nectarine large",4],["white peach large",4],["yellow peach large",4],["calypso mangoe",4],["baby spinach packet",24],["gourmet salad mix",24],["rocket leave",24],["lettuce baby co twin",33],["cabbage red half",15],["cabbage plain",15],["corn sweet",15],["garlic",15],["iceberg lettuce",15],["beetroot",9],["bok choy shanghai",9],["coriander bunche",9],["curry leave",9],["endive",9],["fenugreek methi",9],["kale",9],["parsley",9],["turmeric",9],["watercres",9],["mint sleeve",11],["radish red",11],["spinach",11],["onion spring",11],["pineapple",27],["passionfruit flamenco",27],["okra bhindi",28],["radish white",28],["sweet potato washed",8],["sweet potato brushed",8],["potato sweet potato medium",8],["ginger",8],["pumpkin jap",8],["pumpkin butternut",8],["watermelon seedles",8],["date",8],["swede",8],["shallot",8],["pickling onion",8],["blueberrie jumbo",16],["blueberrie regular",16],["carrot premium",16],["carrot premium medium",16],["carrot",16],["carrot catering",16],["basil",21],["mint",21],["curly parsley",21],["continental parsley",21],["leek",34],["apricot",17],["nectarine white small",17],["nectarine yellow small",17],["peach white small",17],["peach yellow small",17],["mushroom white cup",25],["mushroom white flat",25],["mushroom brown",25],["papaya red",35],["melon sunshine yellow",12],["mangoe r2e2",12],["mangoe kp",12],["mangoe maha",12],["mung bean sprout",12],["peashoot",12],["beansprout",12],["alfalfa sprout",12],["coriander seed pattu",0],["jaggery powder sabrini",0],["salt iodised pattu",0],["atta flour aashirvaad",0],["atta multigrain flour aashirvaad",0],["dark soy sauce ching",0],["schezwan hot sauce ching secret",0],["ching chowmein noodle masala foc ching secret",0],["besan fine pattu",0],["rice flour coarse pattu",0],["rice flour fine pattu",0],["semolina coarse pattu",0],["semolina fine pattu",0],["ghee pet jar grb",0],["brown ghee pet jar grb",0],["garlic crushed pattu",0],["ginger garlic crushed pattu",0],["makhana plain pattu",0],["black lentil pattu",0],["channa dhall pattu",0],["chickpea kabuli pattu",0],["chickpea tyson pattu",0],["mung bean berken pattu",0],["mung dhall pattu",0],["red kidney bean dark pattu",0],["sabudana pattu",0],["sesame seed white pattu",0],["urid dhall white pattu",0],["urid split pattu",0],["urid whole black pattu",0],["yellow split pea pattu",0],["peanut raw small pattu",0],["gingelly oil miller",0],["mustard oil miller",0],["sunflower oil miller",0],["desi all in one chutney pattu",0],["date tamarind chutney pattu",0],["mint chutney pattu",0],["daawat brown rice",0],["daawat biryani rice",0],["everyday rice daawat",0],["poha medium pattu",0],["ajwain seed pattu",0],["star aniseed powder pattu",0],["cardamom green pattu",0],["chilli powder hot pattu",0],["clove whole pattu",0],["cumin seed pattu",0],["coriander powder pattu",0],["dry ginger pattu",0],["fenugreek seed pattu",0],["fennel seed pattu",0],["flax seed pattu",0],["ginger powder pattu",0],["garam masala pattu",0],["kalonji pattu",0],["mustard seed brown pattu",0],["black pepper powder pattu",0],["poppy seed black pattu",0],["turmeric powder pattu",0],["dark fantasy fantastik choco mocha creme sunfeast",0],["himalayan pink salt shan",0],["atta grewal",0],["gold tea tata tea",0],["cheer tasty cheese slice",22],["devondale mozzarella shredded",22],["sungold jersey milk",22],["sungold jersey lite milk",22],["mutti tomato ketchup classic x6",2],["mutti baby roma",2],["mutti cherry tomatoe",2],["mutti passata",2],["mutti passata organic",2],["mutti paste",2],["mutti peeled tomatoe",2],["mutti polpa chopped",2],["mutti sugo semplice basil",2],["mutti polpa chopped organic",2],["mutti san marzano",2],["olitalia extra virgin olive oil chefmania",2],["marchetti pasta conchiglioni",2],["marchetti pasta filejia",2],["marchetti pasta maccheroni al ferro",2],["marchetti pasta mafalda",2],["marchetti pasta orecchiette",2],["pasta jesce gluten free spaghetti",2],["di martino dolce gabbana spaghetti",2],["di martino dolce gabbana penne mezz rigate",2],["di martino dolce gabbana fusilata casare",2],["di martino dolce gabbana elicoidali",2],["ellebi rice arborio",2],["ellebi rice carnaroli",2],["mutti passata with basil",2],["catering white sliced",18],["turkish",18],["beetroot burger bun seed",18],["almond croissant",18],["choc almond croissant",18],["crompton road",36],["ricotta",13],["mozzarella",13],["shredded cheddar",13],["shredded mozzarella",13],["pizza blend",13],["haloumy",13],["grated parmesan",13],["fetta",13],["sweet nectar snickerz slice",5],["sweet nectar ferrero slice",5],["sweet nectar lemon cheesecake slice",5],["sweet nectar passionfruit cheesecake slice",5],["sweet nectar notella bar",5],["sweet nectar coconut rough protein ball",5],["plant baked caramel slice",5],["plant baked hazelnut bueno slice",5],["plant baked chocolate mud cake",5],["plant baked white choco raspberry mud cake",5],["plant baked notella mud cake",5],["plant baked blood orange pistachio cake",5],["plant baked vanilla passionfruit cake",5],["plant baked banana cake",5],["red velvet cake",6],["tiramisu cake",6],["rich ganache cake",6],["berry brownie",6],["salted caramel mud cake",6],["biscoff brownie",6],["toffee caramel brownie",6],["walnut brownie",6],["peanut butter brownie",6],["blueberry brownie",6],["carrot cake",6],["tiramisu brownie",6],["milk cow",29],["milk homo",29],["butter unsalted",1],["cheese spread cream philly",1],["dip beetroot homestyle",1],["dip spicy capsicum",1],["margarine nuttelex buttery",1],["margarine nuttelex",1],["beetroot sliced a10",1],["biscuit pc anzac choc chip",1],["mayonnaise chipotle vegan",1],["mayonnaise vegan",1],["sauce sriracha hot chilli",1],["sugar brown",1],["sugar caster",1],["sugar raw",1],["butter pc",1],["capsicum chargrill fresh",1],["cheese cheddar slice processed",1],["cheese cream",1],["eggplant chargrill fresh",1],["pesto basil",1],["honey squeeze",1],["olive kalamata sliced",1],["salt table",1],["sugar pc raw stick",1],["sugar pc white stick",1],["syrup maple",1],["bega peanut butter crunchy",23],["bega peanut butter smooth",23],["nutella",23],["heinz tomato ketchup top down",23]];

/** Normalise a product/query name to distinctive tokens (singular, no units). */
function norm(name) {
  return String(name || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/s$/, ''))
    .filter((t) => t.length >= 2 && !/^[0-9]/.test(t) &&
      ['kg', 'g', 'each', 'ea', 'loose', 'bag', 'box', 'boxe', 'ctn', 'punnet',
       'bunch', 'pack', 'tray', 'per', 'the', 'of', 'and'].indexOf(t) < 0);
}

/* Pre-tokenise the index once, to 4-char prefixes (plural/spelling tolerant). */
const IDX = PIDX.map(([sig, s]) => ({ p: sig.split(' ').map((t) => t.slice(0, 4)), s }));

/** Best stall for a product name → {supplier, stall, phone} or null.
   The leading produce noun must align and a third of the tokens must overlap,
   so a wrong stall is never shown — a miss just shows no stall (graceful). */
export function stallFor(name) {
  const a = norm(name).map((t) => t.slice(0, 4));
  if (!a.length) return null;
  const aset = new Set(a);
  let best = null, bestScore = 0;
  for (const e of IDX) {
    if (e.s == null) continue;
    if (!aset.has(e.p[0]) && a.indexOf(e.p[0]) < 0 && e.p.indexOf(a[0]) < 0) continue;
    let overlap = 0;
    for (const p of e.p) if (aset.has(p)) overlap++;
    if (!overlap) continue;
    const score = overlap / Math.max(a.length, e.p.length);
    if (score > bestScore) { bestScore = score; best = e.s; }
  }
  if (best == null || bestScore < 0.34) return null;
  return SUPPLIERS[best] || null;
}

/** Suppliers matching a query by stall number, supplier name or phone
   (multi-word, any order). Returns [] for an empty query. */
export function searchSuppliers(q) {
  const s = String(q || '').toLowerCase().trim();
  if (!s) return [];
  const terms = s.split(/\s+/).filter(Boolean);
  return SUPPLIERS.filter((sup) => {
    const hay = (sup.supplier + ' stall ' + sup.stall + ' ' + sup.phone).toLowerCase();
    return terms.every((t) => hay.indexOf(t) >= 0);
  });
}
