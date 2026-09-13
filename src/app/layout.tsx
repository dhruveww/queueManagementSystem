import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Instrument_Serif,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
  Tiro_Devanagari_Hindi,
} from "next/font/google";
import "./globals.css";

/*
 * Five faces, each with one job. They are exposed as CSS variables on <html>
 * but only the marketing site (`.site`) actually references them, so the
 * dashboard and guest pages keep the system stack they were tuned for.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
const deva = Tiro_Devanagari_Hindi({
  subsets: ["devanagari", "latin"],
  weight: "400",
  variable: "--font-deva",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Baari — your turn, on WhatsApp", template: "%s · Baari" },
  description:
    "Virtual queuing for Indian restaurants. Guests scan a QR, wait wherever they like, " +
    "and get a WhatsApp message the moment their table is ready.",
};

export const viewport: Viewport = {
  themeColor: "#ff8112",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // the pre-paint script below adds a `js` class here, which the server
      // cannot know about — this is the one attribute allowed to differ
      suppressHydrationWarning
      className={`${display.variable} ${serif.variable} ${body.variable} ${mono.variable} ${deva.variable}`}
    >
      <head>
        {/* Marks the document as scripted before first paint, so the reveal
            animations can hide their content without ever hiding it from a
            visitor whose JS never arrives. */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
