import data from "@/data/case-studies.json";

export type CaseStudy = { title: string; body: string; image: string | null; document: string | null };

export const caseStudies: CaseStudy[] = data;

export const caseStudyImage = (c: CaseStudy) => (c.image ? `/assets/img/case-studies/${encodeURIComponent(c.image)}` : null);

// The project write-ups are still hosted on the old site.
export const caseStudyDocument = (c: CaseStudy) => (c.document ? `https://www.caterkwik.co.uk${encodeURI(c.document)}` : null);

/** The text cut at a word boundary near `max` characters, with the rest, so a long story can fold away. */
export function splitStory(body: string, max = 200): { lead: string; rest: string } {
  if (body.length <= max * 1.25) return { lead: body, rest: "" };
  const cut = body.lastIndexOf(" ", max);
  const at = cut > max / 2 ? cut : max;
  return { lead: body.slice(0, at).trimEnd() + "…", rest: body.slice(at).trimStart() };
}
