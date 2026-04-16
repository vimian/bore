import type { Metadata } from "next";
import Script from "next/script";

import { LandingPage } from "@/components/landing-page";
import { getSiteOrigin } from "@/lib/env";
import { formatCompactNumber, getGitHubStars } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";

const siteOrigin = getSiteOrigin();
const pageTitle = "HTTPS For Localhost, Loopback Hostnames, Persistent URLs, And Child Subdomains";
const pageDescription =
  "Expose localhost over HTTPS with Bore. Get real HTTPS URLs for local websites, APIs, Node.js, React, Next.js, and Vite dev servers, plus loopback hostnames like l.bore.dk, local.bore.dk, localhost.bore.dk, stable webhook callbacks, OAuth flows, and child-subdomain workflows like api.bo.bore.dk.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  keywords: [
    "l.bore.dk",
    "local.bore.dk",
    "localhost.bore.dk",
    "127.0.0.1 custom domain",
    "localhost subdomains",
    "https localhost",
    "child subdomain localhost",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `Bore | ${pageTitle}`,
    description: pageDescription,
    url: siteOrigin,
  },
  twitter: {
    title: `Bore | ${pageTitle}`,
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
        name: "Bore",
        url: siteOrigin,
        description: pageDescription,
      },
      {
        "@type": "SoftwareApplication",
        name: "Bore",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Windows, macOS, Linux",
        softwareVersion: "latest",
        description: pageDescription,
        url: siteOrigin,
        downloadUrl: `${siteOrigin}/install.sh`,
        installUrl: `${siteOrigin}/install.sh`,
        codeRepository: "https://github.com/vimian/bore",
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
          "HTTPS for localhost development",
          "Loopback hostnames for local development",
          "l.bore.dk, local.bore.dk, and localhost.bore.dk hostnames for 127.0.0.1",
          "HTTPS for local websites, APIs, and common dev frameworks",
          "Stable webhook and OAuth callback URLs",
          "Persistent subdomains",
          "Managed namespaces and child subdomains",
          "Web control plane",
          "Open source client and server",
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
