import { z } from "zod";

// Only web addresses: a stored "javascript:" link must never reach a page.
const httpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u), "must be an http(s) URL");

// The product dossier: one record that can hold every detail known about a catering product, from any
// source. Three rules shape it.
//   1. A fact is a label, a value and where it came from. Nothing is stored without a source.
//   2. Caterkwik's own page outranks a spec sheet, which outranks the open web. Where two sources
//      disagree both are kept and the page shows the higher-ranked one, flagged.
//   3. The attribute registry below is the vocabulary: ~150 named attributes in 14 sections. A web
//      fact whose label matches one lands in that slot; one that does not is kept under its own label,
//      so nothing is dropped for lack of a column.

export const SECTIONS = [
  "Identity", "Capacity", "Performance", "Electrical", "Gas", "Water & drainage", "Ventilation & siting", "Dimensions",
  "Weight & packaging", "Construction", "Controls & features", "Safety & compliance", "Cleaning & maintenance", "Warranty & service",
] as const;
export type Section = (typeof SECTIONS)[number];

type AttrType = "number" | "text" | "flag" | "enum" | "list";
export interface Attribute {
  key: string;
  label: string;
  section: Section;
  type: AttrType;
  unit?: string;
  /** Other labels sources use for the same thing, lower case. */
  synonyms?: string[];
}

// [key, label, section, type, unit, synonyms]
type Row = [string, string, Section, AttrType, (string | null)?, string[]?];
const rows: Row[] = [
  // Identity
  ["brand", "Brand", "Identity", "text", null, ["manufacturer", "make"]],
  ["series", "Range / series", "Identity", "text", null, ["range", "series", "product line", "collection"]],
  ["model", "Model", "Identity", "text", null, ["model name", "model number", "model no"]],
  ["mpn", "Manufacturer part number", "Identity", "text", null, ["mpn", "part number", "part no", "sku", "product code", "item code", "manufacturer code"]],
  ["gtin", "EAN / GTIN", "Identity", "text", null, ["ean", "gtin", "barcode", "upc"]],
  ["origin", "Country of origin", "Identity", "text", null, ["made in", "origin", "country of manufacture"]],
  ["condition", "Condition", "Identity", "text", null, ["condition"]],
  ["colour", "Colour", "Identity", "text", null, ["color", "colour"]],
  ["finish", "Finish", "Identity", "text", null, ["exterior finish", "surface finish"]],
  ["productType", "Product type", "Identity", "text", null, ["type", "appliance type", "product type"]],
  ["application", "Suited to", "Identity", "text", null, ["application", "suitable for", "intended use", "ideal for", "usage"]],
  // Capacity
  ["capacity", "Capacity", "Capacity", "text", null, ["total capacity", "net capacity", "gross capacity", "volume"]],
  ["capacityL", "Capacity", "Capacity", "number", "litres", ["capacity (l)", "litres", "capacity ltr", "capacity in litres", "volume (l)"]],
  ["oilCapacity", "Oil capacity", "Capacity", "number", "litres", ["oil capacity", "oil volume", "tank capacity", "pot capacity"]],
  ["gnCapacity", "Gastronorm capacity", "Capacity", "text", null, ["gn capacity", "gastronorm", "gn size", "gn pans", "gn compatibility"]],
  ["trays", "Tray capacity", "Capacity", "text", null, ["trays", "tray capacity", "number of trays", "shelves", "baking trays"]],
  ["trayPitch", "Tray pitch", "Capacity", "number", "mm", ["tray pitch", "shelf spacing", "rack spacing", "distance between trays"]],
  ["shelves", "Shelves", "Capacity", "number", null, ["number of shelves", "no. of shelves", "shelf count", "levels", "tiers"]],
  ["decks", "Decks", "Capacity", "number", null, ["decks", "number of decks"]],
  ["pizzaSize", "Pizza size", "Capacity", "text", null, ["pizza capacity", "pizza size", "max pizza size"]],
  ["covers", "Covers per service", "Capacity", "text", null, ["covers", "meals per service", "portions", "servings"]],
  ["plates", "Plate capacity", "Capacity", "number", null, ["plate capacity", "plates"]],
  ["baskets", "Baskets", "Capacity", "number", null, ["number of baskets", "baskets", "baskets supplied"]],
  ["tanks", "Tanks / wells / pots", "Capacity", "number", null, ["tanks", "number of tanks", "wells", "pots", "pans", "number of pans"]],
  ["burners", "Burners", "Capacity", "number", null, ["burners", "number of burners", "hobs", "hotplates", "rings"]],
  ["zones", "Cooking zones", "Capacity", "number", null, ["zones", "cooking zones", "heating zones"]],
  ["ovenCavities", "Oven cavities", "Capacity", "number", null, ["ovens", "oven cavities", "chambers", "cavities"]],
  ["ovenInterior", "Oven interior", "Capacity", "text", null, ["oven interior", "internal dimensions", "interior size", "chamber size", "cavity size", "internal size"]],
  ["cookingArea", "Cooking area", "Capacity", "text", null, ["cooking area", "cooking surface", "grill area", "griddle size", "cooking width", "plate size", "grilling area"]],
  ["loadKg", "Maximum load", "Capacity", "number", "kg", ["max load", "load capacity", "capacity kg", "max weight capacity"]],
  ["bowls", "Bowl size", "Capacity", "text", null, ["bowl size", "bowl capacity", "pan size", "pot size"]],
  // Performance
  ["tempMin", "Minimum temperature", "Performance", "number", "°C", ["min temp", "minimum temperature", "temperature min"]],
  ["tempMax", "Maximum temperature", "Performance", "number", "°C", ["max temp", "maximum temperature", "temperature max", "top temperature"]],
  ["tempRange", "Temperature range", "Performance", "text", null, ["temperature range", "temp range", "thermostat range", "temperature"]],
  ["heatUp", "Heat-up time", "Performance", "text", null, ["heat up time", "heating time", "pre-heat time", "preheat time", "recovery time"]],
  ["output", "Output / throughput", "Performance", "text", null, ["output", "throughput", "production", "productivity", "production capacity", "per hour"]],
  ["chipOutput", "Chip output", "Performance", "number", "kg/hr", ["chip output", "chips per hour", "fries per hour"]],
  ["pizzasPerHour", "Pizzas per hour", "Performance", "number", null, ["pizzas per hour", "pizza output"]],
  ["recovery", "Recovery rate", "Performance", "text", null, ["recovery rate", "recovery"]],
  ["cookTime", "Cook time", "Performance", "text", null, ["cooking time", "cook time", "bake time"]],
  ["speed", "Speed", "Performance", "text", null, ["speed", "belt speed", "fan speed", "rpm"]],
  ["fanSpeeds", "Fan speeds", "Performance", "text", null, ["fan speeds", "fan speed settings"]],
  ["humidity", "Humidity / steam", "Performance", "text", null, ["humidity", "steam", "humidity levels", "steam injection", "steam generation"]],
  ["burnerKw", "Output per burner", "Performance", "number", "kW", ["burner output", "kw per burner", "output per burner", "burner power"]],
  ["hobKw", "Hob output", "Performance", "number", "kW", ["hob output", "hob power", "total hob output"]],
  ["ovenKw", "Oven output", "Performance", "number", "kW", ["oven output", "oven power", "oven kw"]],
  ["microwaveW", "Microwave power", "Performance", "number", "W", ["microwave power", "microwave output", "magnetron power"]],
  ["heatingMethod", "Heating method", "Performance", "text", null, ["heating method", "heating type", "heat source", "heating element"]],
  ["cookingMethod", "Cooking method", "Performance", "text", null, ["cooking method", "cooking functions", "cooking modes", "modes"]],
  // Electrical
  ["electricKw", "Electrical rating", "Electrical", "number", "kW", ["power", "power rating", "power consumption", "wattage", "kw rating", "electrical power", "rated power", "total power", "input power", "power (kw)", "power input"]],
  ["voltage", "Voltage", "Electrical", "text", null, ["voltage", "supply voltage", "electrical supply", "power supply", "volts", "mains"]],
  ["phase", "Electrical phase", "Electrical", "enum", null, ["phase", "phases", "number of phases", "single/three phase"]],
  ["frequency", "Frequency", "Electrical", "text", null, ["frequency", "hz", "hertz"]],
  ["amps", "Supply current", "Electrical", "number", "A", ["amps", "amperage", "current", "fuse rating", "max current"]],
  ["plug", "Plug", "Electrical", "text", null, ["plug", "plug type", "plug fitted", "plug supplied"]],
  ["hardWired", "Hard-wired", "Electrical", "flag", null, ["hard wired", "hardwired", "hard-wiring", "hard wiring"]],
  ["cable", "Cable length", "Electrical", "text", null, ["cable length", "power cable", "lead length", "cord length"]],
  ["ipRating", "IP rating", "Electrical", "text", null, ["ip rating", "ip class", "ingress protection", "ipx"]],
  ["elementKw", "Element rating", "Electrical", "text", null, ["element", "element rating", "heating element power"]],
  // Gas
  ["gasKw", "Gas rating (natural gas)", "Gas", "number", "kW", ["gas power", "gas rating", "nat gas", "natural gas", "gas input", "gas consumption", "heat input", "nominal heat input", "gas kw"]],
  ["lpgKw", "Gas rating (LPG)", "Gas", "number", "kW", ["lpg", "lpg rating", "propane", "lpg power", "lpg consumption"]],
  ["gasBtu", "Gas rating (BTU/hr)", "Gas", "number", "BTU/hr", ["btu", "btu/hr", "btu rating"]],
  ["gasType", "Gas type", "Gas", "text", null, ["gas type", "fuel type", "fuel", "gas category", "gas supply"]],
  ["gasConnection", "Gas connection", "Gas", "text", null, ["gas connection", "gas inlet", "gas pipe", "bsp", "gas hose"]],
  ["gasPressure", "Gas pressure", "Gas", "text", null, ["gas pressure", "inlet pressure", "operating pressure", "mbar"]],
  ["ignition", "Ignition", "Gas", "text", null, ["ignition", "ignition type", "pilot", "igniter"]],
  ["flameFailure", "Flame failure device", "Gas", "flag", null, ["flame failure", "ffd", "flame supervision"]],
  ["gasConversion", "Gas conversion", "Gas", "text", null, ["gas conversion", "convertible", "conversion kit", "nat to lpg"]],
  // Water & drainage
  ["waterConnection", "Water connection", "Water & drainage", "text", null, ["water connection", "water inlet", "water supply", "inlet", "water feed"]],
  ["waterPressure", "Water pressure", "Water & drainage", "text", null, ["water pressure", "inlet water pressure", "flow pressure"]],
  ["waterHardness", "Water quality", "Water & drainage", "text", null, ["water hardness", "water quality", "water treatment"]],
  ["waterUse", "Water consumption", "Water & drainage", "text", null, ["water consumption", "water use", "water usage", "water per cycle"]],
  ["drain", "Drain", "Water & drainage", "text", null, ["drain", "drain connection", "drain outlet", "waste", "drain valve", "drainage"]],
  ["tap", "Tap", "Water & drainage", "text", null, ["tap", "filling tap", "water tap"]],
  // Ventilation & siting
  ["extraction", "Extraction", "Ventilation & siting", "text", null, ["extraction", "ventilation", "canopy required", "flue", "flue outlet", "extraction requirement"]],
  ["clearance", "Clearance", "Ventilation & siting", "text", null, ["clearance", "clearances", "minimum clearance", "side clearance", "rear clearance", "installation clearance"]],
  ["freestanding", "Installation type", "Ventilation & siting", "text", null, ["installation", "installation type", "freestanding", "countertop", "built-in", "mounting", "drop-in"]],
  ["ambient", "Ambient conditions", "Ventilation & siting", "text", null, ["ambient temperature", "operating environment", "operating temperature"]],
  ["stackable", "Stackable", "Ventilation & siting", "text", null, ["stackable", "stacking", "stacking kit"]],
  ["legs", "Legs / castors", "Ventilation & siting", "text", null, ["legs", "castors", "casters", "feet", "wheels", "adjustable feet", "adjustable legs"]],
  // Dimensions
  ["width", "Width", "Dimensions", "number", "mm", ["width", "w", "external width", "overall width"]],
  ["depth", "Depth", "Dimensions", "number", "mm", ["depth", "d", "external depth", "overall depth"]],
  ["height", "Height", "Dimensions", "number", "mm", ["height", "h", "external height", "overall height"]],
  ["dimensions", "Dimensions (W x D x H)", "Dimensions", "text", null, ["dimensions", "external dimensions", "overall dimensions", "size", "product dimensions", "dimensions (hxwxd)", "dimensions (wxdxh)", "ext dimensions"]],
  ["depthDoorOpen", "Depth with door open", "Dimensions", "number", "mm", ["depth with door open", "door open depth", "depth door open"]],
  ["heightToHob", "Height to hob", "Dimensions", "number", "mm", ["height to hob", "work height", "working height", "hob height"]],
  ["heightWithSplash", "Height with splashback", "Dimensions", "number", "mm", ["height including splashback", "height with splashback"]],
  ["internalWidth", "Internal width", "Dimensions", "number", "mm", ["internal width", "interior width", "chamber width"]],
  ["internalDepth", "Internal depth", "Dimensions", "number", "mm", ["internal depth", "interior depth", "chamber depth"]],
  ["internalHeight", "Internal height", "Dimensions", "number", "mm", ["internal height", "interior height", "chamber height"]],
  ["doorOpening", "Door opening", "Dimensions", "text", null, ["door opening", "door size", "access width", "doorway", "min door width"]],
  ["accessWidth", "Minimum access width", "Dimensions", "number", "mm", ["access width", "narrowest point", "minimum access"]],
  ["panSize", "Pan / bowl size", "Dimensions", "text", null, ["pan size", "bowl dimensions", "well dimensions", "tank dimensions", "pot dimensions"]],
  ["tankSize", "Tank dimensions", "Dimensions", "text", null, ["tank dimensions", "tank size", "frypot size"]],
  ["diameter", "Diameter", "Dimensions", "number", "mm", ["diameter", "dia", "ø"]],
  ["cableHeight", "Packed dimensions", "Weight & packaging", "text", null, ["packed dimensions", "packaging dimensions", "carton size", "shipping dimensions", "boxed dimensions", "package size"]],
  // Weight & packaging
  ["weight", "Weight", "Weight & packaging", "number", "kg", ["weight", "net weight", "product weight", "unit weight", "weight (kg)"]],
  ["grossWeight", "Gross / packed weight", "Weight & packaging", "number", "kg", ["gross weight", "shipping weight", "packed weight", "boxed weight"]],
  ["packSize", "Pack quantity", "Weight & packaging", "text", null, ["pack size", "pack quantity", "quantity per pack", "sold as", "unit of sale"]],
  ["delivery", "Delivery", "Weight & packaging", "text", null, ["delivery", "delivery method", "delivery info", "shipping", "lead time"]],
  ["included", "Supplied with", "Weight & packaging", "list", null, ["included", "supplied with", "in the box", "what's included", "includes", "package contents", "comes with"]],
  // Construction
  ["material", "Material", "Construction", "text", null, ["material", "materials", "construction", "body material", "build"]],
  ["interior", "Interior", "Construction", "text", null, ["interior", "interior material", "liner", "oven liner", "cavity material", "inner"]],
  ["exterior", "Exterior", "Construction", "text", null, ["exterior", "exterior material", "casing", "outer", "cladding"]],
  ["steelGrade", "Steel grade", "Construction", "text", null, ["stainless steel grade", "steel grade", "grade", "aisi", "gauge"]],
  ["insulation", "Insulation", "Construction", "text", null, ["insulation", "insulated", "thermal insulation"]],
  ["door", "Door", "Construction", "text", null, ["door", "door type", "door glass", "glazing", "door hinge"]],
  ["lid", "Lid", "Construction", "text", null, ["lid", "cover"]],
  ["handles", "Handles", "Construction", "text", null, ["handles", "handle", "handle type"]],
  ["plate", "Plate / cooking surface", "Construction", "text", null, ["plate", "plate type", "griddle plate", "cooking surface material", "surface", "cooking plate"]],
  ["grid", "Grids / racks", "Construction", "text", null, ["grid", "grids", "racks", "racking", "rack positions", "shelf type", "cooking grid"]],
  ["burnerType", "Burner type", "Construction", "text", null, ["burner type", "burners type", "burner material"]],
  ["splashback", "Splashback", "Construction", "text", null, ["splashback", "splash back", "upstand", "backsplash"]],
  ["stone", "Cooking stone / deck", "Construction", "text", null, ["stone", "deck", "baking stone", "refractory", "deck material", "base"]],
  ["fuelShelf", "Fuel / burner holder", "Construction", "text", null, ["fuel holder", "burner holder", "chafing fuel"]],
  // Controls & features
  ["controls", "Controls", "Controls & features", "text", null, ["controls", "control type", "control panel", "control", "operation", "display"]],
  ["thermostat", "Thermostat", "Controls & features", "text", null, ["thermostat", "thermostatic control", "temperature control", "thermostat type"]],
  ["timer", "Timer", "Controls & features", "text", null, ["timer", "countdown timer", "cooking timer"]],
  ["programs", "Stored programs", "Controls & features", "number", null, ["programs", "programmes", "recipes", "stored programs", "preset programs", "memory"]],
  ["probe", "Core probe", "Controls & features", "text", null, ["core probe", "probe", "food probe", "temperature probe"]],
  ["connectivity", "Connectivity", "Controls & features", "text", null, ["connectivity", "wifi", "wi-fi", "usb", "ethernet", "app", "haccp", "remote monitoring"]],
  ["autoClean", "Automatic cleaning", "Cleaning & maintenance", "text", null, ["auto clean", "automatic cleaning", "self clean", "wash system", "cleaning system", "washing system"]],
  ["lighting", "Lighting", "Controls & features", "text", null, ["lighting", "light", "led lighting", "interior light", "halogen"]],
  ["filtration", "Oil filtration", "Controls & features", "text", null, ["filtration", "oil filtration", "filter", "filtering", "built-in filtration"]],
  ["extras", "Standard extras", "Controls & features", "list", null, ["accessories included", "standard accessories", "features", "extras"]],
  ["options", "Options available", "Controls & features", "list", null, ["options", "optional extras", "optional accessories", "available options"]],
  ["safety", "Safety features", "Safety & compliance", "list", null, ["safety", "safety features", "safety devices", "overheat protection", "safety thermostat", "high limit"]],
  ["noise", "Noise level", "Controls & features", "text", null, ["noise", "noise level", "sound level", "db"]],
  // Safety & compliance
  ["ce", "CE marked", "Safety & compliance", "flag", null, ["ce", "ce marked", "ce approved", "ce certified"]],
  ["certifications", "Certifications", "Safety & compliance", "list", null, ["certifications", "certification", "approvals", "approval", "standards", "conforms to", "compliance", "certified"]],
  ["gasSafe", "Gas approval", "Safety & compliance", "text", null, ["gas safe", "gas approval", "gas appliance regulation"]],
  ["wras", "WRAS approval", "Safety & compliance", "text", null, ["wras", "water regulations"]],
  ["energy", "Energy rating", "Safety & compliance", "text", null, ["energy rating", "energy class", "energy efficiency", "energy label", "energy use"]],
  ["foodSafe", "Food contact", "Safety & compliance", "text", null, ["food safe", "food grade", "food contact", "nsf", "bpa free"]],
  ["haccp", "HACCP", "Safety & compliance", "text", null, ["haccp", "hygiene"]],
  ["ulEtc", "Test marks", "Safety & compliance", "text", null, ["ul", "etl", "csa", "nsf", "ukca", "rohs", "reach"]],
  // Cleaning & maintenance
  ["cleaning", "Cleaning", "Cleaning & maintenance", "text", null, ["cleaning", "easy clean", "cleaning method", "care"]],
  ["dishwasherSafe", "Dishwasher safe", "Cleaning & maintenance", "text", null, ["dishwasher safe", "dishwasher"]],
  ["maintenance", "Maintenance", "Cleaning & maintenance", "text", null, ["maintenance", "servicing", "service interval", "descaling"]],
  ["spares", "Spares", "Cleaning & maintenance", "text", null, ["spares", "spare parts", "replacement parts"]],
  // Warranty & service
  ["warranty", "Warranty", "Warranty & service", "text", null, ["warranty", "guarantee", "manufacturer warranty", "parts warranty", "warranty period", "parts and labour"]],
  ["service", "Service & support", "Warranty & service", "text", null, ["service", "support", "after sales", "helpline"]],
];

export const ATTRIBUTES: Attribute[] = rows.map(([key, label, section, type, unit, synonyms]) => ({
  key, label, section, type, ...(unit ? { unit } : {}), ...(synonyms ? { synonyms } : {}),
}));
export const ATTRIBUTE = new Map(ATTRIBUTES.map((a) => [a.key, a]));

const norm = (s: string) => s.toLowerCase().replace(/[:*]+$/g, "").replace(/\s+/g, " ").trim();
const bySynonym = new Map<string, Attribute>();
for (const a of ATTRIBUTES) {
  bySynonym.set(norm(a.label), a);
  for (const s of a.synonyms ?? []) if (!bySynonym.has(s)) bySynonym.set(s, a);
}

/** The registry attribute a source's label means, or undefined when it is something the registry has no slot for. */
export const attributeFor = (label: string): Attribute | undefined => bySynonym.get(norm(label));

// ── Sources and facts ─────────────────────────────────────────────────────────────────────────
// Lower number outranks. A fact from a higher-ranked source wins; the others stay visible as corroboration.
export const SOURCE_KINDS = ["caterkwik", "datasheet", "manufacturer", "retailer", "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const RANK: Record<SourceKind, number> = { caterkwik: 0, datasheet: 1, manufacturer: 2, retailer: 3, other: 4 };

export const SourceSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  url: httpUrl,
  title: z.string().max(200).optional(),
  read: z.string().optional(), // ISO date the source was read
});
export type Source = z.infer<typeof SourceSchema>;

export const FactSchema = z.object({
  key: z.string().optional(),               // registry key, when the label matched one
  label: z.string().min(1).max(120),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  unit: z.string().max(20).optional(),
  section: z.enum(SECTIONS).optional(),
  source: z.number().int().nonnegative(),   // index into the dossier's sources
});
export type Fact = z.infer<typeof FactSchema>;

const DocSchema = z.object({ label: z.string(), url: httpUrl, kind: z.string().optional() });
const ImageSchema = z.object({ url: httpUrl, alt: z.string().optional(), source: z.number().int().nonnegative().optional() });
const QASchema = z.object({ q: z.string(), a: z.string(), source: z.number().int().nonnegative().optional() });

/** What a web-research pass writes for one product (see scripts/web-research.md). */
export const WebRecordSchema = z.object({
  id: z.string(),
  found: z.boolean(),                                  // false when no source for this exact model was found
  sources: z.array(SourceSchema).max(12),
  summary: z.string().max(1500).optional(),            // the researcher's own wording, never pasted marketing copy
  highlights: z.array(z.object({ text: z.string().max(240), source: z.number().int().nonnegative() })).max(40).optional(),
  facts: z.array(FactSchema).max(200),
  included: z.array(z.string()).max(30).optional(),
  documents: z.array(DocSchema).max(15).optional(),
  images: z.array(ImageSchema).max(10).optional(),
  faqs: z.array(QASchema).max(10).optional(),
  alternatives: z.array(z.string()).max(8).optional(),   // successor / replacement model codes the sources name
  notes: z.string().max(600).optional(),                 // e.g. "sources disagree on weight: 27.2 kg vs 28 kg"
});
export type WebRecord = z.infer<typeof WebRecordSchema>;

/** The merged record a product page renders. */
export const DossierSchema = z.object({
  id: z.string(),
  sources: z.array(SourceSchema),
  summary: z.array(z.string()),
  highlights: z.array(z.object({ text: z.string(), source: z.number() })),
  sections: z.array(z.object({ section: z.enum(SECTIONS), facts: z.array(FactSchema.extend({ alternatives: z.array(z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]), source: z.number() })).optional() })) })),
  other: z.array(FactSchema),                                   // facts with no registry slot
  included: z.array(z.string()),
  documents: z.array(DocSchema),
  images: z.array(ImageSchema),
  faqs: z.array(QASchema),
  alternatives: z.array(z.string()),
});
export type Dossier = z.infer<typeof DossierSchema>;
