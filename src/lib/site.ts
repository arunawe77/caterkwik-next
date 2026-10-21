export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const COMPANY = {
  name: "Cater-Kwik Ltd",
  phone: "01229 480001",
  address: "The Lakeland Catering Centre, Newland, Ulverston, Cumbria LA12 7QQ",
  hours: ["Mon to Fri, 8am to 6pm", "Saturday, 9am to 5pm"],
  companyNumber: "04432906",
  vat: "621 3333 84",
  established: 1994,
} as const;

export const SCRAPED_ON = "23 September 2026";
