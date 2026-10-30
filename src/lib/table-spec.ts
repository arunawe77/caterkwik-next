// The made-to-measure stainless steel table configurator: the options a customer can choose, how a choice is checked,
// and how it reads back in words. The form and the server action both use this, so the page can never offer
// something the server would refuse, and the server never trusts what the browser says.

export const TABLE_TYPES = [
  { value: "wall", label: "Wall table", note: "Against a wall, with a rear upstand available" },
  { value: "centre", label: "Centre table", note: "Free-standing, worked from all sides" },
] as const;

export const UNDERSHELVES = [
  { value: "none", label: "No undershelf" },
  { value: "one", label: "One undershelf" },
  { value: "two", label: "Two undershelves" },
  { value: "left", label: "Left hand undershelf" },
  { value: "right", label: "Right hand undershelf" },
] as const;

export const GANTRIES = [
  { value: "none", label: "No gantry" },
  { value: "single-300", label: "Single tier, 300mm deep" },
  { value: "single-400", label: "Single tier, 400mm deep" },
  { value: "double-300", label: "Double tier, 300mm deep" },
  { value: "double-400", label: "Double tier, 400mm deep" },
] as const;

export const CHAMFERS = [
  { value: "none", label: "No chamfer" },
  { value: "50-left", label: "50 x 50mm, left" },
  { value: "50-right", label: "50 x 50mm, right" },
  { value: "50-both", label: "50 x 50mm, both sides" },
  { value: "75-left", label: "75 x 75mm, left" },
  { value: "75-right", label: "75 x 75mm, right" },
  { value: "75-both", label: "75 x 75mm, both sides" },
] as const;

export const UPSTANDS = [
  { value: "none", label: "No upstand" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both" },
] as const;

// Sizes in mm. The standard range is 600 to 1800 wide, 600 to 800 deep and 900 high; custom work goes beyond that, so the
// limits here are wide enough to take a bespoke size and the team confirms what can be made.
export const LIMITS = {
  width: { min: 300, max: 3000, standard: 1200 },
  depth: { min: 400, max: 900, standard: 700 },
  height: { min: 800, max: 1000, standard: 900 },
} as const;

type Values<T extends readonly { value: string }[]> = T[number]["value"];

export interface TableSpec {
  type: Values<typeof TABLE_TYPES>;
  width: number;
  depth: number;
  height: number;
  undershelf: Values<typeof UNDERSHELVES>;
  gantry: Values<typeof GANTRIES>;
  chamfer: Values<typeof CHAMFERS>;
  upstand: Values<typeof UPSTANDS>;
  castors: boolean;
  quantity: number;
}

export const MAX_TABLES = 50;

export const DEFAULT_SPEC: TableSpec = {
  type: "wall",
  width: LIMITS.width.standard,
  depth: LIMITS.depth.standard,
  height: LIMITS.height.standard,
  undershelf: "one",
  gantry: "none",
  chamfer: "none",
  upstand: "none",
  castors: false,
  quantity: 1,
};

const oneOf = <T extends readonly { value: string }[]>(list: T, v: unknown): Values<T> | null =>
  list.find((o) => o.value === v)?.value ?? null;

const size = (v: unknown, range: { min: number; max: number }): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= range.min && n <= range.max ? n : null;
};

export type SpecResult = { ok: true; spec: TableSpec } | { ok: false; error: string };

// Reads a spec from untrusted input (form fields or a plain object). The first problem found is the error to show.
export function parseSpec(input: Record<string, unknown>): SpecResult {
  const type = oneOf(TABLE_TYPES, input.type);
  if (!type) return { ok: false, error: "Choose a wall table or a centre table." };
  for (const key of ["width", "depth", "height"] as const) {
    if (size(input[key], LIMITS[key]) === null) {
      const { min, max } = LIMITS[key];
      return { ok: false, error: `The ${key} must be a whole number of mm from ${min} to ${max}. For anything outside that, call the team on 01229 480001.` };
    }
  }
  const undershelf = oneOf(UNDERSHELVES, input.undershelf);
  const gantry = oneOf(GANTRIES, input.gantry);
  const chamfer = oneOf(CHAMFERS, input.chamfer);
  const upstand = oneOf(UPSTANDS, input.upstand);
  if (!undershelf || !gantry || !chamfer || !upstand) return { ok: false, error: "One of the options is not valid. Go back through the steps and choose again." };

  const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TABLES) return { ok: false, error: `Choose a quantity from 1 to ${MAX_TABLES}.` };

  // A rear upstand on a centre table, or a gantry on one, is possible but unusual; the team checks it, so it is allowed.
  return {
    ok: true,
    spec: {
      type, undershelf, gantry, chamfer, upstand, quantity,
      width: size(input.width, LIMITS.width)!, depth: size(input.depth, LIMITS.depth)!, height: size(input.height, LIMITS.height)!,
      castors: input.castors === true || input.castors === "on" || input.castors === "true",
    },
  };
}

const labelOf = (list: readonly { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;

// The specification as lines of text, for the summary on the page and the message the team receives.
export function specLines(s: TableSpec): { label: string; value: string }[] {
  return [
    { label: "Table", value: labelOf(TABLE_TYPES, s.type) },
    { label: "Size (W x D x H)", value: `${s.width} x ${s.depth} x ${s.height}mm` },
    { label: "Undershelf", value: labelOf(UNDERSHELVES, s.undershelf) },
    { label: "Gantry", value: labelOf(GANTRIES, s.gantry) },
    { label: "Chamfered corners", value: labelOf(CHAMFERS, s.chamfer) },
    { label: "Upstand", value: labelOf(UPSTANDS, s.upstand) },
    { label: "Castors", value: s.castors ? "Castors" : "Adjustable feet" },
    { label: "Quantity", value: String(s.quantity) },
  ];
}

export const specMessage = (s: TableSpec) =>
  ["Made-to-measure stainless steel table (table configurator)", ...specLines(s).map((l) => `- ${l.label}: ${l.value}`)].join("\n");
