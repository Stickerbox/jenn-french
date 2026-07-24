import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
