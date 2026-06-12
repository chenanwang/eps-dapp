import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BLI E-Process Server",
  description:
    "EPS facilitates service of process and generates court-ready proof.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
