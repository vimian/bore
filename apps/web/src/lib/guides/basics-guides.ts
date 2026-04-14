import type { Guide } from "@/lib/guides/types";

export const BASICS_GUIDES: Guide[] = [
  {
    slug: "https-local-website",
    category: "basics",
    title: "How to Put a Local Website on HTTPS",
    description:
      "Expose a local website over HTTPS without managing local certificates. Bore gives localhost a real HTTPS URL for browser testing, callbacks, and webhook flows.",
    intro:
      "If you need HTTPS for a local website, the simplest path is usually to keep the app on localhost and put a real TLS endpoint in front of it. Bore does that without forcing you to wire certificate files into every local setup.",
    updatedAt: "2026-04-14",
    queries: ["https local website", "how to add ssl to local dev", "localhost https"],
    highlights: ["Real HTTPS URL for localhost", "No local certificate authority setup", "Useful for browser APIs, callbacks, and webhooks"],
    steps: [
      { title: "Install Bore once", body: "Install the CLI and keep your usual development workflow unchanged.", code: "curl -sL https://bore.dk/install.sh | bash" },
      { title: "Run your local site normally", body: "Keep your website on its existing local port such as 3000, 4173, or 8080." },
      { title: "Expose the port over HTTPS", body: "Bore creates a public HTTPS URL that forwards to your local website.", code: "bore up 3000" },
      { title: "Reuse the same namespace later", body: "Persistent namespaces reduce callback URL churn when you stop and restart development." },
    ],
    faq: [
      { question: "How do I add SSL to local dev?", answer: "If you mainly need a secure public URL, use a tunnel with real HTTPS in front of your local app. Bore does that without requiring every machine to trust a local certificate authority." },
      { question: "Can I make a local website HTTPS for free?", answer: "Yes. Bore can give your local website a free HTTPS URL for development and testing flows." },
      { question: "When should I use local certificates instead?", answer: "Use local certificates when the process itself must terminate TLS on localhost. Use Bore when the main goal is secure external access to the local app." },
    ],
  },
  {
    slug: "local-api-https",
    category: "basics",
    title: "How to Expose a Local API Over HTTPS",
    description:
      "Put a local API on a real HTTPS URL for browser clients, mobile apps, webhook callbacks, and partner integrations without adding local TLS complexity.",
    intro:
      "Many local API problems are really HTTPS problems: CORS behavior, secure callbacks, external integrations, and browser restrictions all get easier when the API has a real HTTPS origin. Bore exposes the local API without changing the API server itself.",
    updatedAt: "2026-04-14",
    queries: ["local api https", "localhost api ssl", "how to add ssl to local api"],
    highlights: ["Works with any local API server", "Useful for browser and mobile clients", "No reverse proxy setup required"],
    steps: [
      { title: "Run the API locally", body: "Start your API on its existing port, such as 3001 or 8080." },
      { title: "Expose that port with Bore", body: "Bore gives the API a public HTTPS URL while the server keeps listening on localhost.", code: "bore up 3001" },
      { title: "Point clients to the Bore URL", body: "Use the HTTPS URL in frontend apps, mobile builds, external callbacks, or partner testing flows." },
      { title: "Add a separate frontend hostname later if needed", body: "If the frontend and API should use different origins, Bore can reserve a child host under the same namespace." },
    ],
    faq: [
      { question: "How do I add SSL to a local API?", answer: "The easiest option is usually to expose the local API through a service that terminates HTTPS for you. Bore does that while the API itself stays simple on localhost." },
      { question: "Can I use this with REST, GraphQL, or RPC servers?", answer: "Yes. Bore forwards HTTP and websocket traffic, so the local API technology is not the limiting factor." },
      { question: "Do I need to change my API framework code?", answer: "Usually no. In most setups you keep the local API server exactly as it is and let Bore handle the HTTPS endpoint." },
    ],
  },
  {
    slug: "mobile-device-testing-https",
    category: "basics",
    title: "How to Open Localhost on HTTPS From Your Phone or Another Device",
    description:
      "Test a local app or API on a phone, tablet, or another laptop over HTTPS without opening your whole machine to the internet or sharing raw LAN URLs.",
    intro:
      "Phone and cross-device testing often fails on plain localhost because the device cannot resolve your machine, the network changes, or the browser requires HTTPS. Bore gives the local app a stable HTTPS URL that works across devices.",
    updatedAt: "2026-04-14",
    queries: ["localhost on phone https", "mobile testing localhost https", "open local dev server on phone with ssl"],
    highlights: ["Works across phones and laptops", "No router changes needed", "Stable URL for repeated testing sessions"],
    steps: [
      { title: "Run the app locally", body: "Start your frontend or API on its normal local port." },
      { title: "Expose the port with Bore", body: "Create the HTTPS URL that other devices can open securely.", code: "bore up 3000" },
      { title: "Open the HTTPS URL on the other device", body: "Use the Bore hostname on a phone, tablet, or remote browser instead of a LAN IP." },
      { title: "Reuse the same namespace for ongoing QA", body: "Persistent namespaces make repeated device testing less fragile across restarts and network changes." },
    ],
    faq: [
      { question: "How do I open localhost on my phone with HTTPS?", answer: "Expose the local port with Bore and open the resulting HTTPS URL on your phone. That avoids local network resolution issues and gives the device a proper secure origin." },
      { question: "Why not just use my LAN IP?", answer: "LAN URLs break when networks change, often lack HTTPS, and are awkward for remote collaborators. A stable HTTPS tunnel is a better testing path." },
      { question: "Can this work for APIs as well as websites?", answer: "Yes. Bore works for both local websites and local APIs, including websocket-based flows." },
    ],
  },
];
