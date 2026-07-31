import type { SeoDoc } from "@/lib/docs/types";

export const NEXTJS_LOCALHOST_DOC: SeoDoc = {
  slug: "nextjs-localhost",
  kind: "how-to",
  eyebrow: "Next.js workflow",
  title: "Expose a Local Next.js Server with a Public HTTPS URL",
  description:
    "Expose Next.js localhost:3000 through a public HTTPS URL with Bore for preview links, OAuth callbacks, secure cookies, webhooks, and mobile testing.",
  intro:
    "Keep `next dev` running exactly where it is and put a public HTTPS endpoint in front of it. Bore forwards requests from a reserved `*.bore.dk` namespace to your local port, so external services and devices can reach the app without opening your router or managing certificates.",
  updatedAt: "2026-07-31",
  readTime: "6 minute setup",
  keywords: [
    "share local Next.js server",
    "expose Next.js localhost",
    "Next.js public URL",
    "Next.js localhost HTTPS",
  ],
  outcomes: [
    "A public HTTPS URL for localhost:3000",
    "A namespace you can reuse across restarts",
    "A realistic origin for callbacks and device testing",
  ],
  steps: [
    {
      title: "Start the Next.js development server",
      text: "Run the project normally and confirm it responds at http://localhost:3000 before adding a tunnel.",
      code: "pnpm dev",
    },
    {
      title: "Install and authenticate Bore",
      text: "Install the native client, then sign in through the browser flow. You only need to install once per machine.",
      code: "curl -sL https://bore.dk/install.sh | bash\nbore login",
    },
    {
      title: "Expose port 3000",
      text: "Start the tunnel. Bore lets you reuse an available namespace or allocate a new one, then prints its public HTTPS URL.",
      code: "bore up 3000",
    },
    {
      title: "Configure external callbacks",
      text: "Use the full Bore origin and the real application path in OAuth, webhook, or preview settings. Keep secrets server-side.",
      code: "https://<namespace>.bore.dk/api/auth/callback",
    },
    {
      title: "Stop or inspect the tunnel",
      text: "List tunnel state whenever you need the URL. Stopping port 3000 removes the local claim but preserves its reserved namespace for reuse.",
      code: "bore ls\nbore down 3000",
    },
  ],
  sections: [
    {
      id: "when-to-use",
      eyebrow: "Use cases",
      title: "When a public Next.js development URL helps",
      paragraphs: [
        "A tunnel is useful when the caller cannot reach `localhost`: an OAuth provider returning to a callback, a webhook sender posting an event, a teammate reviewing a branch, or a phone testing the real responsive experience.",
        "Bore terminates HTTPS at its public edge and relays HTTP and WebSocket traffic to the local app. Your Next.js process can remain a normal development server.",
      ],
      bullets: [
        "Test secure cookies and production-like redirect origins.",
        "Open the same build from a phone without relying on a changing LAN address.",
        "Share a temporary branch preview while your machine and tunnel are online.",
        "Receive callbacks from services that require a public HTTPS destination.",
      ],
    },
    {
      id: "app-origin",
      eyebrow: "Configuration",
      title: "Treat the Bore hostname as an external origin",
      paragraphs: [
        "Set application base URLs, allowed callback URLs, and CORS rules to the exact HTTPS hostname Bore gives you. Do not replace every internal localhost URL: server-to-server dependencies on your machine can continue using localhost.",
        "Environment variable names depend on your auth library and application. The example below is intentionally generic; use the setting documented by your provider.",
      ],
      code: [
        {
          label: ".env.local",
          value:
            "NEXT_PUBLIC_APP_ORIGIN=https://<namespace>.bore.dk\n# Use your auth provider's documented callback/base URL variable.",
        },
      ],
      callout:
        "Restart `next dev` after changing `.env.local`. Never put signing secrets in variables prefixed with `NEXT_PUBLIC_`.",
    },
    {
      id: "split-services",
      eyebrow: "Multiple ports",
      title: "Keep a separate local API on a child hostname",
      paragraphs: [
        "If Next.js runs on port 3000 and a separate API runs on port 3001, reserve a child hostname under the same namespace. The root continues to use the main tunnel port while the child host uses its override.",
      ],
      code: [
        {
          label: "Route api.<namespace>.bore.dk to port 3001",
          value:
            "bore host add <namespace> api\nbore host set-port <namespace> api 3001",
        },
      ],
      callout:
        "Separate origins make CORS and cookie behavior more production-like. Add only the exact origins your API should accept.",
    },
    {
      id: "troubleshooting",
      eyebrow: "Diagnostics",
      title: "If the page opens but assets or callbacks fail",
      paragraphs: [
        "First open `http://localhost:3000` on the development machine. A failing local request is an application issue; a working local request and failing public request narrows the problem to tunnel state, host validation, or provider configuration.",
      ],
      bullets: [
        "Run `bore ls` and confirm the namespace is active on the expected device and port.",
        "Check the Next.js terminal for compilation errors and rejected host or origin messages.",
        "Use the exact HTTPS callback path configured with the external provider.",
        "Remember that the URL stops serving when the local app, Bore daemon, or machine is offline.",
      ],
    },
  ],
  faq: [
    {
      question: "Does Bore replace the Next.js development server?",
      answer:
        "No. Next.js still serves the application locally. Bore provides the public HTTPS endpoint and relays traffic to that local port.",
    },
    {
      question: "Can I use Next.js hot reload through Bore?",
      answer:
        "Bore relays WebSocket upgrades, which Next.js development features use. If reload fails, check the browser console and Next.js host or origin restrictions for your version.",
    },
    {
      question: "Is the public URL available when my laptop sleeps?",
      answer:
        "No. The namespace remains reserved, but requests need an online device, running local server, and connected Bore agent.",
    },
    {
      question: "Should I expose a production database or admin route?",
      answer:
        "No. Treat the URL as internet-accessible. Use test data, keep credentials out of the client bundle, and do not expose development tools that assume a trusted network.",
    },
  ],
  resources: [
    { label: "Bore command reference", href: "https://github.com/vimian/bore#implemented-behavior", external: true },
    { label: "Next.js documentation", href: "https://nextjs.org/docs", external: true },
  ],
  related: [
    { label: "Test webhooks on localhost", href: "/docs/webhook-testing" },
    { label: "Compare Bore and ngrok", href: "/docs/vs-ngrok" },
    { label: "Browse all HTTPS guides", href: "/guides" },
  ],
  cta: {
    title: "Put your Next.js branch on a real HTTPS URL",
    body: "Create an account, authenticate the CLI, and expose port 3000 without changing how Next.js runs locally.",
    primary: { label: "Get started", href: "/login" },
    secondary: { label: "Read webhook setup", href: "/docs/webhook-testing" },
  },
};
