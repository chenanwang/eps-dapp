import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
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
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          {/* Global attribution footer (issue #159, Fix 5). */}
          <footer className="border-t border-foreground/10 py-3 text-center text-xs text-foreground/40">
            Anchored on Hedera · Delivered by{" "}
            <a
              href="https://app.ens.domains/youhavebeenserved.eth"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              youhavebeenserved.eth
            </a>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
