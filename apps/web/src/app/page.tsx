import type { Metadata } from "next";
import Script from "next/script";

import { LandingPage } from "@/components/landing-page";
import { getSiteOrigin } from "@/lib/env";
import { formatCompactNumber, getGitHubStars } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";

const siteOrigin = getSiteOrigin();
const pageTitle =
  "Bore — Expose Localhost to the Internet | Free Ngrok Alternative";
const pageDescription =
  "Expose Next.js, Vite, and local APIs at a public HTTPS URL with Bore, a free ngrok alternative. Test webhooks and mobile apps with persistent subdomains.";

export const metadata: Metadata = {
  title: {
    absolute: pageTitle,
  },
  description: pageDescription,
  keywords: [
    "expose localhost to internet",
    "expose localhost to public URL",
    "free ngrok alternative",
    "Next.js tunnel",
    "Vite tunnel",
    "public URL for local API",
    "webhook testing localhost",
    "mobile testing localhost",
    "persistent HTTPS subdomains",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: siteOrigin,
  },
  twitter: {
    title: pageTitle,
    description: pageDescription,
  },
};

export default async function Home() {
  const [user, stars] = await Promise.all([getCurrentUser(), getGitHubStars()]);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteOrigin}/#website`,
        name: "Bore",
        url: siteOrigin,
        description: pageDescription,
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteOrigin}/#software`,
        name: "Bore",
        applicationCategory: "DeveloperApplication",
        applicationSubCategory: "Development tool",
        operatingSystem: "Windows, macOS, Linux",
        description: pageDescription,
        url: siteOrigin,
        downloadUrl: `${siteOrigin}/install.sh`,
        installUrl: `${siteOrigin}/install.sh`,
        codeRepository: "https://github.com/vimian/bore",
        license: "https://github.com/vimian/bore/blob/master/LICENSE",
        isAccessibleForFree: true,
        creator: {
          "@type": "Person",
          name: "Casper Fenger Jensen",
        },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "Expose localhost through a public HTTPS URL",
          "Public HTTPS URLs for Next.js, Vite, and local APIs",
          "Webhook and OAuth callback testing on localhost",
          "Mobile testing against local development servers",
          "Persistent HTTPS subdomains",
          "Managed namespaces and child subdomains",
          "Live tunnel telemetry in a web control plane",
          "Publicly reviewable source under BUSL-1.1",
        ],
      },
    ],
  };

  return (
    <>
      <Script
        id="bore-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <LandingPage
        consoleHref={user ? "/dashboard" : "/login"}
        consoleLabel={user ? "Open Console" : "Sign In"}
        primaryCtaLabel={user ? "Open Console" : "Get Started for Free"}
        starLabel={stars === null ? "Live" : formatCompactNumber(stars)}
      />
    </>
  );
}
