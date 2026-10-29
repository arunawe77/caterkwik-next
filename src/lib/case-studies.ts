import data from "@/data/case-studies.json";

export type CaseStudy = { title: string; body: string; image: string | null; document: string | null };

export const caseStudies: CaseStudy[] = data;

export const caseStudyImage = (c: CaseStudy) => (c.image ? `/assets/img/case-studies/${encodeURIComponent(c.image)}` : null);

// The project write-ups are still hosted on the old site.
export const caseStudyDocument = (c: CaseStudy) => (c.document ? `https://www.caterkwik.co.uk${encodeURI(c.document)}` : null);

export const SECTORS = ["Restaurants & cafés", "Pubs & hotels", "Laundry", "Schools & community", "Trade & retail"] as const;
export type Sector = (typeof SECTORS)[number];

const SECTOR_RULES: [Sector, RegExp][] = [
  ["Laundry", /laund|\bwash|dryer|dry clean|\biron/i],
  ["Pubs & hotels", /\b(inn|pub|hotel|lion|fox|hare|border|charlwood|compass)\b/i],
  ["Schools & community", /school|college|village hall|club|hospital|housing|raf\b|wildlife|veterinary|equitation/i],
  ["Restaurants & cafés", /restaurant|caf[eé]|pizza|tearoom|kebab|sandwich|brasseria|eatery|donut|delicia|baretto|mexican|grill|kitchen|burreato|andre|cue\b/i],
];

/** A broad sector for filtering, read from the story's title first and then its text. */
export function sectorOf(c: CaseStudy): Sector {
  const hit = SECTOR_RULES.find(([, re]) => re.test(c.title)) ?? SECTOR_RULES.find(([, re]) => re.test(c.body));
  return hit ? hit[0] : "Trade & retail";
}

/** The text cut at a word boundary near `max` characters, with the rest, so a long story can fold away. */
export function splitStory(body: string, max = 200): { lead: string; rest: string } {
  if (body.length <= max * 1.25) return { lead: body, rest: "" };
  const cut = body.lastIndexOf(" ", max);
  const at = cut > max / 2 ? cut : max;
  return { lead: body.slice(0, at).trimEnd() + "…", rest: body.slice(at).trimStart() };
}
