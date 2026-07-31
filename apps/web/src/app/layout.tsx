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
const defaultTitle =
  "Bore — Expose Localhost to the Internet | Free Ngrok Alternative";
const defaultDescription =
  "Expose Next.js, Vite, and local APIs at a public HTTPS URL with Bore, a free ngrok alternative. Test webhooks and mobile apps with persistent subdomains.";

export const metadata: Metadata = {
  metadataBase: siteURL,
  applicationName: siteName,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  title: {
    default: defaultTitle,
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  keywords: [
    "bore",
    "expose localhost to internet",
    "expose localhost to public URL",
    "free ngrok alternative",
    "ngrok alternative",
    "localhost tunnel",
    "source available tunnel",
    "Next.js tunnel",
    "Vite tunnel",
    "public URL for local API",
    "webhook testing localhost",
    "test webhooks locally",
    "mobile testing localhost",
    "persistent HTTPS subdomains",
    "developer tools",
  ],
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
