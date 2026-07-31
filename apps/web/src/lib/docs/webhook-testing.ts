import type { SeoDoc } from "@/lib/docs/types";

export const WEBHOOK_TESTING_DOC: SeoDoc = {
  slug: "webhook-testing",
  kind: "how-to",
  eyebrow: "Webhook workflow",
  title: "Test Stripe and GitHub Webhooks on Localhost",
  description:
    "Test Stripe, GitHub, and custom webhooks against a local server using a stable public HTTPS URL, without opening firewall ports or deploying every change.",
  intro:
    "Webhook providers cannot post to `localhost`, but your handler does not need to be deployed for every edit. Bore gives the local receiver a public HTTPS URL while your framework, logs, debugger, and test data stay on your machine.",
  updatedAt: "2026-07-31",
  readTime: "8 minute setup",
  keywords: [
    "test webhooks localhost",
    "Stripe webhook testing localhost",
    "GitHub webhook localhost",
    "public webhook URL local development",
  ],
  outcomes: [
    "A reachable HTTPS endpoint for provider test events",
    "A stable namespace that reduces dashboard reconfiguration",
    "A safer checklist for signatures, retries, and test data",
  ],
  steps: [
    {
      title: "Start the webhook receiver locally",
      text: "Run the app and verify the webhook path locally before involving the provider. Preserve the raw request body if your provider requires it for signature verification.",
      code: "curl -i -X POST http://localhost:3000/api/webhooks/test",
    },
    {
      title: "Open the local port with Bore",
      text: "Authenticate if needed, then expose the same port. Bore returns a public HTTPS namespace.",
      code: "bore login\nbore up 3000",
    },
    {
      title: "Register the complete endpoint URL",
      text: "Add your handler path to the Bore origin in the provider dashboard. Select only the event types the handler supports.",
      code: "https://<namespace>.bore.dk/api/webhooks/stripe",
    },
    {
      title: "Configure and verify the signing secret",
      text: "Store the provider's webhook secret in a server-only environment variable and verify every event before changing state.",
      code: "STRIPE_WEBHOOK_SECRET=whsec_...\nGITHUB_WEBHOOK_SECRET=...",
    },
    {
      title: "Send a test event and inspect both sides",
      text: "Trigger a provider test delivery, then compare its delivery status with your local application logs. Bore transports the request; provider delivery tools and your app remain the source of payload-level diagnostics.",
    },
  ],
  sections: [
    {
      id: "provider-setup",
      eyebrow: "Endpoints",
      title: "Use the route your application actually handles",
      paragraphs: [
        "A tunnel exposes an origin, not a magic webhook route. If the local handler is `/api/webhooks/github`, register that same path after the Bore hostname. A `404` usually means the request reached your app but the path or HTTP method is wrong.",
        "Keep Stripe in test mode and use a test repository or narrowly selected GitHub events while developing. Public tunnel URLs can receive unsolicited internet traffic.",
      ],
      code: [
        {
          label: "Example endpoints",
          value:
            "https://<namespace>.bore.dk/api/webhooks/stripe\nhttps://<namespace>.bore.dk/api/webhooks/github",
        },
      ],
    },
    {
      id: "signature-security",
      eyebrow: "Security",
      title: "A successful HTTP request is not a trusted event",
      paragraphs: [
        "TLS protects the connection to the Bore edge, but your handler must still authenticate the sender. Verify the provider signature using its official SDK or algorithm, reject stale timestamps where supported, and never authorize an event from a user-controlled body field alone.",
      ],
      bullets: [
        "Verify signatures against the unmodified raw body when the provider requires it.",
        "Return a non-2xx response when validation fails; do not continue asynchronously.",
        "Store signing secrets outside source control and browser-exposed environment variables.",
        "Use idempotency keys or provider event IDs before applying side effects.",
      ],
      callout:
        "Bore does not replace Stripe or GitHub signature verification. It only makes the local HTTP endpoint reachable.",
    },
    {
      id: "retries",
      eyebrow: "Reliability",
      title: "Design the handler for retries and short response times",
      paragraphs: [
        "Providers retry failed or slow deliveries, so the same event may arrive more than once. Validate the request, record its unique event ID, enqueue or perform bounded work, and acknowledge it promptly. Your exact timeout and retry schedule comes from the provider, not Bore.",
      ],
      bullets: [
        "Persist processed event IDs with a uniqueness constraint.",
        "Log the provider event ID, event type, response status, and processing outcome.",
        "Make side effects transactional or safely repeatable.",
        "Test duplicate delivery and out-of-order delivery before shipping.",
      ],
    },
    {
      id: "dedicated-host",
      eyebrow: "Isolation",
      title: "Route a dedicated webhook service to another port",
      paragraphs: [
        "A child hostname keeps webhook traffic separate from the main local app. After reserving it, point that host at the receiver's local port.",
      ],
      code: [
        {
          label: "Route hooks.<namespace>.bore.dk to port 3001",
          value:
            "bore host add <namespace> hooks\nbore host set-port <namespace> hooks 3001",
        },
      ],
      callout:
        "The child host is still public. Isolation by hostname is useful routing, not access control.",
    },
    {
      id: "diagnostics",
      eyebrow: "Troubleshooting",
      title: "Locate failures in the shortest order",
      paragraphs: [
        "Work from the local handler outward. This separates application failures from tunnel state and provider configuration without guessing.",
      ],
      bullets: [
        "Local curl fails: fix the route, process, or framework first.",
        "Local curl works, public curl fails: check `bore ls`, the assigned port, and tunnel status.",
        "Public curl works, provider fails: check its exact URL, event selection, signature secret, and delivery log.",
        "Provider receives 2xx but behavior is wrong: trace the event ID through application logs and idempotency storage.",
      ],
    },
  ],
  faq: [
    {
      question: "Can Bore inspect or replay webhook bodies?",
      answer:
        "Bore provides tunnel telemetry, but this workflow should use the provider's delivery log and your application logs for payload inspection and replay. Do not assume Bore is a webhook-specific inspector.",
    },
    {
      question: "Why does signature verification fail through a tunnel?",
      answer:
        "The common cause is parsing or modifying the body before verification, or using the wrong endpoint secret. Verify the provider's signature against the exact body format its documentation requires.",
    },
    {
      question: "Will the webhook URL change every time?",
      answer:
        "Bore reserves namespaces to your account. Stopping a local claim does not release the namespace, so it can be reused when available.",
    },
    {
      question: "Can I use the same setup for custom webhook senders?",
      answer:
        "Yes. Any sender that can reach a public HTTPS URL can call the endpoint, but your application must define and verify an authentication scheme.",
    },
  ],
  resources: [
    { label: "Stripe webhook signatures", href: "https://docs.stripe.com/webhooks/signature", external: true },
    { label: "GitHub webhook validation", href: "https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries", external: true },
  ],
  related: [
    { label: "Expose a Next.js server", href: "/docs/nextjs-localhost" },
    { label: "Compare Bore and ngrok", href: "/docs/vs-ngrok" },
    { label: "Browse all HTTPS guides", href: "/guides" },
  ],
  cta: {
    title: "Debug the next webhook locally",
    body: "Keep your debugger and logs close while Bore gives the provider a stable HTTPS destination.",
    primary: { label: "Create a Bore account", href: "/login" },
    secondary: { label: "Set up Next.js", href: "/docs/nextjs-localhost" },
  },
};
