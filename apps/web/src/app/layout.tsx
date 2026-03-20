import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bore | Secure Tunneling. Zero Friction.",
  description:
    "The authenticated control plane for exposing local services with managed namespaces, live telemetry, and persistent tunnels.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${display.variable} ${mono.variable} bg-zinc-950 text-zinc-50 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
