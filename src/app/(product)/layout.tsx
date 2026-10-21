import { SiteShell, siteMetadata } from "@/components/site-shell";
import "@/styles/base.css";

export const metadata = siteMetadata;

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
