import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
