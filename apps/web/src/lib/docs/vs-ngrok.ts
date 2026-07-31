import type { SeoDoc } from "@/lib/docs/types";

export const VS_NGROK_DOC: SeoDoc = {
  slug: "vs-ngrok",
  kind: "comparison",
  eyebrow: "Tunnel comparison",
  title: "Bore vs ngrok: Choose the Right Localhost Tunnel",
  description:
    "Compare Bore and ngrok for exposing localhost: setup, persistent domains, child-host routing, observability, traffic controls, pricing model, and team needs.",
  intro:
    "Both tools put a public endpoint in front of a local service. Bore is a focused, source-available tunnel with account-reserved namespaces and child-host routing. ngrok is a broader commercial connectivity platform with mature traffic policies, inspection, team, and enterprise features. The right choice depends on which layer you need.",
  updatedAt: "2026-07-31",
  readTime: "7 minute comparison",
  keywords: [
    "ngrok alternative",
    "free ngrok alternative",
    "Bore vs ngrok",
    "localhost tunnel comparison",
  ],
  outcomes: [
    "A capability-by-capability comparison without benchmarks",
    "Clear cases where Bore is the simpler fit",
    "Clear cases where ngrok offers more",
  ],
  sections: [
    {
      id: "short-answer",
      eyebrow: "Short answer",
      title: "Choose based on the job, not the command",
      paragraphs: [
        "Choose Bore when you want a small workflow for public HTTPS, reusable `*.bore.dk` namespaces, persistent local daemon behavior, and child hosts that can route related services to separate ports.",
        "Choose ngrok when you need a wider gateway platform: configurable traffic policies, a dedicated request inspector with retention, organization controls, custom domains, enterprise support, or published production-oriented plans.",
      ],
      callout:
        "ngrok plan details were verified in July 2026 against its official pricing and free-plan documentation linked below. This page compares documented capabilities, not latency or throughput.",
    },
    {
      id: "workflow",
      eyebrow: "Setup",
      title: "The basic localhost workflow is similar",
      paragraphs: [
        "Both clients authenticate and connect an outbound agent to a hosted edge. You do not need inbound router configuration for the normal HTTP tunnel workflow.",
      ],
      code: [
        {
          label: "Bore",
          value: "bore login\nbore up 3000\nbore ls",
        },
        {
          label: "ngrok",
          value: "ngrok config add-authtoken <token>\nngrok http 3000",
        },
      ],
    },
    {
      id: "bore-fit",
      eyebrow: "Bore strengths",
      title: "Where Bore is intentionally focused",
      paragraphs: [
        "Bore keeps namespace ownership, tunnel state, child-host routing, and basic request statistics in one compact system. A stopped claim does not automatically release its namespace, which helps callback URLs survive local restarts.",
      ],
      bullets: [
        "Reserve a top-level Bore namespace to the account and reuse it when available.",
        "Route `api.<namespace>.bore.dk` or another reserved child host to a different local port.",
        "Run a background agent that reconnects desired tunnels after restart.",
        "Inspect and modify the source under Bore's repository license terms.",
      ],
    },
    {
      id: "ngrok-fit",
      eyebrow: "ngrok strengths",
      title: "Where ngrok has a broader platform",
      paragraphs: [
        "ngrok documents traffic policies for authentication, rate limits, request modification, routing, and other gateway behavior. Its plans also describe traffic inspection retention, custom domains, service users, team features, and enterprise support.",
        "Those capabilities matter when the tunnel is becoming shared infrastructure rather than a short-lived development path. The free tier currently includes one assigned development domain, up to three online endpoints, 1 GB of monthly transfer, 20,000 monthly HTTP(S) requests, and an HTML interstitial. Custom or reserved domains require a paid plan.",
        "Limits, availability, and pricing can change, so check the official ngrok pages linked under sources before deciding.",
      ],
    },
    {
      id: "decision",
      eyebrow: "Decision guide",
      title: "A practical way to decide",
      paragraphs: [
        "Start with the smallest system that meets the risk and workflow. For a developer sharing Next.js, receiving test webhooks, or keeping a few stable test hosts, Bore's narrower surface may be enough. For production ingress, advanced edge policy, enterprise identity, or formal support requirements, evaluate ngrok's paid platform directly.",
      ],
      callout:
        "Neither tool makes an unsafe development server safe by default. Expose test data only, patch dependencies, verify webhook signatures, and add application authentication where the content is sensitive.",
    },
  ],
  comparison: {
    alternativeName: "ngrok",
    checkedAt: "2026-07-31",
    rows: [
      {
        capability: "Basic HTTP tunnel",
        bore: "`bore up <port>` after browser login.",
        alternative: "`ngrok http <port>` after adding an authtoken.",
      },
      {
        capability: "Hosted development URL",
        bore: "Account-reserved `*.bore.dk` namespaces; account limits apply.",
        alternative:
          "Free tier includes one assigned development domain; custom or reserved domains require a paid plan.",
      },
      {
        capability: "Published free-tier limits",
        bore: "Hosted access is subject to Bore account limits; this page makes no transfer or request quota claim.",
        alternative:
          "Up to 3 online endpoints, 1 GB/month transfer, 20k HTTP(S) requests/month, and an HTML interstitial.",
      },
      {
        capability: "Related service hosts",
        bore: "Reserved child hosts can override the local port.",
        alternative: "Custom, reserved, and wildcard domain options depend on a paid plan.",
      },
      {
        capability: "Observability",
        bore: "Dashboard tunnel state and request statistics; no claimed payload inspector.",
        alternative: "Traffic Inspector with plan-dependent retention.",
      },
      {
        capability: "Edge policy",
        bore: "Focused relay and routing; application owns request authentication.",
        alternative: "Traffic Policy supports auth, rate limits, rewrites, and more.",
      },
      {
        capability: "Source availability",
        bore: "Repository source is available under BUSL-1.1 terms.",
        alternative: "Commercial hosted product and agent ecosystem.",
      },
      {
        capability: "Best fit",
        bore: "Focused development tunnels and stable Bore namespace workflows.",
        alternative: "Advanced gateway, production, team, and enterprise requirements.",
      },
    ],
  },
  faq: [
    {
      question: "Is Bore a free ngrok alternative?",
      answer:
        "Bore's hosted development service is currently offered without a paid plan, subject to account limits. It covers the core public HTTPS tunnel workflow, but it is not a feature-for-feature replacement for ngrok's commercial gateway platform.",
    },
    {
      question: "Does Bore have a request inspector like ngrok?",
      answer:
        "Bore exposes tunnel state and request statistics, but this comparison does not claim a payload inspection and replay tool equivalent to ngrok's Traffic Inspector.",
    },
    {
      question: "Can Bore keep the same public URL?",
      answer:
        "Bore namespaces are reserved separately from active tunnel claims. You can stop a tunnel and reuse its namespace later when it is not active on another device.",
    },
    {
      question: "Should I use Bore for production ingress?",
      answer:
        "Evaluate your availability, security policy, observability, support, and compliance requirements first. Bore is positioned here for development tunnels; ngrok publishes plans and controls aimed at broader production and enterprise use.",
    },
  ],
  resources: [
    { label: "Bore source and license", href: "https://github.com/vimian/bore", external: true },
    { label: "ngrok pricing and plan limits", href: "https://ngrok.com/pricing", external: true },
    { label: "ngrok free plan limits", href: "https://ngrok.com/docs/pricing-limits/free-plan-limits", external: true },
    { label: "ngrok Traffic Policy", href: "https://ngrok.com/docs/traffic-policy", external: true },
  ],
  related: [
    { label: "Expose a Next.js server", href: "/docs/nextjs-localhost" },
    { label: "Test webhooks locally", href: "/docs/webhook-testing" },
    { label: "Browse all HTTPS guides", href: "/guides" },
  ],
  cta: {
    title: "Try the focused tunnel workflow",
    body: "If stable Bore namespaces and public HTTPS cover your use case, expose a local port and test it with your own application.",
    primary: { label: "Start with Bore", href: "/login" },
    secondary: { label: "Read the Next.js guide", href: "/docs/nextjs-localhost" },
  },
};
