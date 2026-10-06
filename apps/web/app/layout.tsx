import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Grindly", description: "Stake money on habits. Your Apple Watch is the referee. Test mode." };
export const viewport: Viewport = { themeColor: "#15100e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
