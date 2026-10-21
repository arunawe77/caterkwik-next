import type { Metadata } from "next";
import "@/styles/base.css";
import "@/styles/catalogue.css";
import "@/styles/admin.css";

export const metadata: Metadata = {
  title: { default: "Admin | Caterkwik", template: "%s | Caterkwik admin" },
  robots: { index: false, follow: false },
};

const FONT = "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap";

// The admin is its own root layout: staff get a workspace, not the shop header and footer.
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT} />
      </head>
      <body className="adm">{children}</body>
    </html>
  );
}
