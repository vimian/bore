import type { Guide } from "@/lib/guides/types";

export const WORKFLOW_GUIDES: Guide[] = [
  {
    slug: "webhook-testing-localhost",
    category: "workflows",
    title: "How to Test Webhooks on Localhost Over HTTPS",
    description:
      "Receive webhooks on a local app over HTTPS without opening inbound firewall rules or keeping a manually configured reverse proxy around for development.",
    intro:
      "Webhook testing is one of the most practical reasons to give localhost a secure public URL. Bore lets Stripe, GitHub, Slack, or a custom integration post into a local machine over HTTPS while you keep the receiving app on localhost.",
    updatedAt: "2026-04-14",
    queries: ["test webhooks localhost https", "webhook tunnel localhost", "https webhook local development"],
    highlights: ["Useful for Stripe, GitHub, Slack, and custom senders", "No inbound network setup", "Stable URLs help avoid reconfiguring webhook targets"],
    steps: [
      { title: "Run the webhook receiver locally", body: "Start the local server that will accept webhook calls." },
      { title: "Expose the receiver with Bore", body: "Create the public HTTPS URL for the webhook sender.", code: "bore up 3000" },
      { title: "Register that URL with the provider", body: "Use the Bore hostname in the webhook provider configuration instead of localhost." },
      { title: "Reuse the same namespace for later sessions", body: "Persistent namespaces reduce repeated provider reconfiguration across debugging sessions." },
    ],
    faq: [
      { question: "How do I test webhooks on localhost over HTTPS?", answer: "Expose the local webhook receiver with Bore and register the resulting HTTPS URL in the provider. That is usually much simpler than maintaining your own public ingress for development." },
      { question: "Why do stable webhook URLs matter?", answer: "Changing webhook targets repeatedly wastes time and increases the chance of stale configuration. A persistent namespace reduces that friction." },
      { question: "Can I route webhooks to a dedicated child host?", answer: "Yes. Bore can reserve a child host so webhook traffic uses a separate HTTPS hostname from the main app." },
    ],
  },
  {
    slug: "oauth-callback-localhost-https",
    category: "workflows",
    title: "How to Use OAuth Callbacks With Localhost HTTPS",
    description:
      "Handle OAuth and SSO callback flows in local development with a real HTTPS URL instead of trying to fit providers around plain localhost.",
    intro:
      "OAuth providers often expect secure redirect URLs, and even when localhost is technically allowed, realistic end-to-end testing usually goes better with a public HTTPS origin. Bore gives the local app that origin without changing the application stack.",
    updatedAt: "2026-04-14",
    queries: ["oauth callback localhost https", "sso local development https", "auth redirect localhost ssl"],
    highlights: ["Good for OAuth and SSO providers", "Stable callback URLs reduce setup churn", "Works with app and API split architectures"],
    steps: [
      { title: "Run the local app and callback handler", body: "Start the local frontend or backend that handles the auth return flow." },
      { title: "Expose the callback host with Bore", body: "Use Bore to create a secure public URL for the callback path.", code: "bore up 3000" },
      { title: "Register the HTTPS redirect URL", body: "Put the Bore hostname and callback path into the provider dashboard." },
      { title: "Keep the namespace reserved", body: "Reuse the same callback host when you restart development so provider settings stay valid." },
    ],
    faq: [
      { question: "Why use HTTPS for OAuth callbacks in local dev?", answer: "It better matches production assumptions, works cleanly with providers that expect secure redirects, and avoids callback URL churn when the host stays stable." },
      { question: "Can Bore help with frontend and API callback splits?", answer: "Yes. Bore can keep the app on one hostname and move the API or auth handler to a child host on another local port." },
      { question: "Is this only useful for browser apps?", answer: "No. It also helps with server-rendered apps, backend auth handlers, and mobile or desktop auth testing workflows." },
    ],
  },
  {
    slug: "secure-cookies-local-dev",
    category: "workflows",
    title: "How to Test Secure Cookies and Auth Flows in Local Development",
    description:
      "Use a real HTTPS origin in development for secure cookies, browser auth behavior, embedded flows, and feature checks that do not behave the same way on plain HTTP localhost.",
    intro:
      "A lot of 'local auth problems' are really secure-origin problems. When the browser expects HTTPS for a cookie, redirect, or embedded workflow, Bore gives the local app an origin that behaves more like production.",
    updatedAt: "2026-04-14",
    queries: ["secure cookies local dev", "local auth flow https", "https localhost cookies"],
    highlights: ["Closer to production browser behavior", "Useful for auth and embedded flows", "Can separate app and API origins when needed"],
    steps: [
      { title: "Run the local app or auth surface", body: "Start the frontend or backend that needs secure-origin browser behavior." },
      { title: "Expose it with Bore", body: "Use Bore to provide the HTTPS origin that the browser will treat as secure.", code: "bore up 3000" },
      { title: "Test the flow against the HTTPS URL", body: "Repeat the cookie, auth, iframe, or callback scenario using the Bore hostname instead of plain localhost." },
      { title: "Split origins when required", body: "If the app and API should be on different hosts, reserve a child host under the same namespace." },
    ],
    faq: [
      { question: "Why is localhost not enough for some auth flows?", answer: "Some browser and provider behaviors depend on a secure origin or a realistic host setup. A public HTTPS URL often reproduces the production behavior more accurately." },
      { question: "Can this help with secure cookie testing?", answer: "Yes. Bore gives the local app a proper HTTPS origin, which is useful when you need to test secure-cookie behavior outside plain localhost assumptions." },
      { question: "Can I keep the frontend and auth API on different origins?", answer: "Yes. Bore can route the main hostname and a child host such as api.<namespace>.bore.dk to different local ports." },
    ],
  },
];
