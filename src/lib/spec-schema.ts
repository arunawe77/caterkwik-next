// Product schema per product family. A family is a group of Cooking categories that are bought on
// the same specification (all fryers share tank size and oil capacity; no fryer has a deck count).
// Every field is a published figure or absent: nothing here is ever estimated.
//
// Dependency-free on purpose: scripts/build-specs.mjs runs it directly under node.

export type FieldType = "number" | "text" | "flag" | "enum";
export type FieldGroup = "Capacity" | "Performance" | "Power & supply" | "Dimensions" | "Construction" | "Controls & features" | "Compliance & service";

export interface Pattern {
  /** Tested against each line of the product's text; capture group 1 is the value. */
  re: RegExp;
  /** Where to look: any line (default), or only the power / dimension lines. */
  in?: "power" | "dimensions" | "details" | "any";
  /** Turns the captured text into the stored value (default: Number for number fields, trimmed text otherwise). */
  to?: (m: RegExpMatchArray) => string | number | boolean | null;
}

export interface Field {
  key: string;
  label: string;
  group: FieldGroup;
  type: FieldType;
  unit?: string;
  /** Offered as a filter on category pages. */
  filter?: boolean;
  patterns: Pattern[];
  /** Reads the power block as a whole when a single line cannot carry the figure. */
  custom?: (lines: string[]) => { value: number | string; from: string } | null;
}

const N = "(\\d+(?:[.,]\\d+)?)";
const num = (s: string) => Number(s.replace(",", "."));

const f = (key: string, label: string, group: FieldGroup, type: FieldType, patterns: Pattern[], extra: Partial<Field> = {}): Field =>
  ({ key, label, group, type, patterns, ...extra });

const KW = /(\d+(?:[.,]\d+)?)\s*kW\b/i;
const GASWORDS = /\b(gas|nat|ng|lpg|btu|burner|pilot)\b/i;
const joined = (lines: string[]) => lines.join(" · ");

// Electrical rating: a kW (or W) figure on a line that is not about gas. The page often splits
// "8.4kW" and "230V, 50Hz" over two lines, so the first kW figure in the block is taken.
function electricKw(lines: string[]) {
  for (const l of lines) {
    if (GASWORDS.test(l) && !/electric/i.test(l)) continue;
    const m = l.match(KW);
    if (m && !/btu/i.test(l)) return { value: num(m[1]), from: l };
  }
  for (const l of lines) {
    const m = l.match(/\bwatts?\s*[:=]?\s*(\d[\d,]*)\s*W?\b/i) ?? l.match(/(?:^|[^\d.,])(\d[\d,]{2,5})\s*W\b(?!\s*(?:bulb|lamp))/);
    if (m) { const w = Number(m[1].replace(/,/g, "")); if (w >= 100 && w <= 100000) return { value: Math.round(w) / 1000, from: l }; }
  }
  return null;
}

// Gas rating: "NAT gas power: 29kW", "NG 3.3", "30 kW gas", or the kW printed beside a BTU figure.
function gasKw(lines: string[]) {
  const text = joined(lines);
  const pats = [
    /\b(?:nat(?:ural)?\.?\s*gas|ng)\b[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*kW/i,
    /\bgas\s*(?:power|rating|input|consumption|rated)[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*kW/i,
    /(\d+(?:[.,]\d+)?)\s*kW\s*(?:\(?\s*gas|nat)/i,
    /[\d,]{4,}\s*btu[^\d]{0,12}\(?\s*(\d+(?:[.,]\d+)?)\s*kW/i,
    /(\d+(?:[.,]\d+)?)\s*kW\s*[,(]?\s*[\d,]{4,}\s*btu/i,
  ];
  for (const re of pats) { const m = text.match(re); if (m) return { value: num(m[1]), from: m[0].slice(0, 160) }; }
  return null;
}

// ── Fields every Cooking product can have ─────────────────────────────────────────────────
export const COMMON_FIELDS: Field[] = [
  f("width", "Width", "Dimensions", "number", [
    { re: new RegExp(`\\bW(?:idth)?\\s*[:=]?\\s*${N}\\s*(?:mm)?\\s*[x×X*]\\s*D`, "i"), in: "dimensions" },
    { re: new RegExp(`\\bW(?:idth)?\\s*[:=]?\\s*${N}\\s*(?:mm)?\\s*[x×X*]\\s*D`, "i") },
  ], { unit: "mm", filter: true }),
  f("depth", "Depth", "Dimensions", "number", [
    { re: new RegExp(`\\bD(?:epth)?\\s*[:=]?\\s*${N}\\s*(?:mm)?\\s*[x×X*]\\s*H`, "i"), in: "dimensions" },
    { re: new RegExp(`\\bD(?:epth)?\\s*[:=]?\\s*${N}\\s*(?:mm)?\\s*[x×X*]\\s*H`, "i") },
  ], { unit: "mm" }),
  f("height", "Height", "Dimensions", "number", [
    { re: new RegExp(`\\bD(?:epth)?\\s*[:=]?\\s*${N}\\s*(?:mm)?\\s*[x×X*]\\s*H(?:eight)?\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)`, "i"), in: "dimensions", to: (m) => num(m[2]) },
    { re: new RegExp(`\\bD(?:epth)?\\s*[:=]?\\s*${N}\\s*(?:mm)?\\s*[x×X*]\\s*H(?:eight)?\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)`, "i"), to: (m) => num(m[2]) },
  ], { unit: "mm" }),
  f("weight", "Weight", "Dimensions", "number", [{ re: new RegExp(`\\bweight\\b[^\\d\\n]{0,20}${N}\\s*kgs?\\b`, "i") }, { re: new RegExp(`\\b${N}\\s*kgs?\\s*(?:net\\s*)?weight`, "i") }], { unit: "kg" }),
  f("electricKw", "Electrical rating", "Power & supply", "number", [], { unit: "kW", custom: electricKw }),
  f("gasKw", "Gas rating (natural gas)", "Power & supply", "number", [], { unit: "kW", custom: gasKw }),
  f("amps", "Supply current", "Power & supply", "number", [{ re: /(?:amps?|current)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*A\b/i, in: "power" }, { re: /\b(\d+(?:[.,]\d+)?)\s*A(?:mp)?s?\b(?!\s*plug)/i, in: "power" }], { unit: "A" }),
  f("lpgKw", "LPG rating", "Power & supply", "number", [{ re: new RegExp(`\\bLPG[^\\d\\n]{0,25}${N}\\s*kW`, "i") }], { unit: "kW" }),
  f("voltage", "Voltage", "Power & supply", "text", [{ re: /\b(\d{3}\s*V(?:\s*\/\s*\d{2,3}\s*V)?(?:\s*,?\s*50\s*Hz)?)/i, in: "power" }]),
  f("phase", "Electrical phase", "Power & supply", "enum", [
    { re: /\b(three[\s-]*phase|3[\s-]*ph(?:ase)?)\b/i, to: () => "three" },
    { re: /\b(single[\s-]*phase|1[\s-]*ph(?:ase)?)\b/i, to: () => "single" },
  ], { filter: true }),
  f("plug", "Plug", "Power & supply", "text", [{ re: /\b(13\s*A\b[^.\n]{0,30}plug|plug\s*supplied|16\s*A\b[^.\n]{0,20}|32\s*A\b[^.\n]{0,20})/i, in: "power" }]),
  f("hardWired", "Hard-wired", "Power & supply", "flag", [{ re: /(requires?\s*hard[\s-]*wir\w+|hard[\s-]*wired)/i, to: () => true }]),
  f("gasConnection", "Gas connection", "Power & supply", "text", [{ re: /((?:[¼½¾]|\d\/\d|\d)\s*(?:"|inch|in\b)[^.\n]{0,24}(?:gas|hose|bsp|connection)[^.\n]{0,20})/i }]),
  f("warranty", "Warranty", "Compliance & service", "text", [
    { re: /(\d+)\s*[- ]?(?:year|yr)s?\b[^\n]{0,30}warranty/i, to: (m) => `${m[1]} year${m[1] === "1" ? "" : "s"}` },
    { re: /warranty[^\d\n]{0,25}(\d+)\s*(?:year|yr)/i, to: (m) => `${m[1]} year${m[1] === "1" ? "" : "s"}` },
  ]),
  f("finish", "Finish", "Construction", "text", [{ re: /\b((?:stainless steel|black|white|silver|chrome|vitreous enamel(?:led)?)\s*(?:finish|exterior|construction|body|casing)?)/i, in: "details" }]),
];

// ── Families ──────────────────────────────────────────────────────────────────────────────
const gn = f("gnCapacity", "Gastronorm capacity", "Capacity", "text", [{ re: /\b(\d{1,2}\s*[x×]\s*\d\/\d\s*(?:GN|gastronorm))/i }, { re: /\b(\d\/\d\s*(?:GN|gastronorm)(?:\s*static)?(?:\s*oven)?)/i }], { filter: true });
const temp = f("tempRange", "Temperature range", "Performance", "text", [{ re: /(?:temp(?:erature)?[^\d\n]{0,25})?(\d{2,3}\s*°?\s*C?\s*(?:[-–to]+)\s*\d{2,3}\s*°\s*C)/i }]);
const maxTemp = f("maxTemp", "Maximum temperature", "Performance", "number", [{ re: /\b(?:max(?:imum)?\.?\s*temp(?:erature)?|up to|reaches?)[^\d\n]{0,15}(\d{3})\s*°\s*C/i }, { re: /(\d{3})\s*°\s*C\s*max/i }], { unit: "°C" });
const burners = f("burners", "Burners", "Capacity", "number", [{ re: /\b(\d{1,2})\s*(?:x\s*)?(?:open\s*)?burners?\b/i }, { re: /\b(\d{1,2})\s*burner/i }], { filter: true });
const ovenCount = f("ovenCavities", "Oven cavities", "Capacity", "number", [{ re: /\b(\d)\s*(?:x\s*)?(?:oven|deck|chamber)s?\b/i }]);

export interface Family {
  id: string;
  label: string;
  /** Matched against a category's URL path. First family whose pattern matches wins. */
  match: RegExp;
  /** One line that frames what a buyer decides on in this family. */
  decides: string;
  fields: Field[];
}

export const FAMILIES: Family[] = [
  {
    id: "combi", label: "Combination ovens", match: /combination-ovens|combi/i,
    decides: "Tray capacity, steam system and the water and power the kitchen has available.",
    fields: [
      gn,
      f("trayPitch", "Tray pitch", "Capacity", "number", [{ re: new RegExp(`pitch[^\\d\\n]{0,12}${N}\\s*mm`, "i") }, { re: new RegExp(`${N}\\s*mm\\s*pitch`, "i") }], { unit: "mm" }),
      f("steam", "Steam generation", "Performance", "enum", [{ re: /\b(boiler|direct steam|steam injection|injection)\b/i, to: (m) => (/boiler/i.test(m[1]) ? "boiler" : "injection") }], { filter: true }),
      temp, maxTemp,
      f("programs", "Stored programs", "Controls & features", "number", [{ re: /\b(\d{2,4})\s*(?:stored\s*)?(?:programmes?|programs|recipes)\b/i }]),
      f("autoClean", "Automatic cleaning", "Controls & features", "flag", [{ re: /(auto(?:matic)?[\s-]*(?:wash|clean)\w*|self[\s-]*clean\w*)/i, to: () => true }], { filter: true }),
      f("waterConnection", "Water supply", "Power & supply", "text", [{ re: /(water\s*(?:supply|connection|inlet|pressure)[^.\n]{0,60})/i }]),
      f("probe", "Core probe", "Controls & features", "flag", [{ re: /(core\s*(?:temperature\s*)?probe|food probe)/i, to: () => true }]),
      f("connectivity", "Connectivity", "Controls & features", "text", [{ re: /(wi-?fi|wireless|usb|ethernet|haccp)[^.\n]{0,30}/i }]),
    ],
  },
  {
    id: "pizza", label: "Pizza ovens", match: /pizza|wood-fired/i,
    decides: "How many pizzas an hour, deck size and whether it runs on gas, electric or wood.",
    fields: [
      f("decks", "Decks", "Capacity", "number", [{ re: /\b(single|twin|double|triple|\d)[\s-]*deck/i, to: (m) => ({ single: 1, twin: 2, double: 2, triple: 3 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]) }], { filter: true }),
      f("pizzaSize", "Pizza size", "Capacity", "text", [{ re: /(\d{1,2}\s*(?:["”']|inch|in\b|cm)\s*(?:pizzas?)?)/i }, { re: /(\d+\s*x\s*\d{2}\s*(?:cm|"|inch)\s*pizzas?)/i }]),
      f("pizzasPerHour", "Pizzas per hour", "Performance", "number", [{ re: /\b(\d{2,3})\s*pizzas?\s*(?:per|an|\/)\s*h/i }]),
      f("chamber", "Chamber size", "Capacity", "text", [{ re: /((?:chamber|baking (?:area|surface)|deck)\s*(?:size|dimensions?)?[^\d\n]{0,10}W?\s*\d+[^.\n]{0,40})/i }]),
      f("stone", "Cooking surface", "Construction", "text", [{ re: /\b(refractory|firebrick|stone|ceramic|steel)\b[^.\n]{0,30}(?:deck|base|floor|hearth|brick)/i }]),
      maxTemp,
      f("belt", "Conveyor belt width", "Capacity", "number", [{ re: new RegExp(`belt[^\\d\\n]{0,15}${N}\\s*(?:mm)`, "i") }], { unit: "mm" }),
      f("fuel", "Fuel", "Power & supply", "enum", [{ re: /\b(wood[\s-]*fired|gas[\s-]*fired|gas|electric|dual fuel|charcoal)\b/i, to: (m) => m[1].toLowerCase().replace(/[\s-]*fired/, "") }], { filter: true }),
    ],
  },
  {
    id: "fryer", label: "Fryers", match: /fryer|chip-scuttle|scuttle|breading|filtration|fryer-baskets/i,
    decides: "Tank size, how many kilos of chips an hour, and whether it filters its own oil.",
    fields: [
      f("tanks", "Tanks", "Capacity", "number", [{ re: /\b(single|twin|double|triple|\d)[\s-]*(?:tank|pan|well)/i, to: (m) => ({ single: 1, twin: 2, double: 2, triple: 3 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]) }], { filter: true }),
      f("oilCapacity", "Oil capacity", "Capacity", "number", [{ re: new RegExp(`${N}\\s*(?:l|ltr|litres?|liters?)\\b[^.\\n]{0,20}(?:oil|capacity|tank|per)`, "i") }, { re: new RegExp(`(?:oil|tank)\\s*capacity[^\\d\\n]{0,15}${N}\\s*(?:l|ltr|litres?)`, "i") }], { unit: "litres", filter: true }),
      f("chipOutput", "Chip output", "Performance", "number", [{ re: new RegExp(`${N}\\s*kg\\s*(?:of\\s*)?(?:chips|fries)?\\s*(?:per|\\/|an)\\s*h`, "i") }], { unit: "kg/hr" }),
      f("filtration", "Oil filtration", "Controls & features", "flag", [{ re: /(built[\s-]*in filtration|filtration (?:system|unit)|oil filtration|filter(?:ing)? system)/i, to: () => true }], { filter: true }),
      f("fuel", "Fuel", "Power & supply", "enum", [{ re: /\b(natural gas|lpg|gas|electric)\b/i, to: (m) => (/gas|lpg/i.test(m[1]) ? "gas" : "electric") }], { filter: true }),
      f("baskets", "Baskets supplied", "Capacity", "number", [{ re: /\b(\d)\s*(?:x\s*)?(?:fryer\s*)?baskets?\b/i }]),
      f("thermostat", "Thermostat range", "Controls & features", "text", [{ re: /(\d{2,3}\s*°?\s*C?\s*(?:[-–]|to)\s*\d{3}\s*°?\s*C)/i }]),
      f("coldZone", "Cold zone", "Construction", "flag", [{ re: /(cold\s*zone)/i, to: () => true }]),
      f("drainValve", "Drain valve", "Construction", "text", [{ re: /([A-Za-z -]{0,25}(?:drain|dump) (?:valve|tap)[A-Za-z -]{0,15})/i, to: (m) => m[1].trim().replace(/^\W+/, "") }]),
      f("computerControl", "Controls", "Controls & features", "enum", [{ re: /\b(computer|digital|electronic|analogue|thermostat(?:ic)? control)\b/i, to: (m) => m[1].toLowerCase() }]),
    ],
  },
  {
    id: "grill", label: "Chargrills, griddles & grills", match: /chargrill|char-broil|griddle|salamander|contact-grill|toasting-grill|teppan|grills/i,
    decides: "Cooking surface size and plate type, and the fuel behind it.",
    fields: [
      f("cookingWidth", "Cooking width", "Capacity", "number", [{ re: new RegExp(`(?:cooking|grill|plate|griddle|cooking surface)\\s*(?:width|area|surface|size)?[^\\d\\n]{0,15}${N}\\s*mm`, "i") }], { unit: "mm" }),
      f("plate", "Plate", "Construction", "enum", [{ re: /\b(smooth|ribbed|grooved|ribbed and smooth|half ribbed|chrome|mild steel|cast iron)\b[^.\n]{0,15}(?:plate|griddle|top)?/i, to: (m) => m[1].toLowerCase() }], { filter: true }),
      f("fuel", "Fuel", "Power & supply", "enum", [{ re: /\b(natural gas|lpg|gas|electric|charcoal)\b/i, to: (m) => (/gas|lpg/i.test(m[1]) ? "gas" : m[1].toLowerCase()) }], { filter: true }),
      burners,
      f("radiant", "Heating method", "Construction", "enum", [{ re: /\b(lava rock|radiant|ceramic|infra-?red|char-?rock|volcanic)\b/i, to: (m) => m[1].toLowerCase() }]),
      f("thermostat", "Thermostatic control", "Controls & features", "flag", [{ re: /thermostat\w*/i, to: () => true }]),
      f("tempRange", "Temperature range", "Performance", "text", [{ re: /(\d{2,3}\s*°?\s*C?\s*(?:[-–]|to)\s*\d{2,3}\s*°\s*C)/i }]),
      f("splashback", "Splashback", "Construction", "flag", [{ re: /splash\s*back/i, to: () => true }]),
    ],
  },
  {
    id: "hot-holding", label: "Hot cupboards, bain maries & servery", match: /bainmarie|bain-marie|hotcupboards|hot-cupboard|holding|plate-?_?warmer|heated|food-server|soup|servery|gantr|insulated|drawer-warmers|ambient|spare-bulbs|fooddisplay/i,
    decides: "How much it holds and whether it keeps food hot wet or dry.",
    fields: [
      gn,
      f("heatType", "Heat", "Performance", "enum", [{ re: /\b(wet|dry)[\s-]*heat\b/i, to: (m) => m[1].toLowerCase() }, { re: /\b(wet|dry)\s*well\b/i, to: (m) => m[1].toLowerCase() }], { filter: true }),
      f("wells", "Wells / pots", "Capacity", "number", [{ re: /\b(\d{1,2})\s*(?:x\s*)?(?:wells?|pots?|pans?)\b/i }, { re: /\b(\d{1,2})\s*x\s*\d\/\d\s*GN/i }], { filter: true }),
      f("plateCapacity", "Plate capacity", "Capacity", "number", [{ re: /\b(\d{2,4})\s*plates?\b/i }]),
      f("volume", "Capacity", "Capacity", "number", [{ re: new RegExp(`${N}\\s*(?:l|ltr|litres?|liters?)\\b`, "i") }], { unit: "litres" }),
      f("shelves", "Shelves / levels", "Capacity", "number", [{ re: /\b(\d)\s*(?:x\s*)?(?:shelf|shelves|tiers?|levels?)\b/i }]),
      f("doors", "Doors", "Construction", "text", [{ re: /\b(\d|single|double|twin)[\s-]*(?:sliding\s*|hinged\s*|glass\s*)?doors?\b/i }]),
      f("mobility", "Mobile", "Construction", "flag", [{ re: /(castors?|wheels?|mobile|trolley)/i, to: () => true }], { filter: true }),
      f("tempRange", "Temperature range", "Performance", "text", [{ re: /(\d{2,3}\s*°?\s*C?\s*(?:[-–]|to)\s*\d{2,3}\s*°\s*C)/i }]),
      f("bulbs", "Lamp / bulb", "Controls & features", "text", [{ re: /((?:infra-?red|halogen|heat|ceramic)\s*(?:lamp|bulb|element)[^.\n]{0,30})/i }]),
    ],
  },
  {
    id: "boiling", label: "Boiling pans, bratt pans & kettles", match: /bratt|boiling|kettle|pasta|rice|boilingtops|induction-hobs|induction_cooktops/i,
    decides: "Capacity in litres, how it is heated, and whether it tilts.",
    fields: [
      f("volume", "Capacity", "Capacity", "number", [{ re: new RegExp(`${N}\\s*(?:l|ltr|litres?|liters?)\\b`, "i") }], { unit: "litres", filter: true }),
      f("fuel", "Fuel", "Power & supply", "enum", [{ re: /\b(natural gas|lpg|gas|electric|induction)\b/i, to: (m) => (/gas|lpg/i.test(m[1]) ? "gas" : m[1].toLowerCase()) }], { filter: true }),
      f("heating", "Heating", "Construction", "enum", [{ re: /\b(direct|indirect|steam jacketed|jacketed|bain[\s-]*marie)\b[^.\n]{0,15}(?:heat|heating)?/i, to: (m) => m[1].toLowerCase() }]),
      f("tilting", "Tilting", "Construction", "flag", [{ re: /(tilt\w*)/i, to: () => true }], { filter: true }),
      f("zones", "Cooking zones", "Capacity", "number", [{ re: /\b(\d)\s*(?:x\s*)?(?:zones?|rings?|hobs?|plates?)\b/i }]),
      f("zonePower", "Power per zone", "Performance", "number", [{ re: new RegExp(`${N}\\s*kW\\s*(?:per|each)\\s*(?:zone|ring|hob|plate)`, "i") }], { unit: "kW" }),
      f("tap", "Filling tap", "Construction", "flag", [{ re: /(filling\s*tap|water\s*tap|swing\s*tap|tap\b)/i, to: () => true }]),
      f("basket", "Baskets", "Capacity", "number", [{ re: /\b(\d)\s*(?:x\s*)?baskets?\b/i }]),
    ],
  },
  {
    id: "convection", label: "Convection, cook & hold and high speed ovens", match: /convection|cook--hold|high-speed|microwave|hoblessovens|hobless|steamer|steamers|sous-vide|potato/i,
    decides: "Tray capacity and size, humidity and the power supply.",
    fields: [
      f("trays", "Tray capacity", "Capacity", "text", [{ re: /\b(\d{1,2}\s*[x×]\s*(?:\d\/\d\s*GN|\d{3}\s*[x×]\s*\d{3}(?:\s*mm)?|(?:full|half)[\s-]*size)[^.\n]{0,20})/i }, { re: /\b(\d{1,2}\s*(?:x\s*)?(?:trays?|shelves|levels)\b[^.\n]{0,25})/i }], { filter: true }),
      gn,
      f("trayPitch", "Tray pitch", "Capacity", "number", [{ re: new RegExp(`pitch[^\\d\\n]{0,12}${N}\\s*mm`, "i") }, { re: new RegExp(`${N}\\s*mm\\s*pitch`, "i") }], { unit: "mm" }),
      temp, maxTemp,
      f("humidity", "Humidity / steam", "Performance", "flag", [{ re: /(humidit\w+|steam\s*injection|direct\s*steam|steam)/i, to: () => true }], { filter: true }),
      f("programs", "Stored programs", "Controls & features", "number", [{ re: /\b(\d{2,4})\s*(?:stored\s*)?(?:programmes?|programs|recipes)\b/i }]),
      f("door", "Door", "Construction", "text", [{ re: /((?:drop[\s-]*down|side[\s-]*hinged|double[\s-]*glazed|triple[\s-]*glazed|glass)\s*door[^.\n]{0,20})/i }]),
      f("timer", "Timer", "Controls & features", "text", [{ re: /(timer[^.\n]{0,40})/i }]),
      f("microwaveOutput", "Microwave power", "Performance", "number", [{ re: new RegExp(`${N}\\s*W\\s*(?:microwave|output)`, "i") }], { unit: "W" }),
      f("lowTemp", "Cook & hold", "Controls & features", "flag", [{ re: /(cook\s*(?:&|and)\s*hold|low[\s-]*temperature)/i, to: () => true }]),
    ],
  },
  {
    id: "range", label: "Ranges & burner ovens", match: /burner|range|dual-fuel|electric-ovens|solid-top|griddle-ovens|domestic|tandoori|induction-cooking|drop-in-equipment|modular|commercial-ovens|ovens-with-griddle|ovens_with_griddle/i,
    decides: "Burner count, fuel and width; then oven size and duty.",
    fields: [
      burners, ovenCount,
      f("fuel", "Fuel", "Power & supply", "enum", [{ re: /\b(natural gas|lpg|gas|electric|dual fuel|charcoal|wood)\b/i, to: (m) => (/gas|lpg/i.test(m[1]) ? "gas" : m[1].toLowerCase()) }], { filter: true }),
      f("burnerKw", "Output per burner", "Performance", "number", [{ re: new RegExp(`${N}\\s*kW\\s*(?:\\([^)]*\\)\\s*)?(?:open\\s*|dual flame\\s*)?burners?`, "i") }], { unit: "kW" }),
      f("ovenSize", "Oven interior", "Capacity", "text", [{ re: /(?:oven|int(?:ernal)?)\s*dimensions?:?\s*(W\s*\d+\s*[x×]\s*D\s*\d+\s*[x×]\s*H\s*\d+\s*(?:mm)?)/i }]),
      gn,
      f("ovenType", "Oven type", "Construction", "enum", [{ re: /\b(static|convection|fan[\s-]*assisted|fan[\s-]*forced)\b/i, to: (m) => (/static/i.test(m[1]) ? "static" : "convection") }], { filter: true }),
      f("griddle", "Griddle", "Construction", "text", [{ re: /(\d{3}\s*mm\s*griddle|griddle[^.\n]{0,30})/i }]),
      f("ignition", "Ignition", "Controls & features", "enum", [{ re: /\b(manual pilot|pilot|electronic|piezo|spark|flame failure)\b[^.\n]{0,15}/i, to: (m) => m[1].toLowerCase() }]),
      f("castors", "Castors", "Construction", "enum", [{ re: /\b(castors?|rear rollers|adjustable (?:feet|legs)|legs)\b/i, to: (m) => m[1].toLowerCase() }]),
      f("door", "Door", "Construction", "text", [{ re: /((?:drop[\s-]*down|side[\s-]*hinged|double[\s-]*glazed)\s*door[^.\n]{0,20})/i }]),
      f("racking", "Racking", "Capacity", "text", [{ re: /(\d\s*(?:position|level)\s*racking[^.\n]{0,15}|(?:\d\s*)?rack positions?)/i }]),
    ],
  },
  {
    id: "specialist", label: "Specialist cooking equipment", match: /.*/,
    decides: "What it cooks, its capacity and the supply it needs.",
    fields: [
      f("fuel", "Fuel", "Power & supply", "enum", [{ re: /\b(natural gas|lpg|gas|electric|charcoal|wood|induction)\b/i, to: (m) => (/gas|lpg/i.test(m[1]) ? "gas" : m[1].toLowerCase()) }], { filter: true }),
      f("volume", "Capacity", "Capacity", "number", [{ re: new RegExp(`${N}\\s*(?:l|ltr|litres?|liters?)\\b`, "i") }], { unit: "litres" }),
      f("throughput", "Throughput", "Performance", "text", [{ re: new RegExp(`(${N}\\s*(?:kg|portions|slices|covers|pizzas|items|waffles|hot dogs)\\s*(?:per|an|\\/)\\s*(?:hour|hr|h)\\b)`, "i") }]),
      f("capacityKg", "Load capacity", "Capacity", "number", [{ re: new RegExp(`(?:capacity|holds?|up to)[^\\d\\n]{0,20}${N}\\s*kg`, "i") }], { unit: "kg" }),
      f("timer", "Timer", "Controls & features", "text", [{ re: /(timer[^.\n]{0,40})/i }]),
      f("thermostat", "Temperature control", "Controls & features", "text", [{ re: /(thermostat\w*[^.\n]{0,30}|\d{2,3}\s*°?\s*C?\s*(?:[-–]|to)\s*\d{2,3}\s*°\s*C)/i }]),
      f("plates", "Plates / spits / rods", "Capacity", "number", [{ re: /\b(\d{1,2})\s*(?:x\s*)?(?:spits?|rods?|skewers?|plates?|slots?|heads?)\b/i }]),
    ],
  },
];

export const familyFor = (categoryUrls: string[]): Family => {
  for (const u of categoryUrls) for (const fam of FAMILIES) if (fam.match.test(u)) return fam;
  return FAMILIES[FAMILIES.length - 1];
};
export const fieldsFor = (fam: Family): Field[] => {
  const seen = new Set<string>();
  return [...fam.fields, ...COMMON_FIELDS].filter((x) => !seen.has(x.key) && seen.add(x.key));
};
