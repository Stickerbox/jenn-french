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

// The site's own name, not a description of one feature. "Word of the Day" was
// the browser tab's title on every route — the admin, a student's shelf, a
// worksheet — and named the daily card on all of them. It is also what a
// bookmark is called, which is the copy students actually keep.
//
// Not translated, deliberately, unlike everything in lib/strings.ts: this is a
// proper name and reads the same in both languages.
export const metadata: Metadata = {
  title: "Français Avec Jenn",
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
