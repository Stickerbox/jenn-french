import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { OverlayProvider } from "@/components/ui/OverlayProvider";
import { currentLocale } from "@/lib/locale";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["italic"],
  variable: "--font-display-family",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-family",
});

export const metadata: Metadata = {
  title: "Word of the Day",
  description: "Daily French vocabulary flashcards",
};

// Reading headers() here — inside currentLocale() — opts the WHOLE APP into
// dynamic rendering, because every route shares this layout. /login and
// /signin stop being statically prerendered as a result. Accepted: this is one
// tutor and a small box, and it is the price of the page's language being
// right on the first paint rather than flickering after hydration once a
// client-side check ran.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await currentLocale();

  return (
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        {/* One provider for every route, so every Fab and every overlay —
            AddSheet today, ChatPanel once Task D1 wires it in — shares the
            same open-overlay count regardless of which page mounts them. */}
        <OverlayProvider>{children}</OverlayProvider>
      </body>
    </html>
  );
}
