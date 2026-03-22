import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";

import { getSiteOrigin } from "@/lib/env";

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

const siteOrigin = getSiteOrigin();
const siteURL = new URL(siteOrigin);
const siteName = "Bore";
const defaultTitle = "Bore | Secure Tunneling For Localhost, APIs, And Dev Environments";
const defaultDescription =
  "Bore is an open source tunneling platform for exposing localhost securely with managed subdomains, persistent tunnels, and a web control plane.";

export const metadata: Metadata = {
  metadataBase: siteURL,
  applicationName: siteName,
  title: {
    default: defaultTitle,
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  keywords: [
    "bore",
    "secure tunneling",
    "localhost tunnel",
    "open source tunnel",
    "ngrok alternative",
    "dev tunnel",
    "webhook testing",
    "persistent tunnels",
    "custom subdomains",
    "developer tools",
  ],
  alternates: {
    canonical: "/",
  },
  category: "developer tools",
  authors: [{ name: "Casper Fenger Jensen" }],
  creator: "Casper Fenger Jensen",
  publisher: siteName,
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: siteOrigin,
    siteName,
    title: defaultTitle,
    description: defaultDescription,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
  },
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
