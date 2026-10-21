import { SiteShell, siteMetadata } from "@/components/site-shell";
import "@/styles/base.css";
import "@/styles/ovens.css";
import "@/styles/catalogue.css";

export const metadata = siteMetadata;

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
