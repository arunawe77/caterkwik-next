import type { Metadata } from "next";
import { Footer, Header } from "@/components/site-chrome";
import { ROBOTS } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Caterkwik | Commercial catering equipment", template: "%s | Caterkwik" },
  description: "Commercial ovens, priced, filterable and supplied with service since 1994.",
  robots: ROBOTS,
};

// Applies a returning visitor's ex/inc VAT choice before first paint, so prices never flash.
const VAT_INIT = `try{if(localStorage.getItem("vat")==="inc")document.body.classList.add("showinc")}catch(e){}`;

const FONT = "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap";

// Each route group imports its own stylesheets and renders this shell. The two groups
// cannot share one, because the approved product page and the ovens pages define `.hero` differently.
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: VAT_INIT }} />
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
