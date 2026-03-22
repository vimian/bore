import type { Metadata } from "next";
import Script from "next/script";

import { LandingPage } from "@/components/landing-page";
import { getSiteOrigin } from "@/lib/env";
import { formatCompactNumber, getGitHubStars } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";

const siteOrigin = getSiteOrigin();
const pageTitle = "Open Source Localhost Tunneling With Persistent URLs";
const pageDescription =
  "Expose localhost securely with Bore. Get an open source tunnel, managed subdomains, persistent URLs, browser-based login, and a web control plane for local development and webhook testing.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
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
          "Secure localhost tunneling",
          "Persistent subdomains",
          "Managed namespaces",
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
