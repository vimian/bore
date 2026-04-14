import type { Guide } from "@/lib/guides/types";

export const FRAMEWORK_GUIDES: Guide[] = [
  {
    slug: "https-node-run-dev",
    category: "frameworks",
    title: "How to Run Node.js, Express, Fastify, or NestJS Dev on HTTPS",
    description:
      "Run a local Node.js server behind a real HTTPS URL without wiring custom TLS code into your app. Bore works well for Express, Fastify, NestJS, and custom Node servers.",
    intro:
      "Many Node.js developers search for HTTPS dev setup when what they really need is a secure public URL for callbacks, cookies, browser APIs, or partner testing. Bore lets the local Node server stay simple on localhost while HTTPS terminates at the Bore edge.",
    updatedAt: "2026-04-14",
    queries: ["how to https node run dev", "https express localhost", "fastify https dev", "nestjs local https"],
    highlights: ["Works with common Node frameworks", "Avoids custom cert files in app code", "Useful for callbacks, webhooks, and secure browser flows"],
    steps: [
      { title: "Start the Node server normally", body: "Run Express, Fastify, NestJS, Hono, or a custom Node server on a local port like 3000." },
      { title: "Expose it with Bore", body: "Bore creates the public HTTPS URL while the local Node process keeps listening on localhost.", code: "bore up 3000" },
      { title: "Use the HTTPS URL in integrations", body: "Point auth callbacks, browser clients, webhook senders, or QA flows at the Bore hostname." },
      { title: "Reserve a child host for a second service if needed", body: "If the API or admin surface should use a second origin, Bore can route a child host to another local port.", code: "bore host add <namespace> api\nbore host set-port <namespace> api 3001" },
    ],
    faq: [
      { question: "Do I need https.createServer for local Node dev?", answer: "Only if the Node process itself must terminate TLS locally. For many development flows, Bore can provide HTTPS without changing the app server code." },
      { question: "Can I use this with Express, Fastify, and NestJS?", answer: "Yes. Bore sits in front of the local server, so it works with the common Node.js web frameworks." },
      { question: "Can the frontend and API use separate HTTPS origins?", answer: "Yes. Bore supports reserved child hosts like api.<namespace>.bore.dk and can route them to a different local port." },
    ],
  },
  {
    slug: "https-nextjs-dev",
    category: "frameworks",
    title: "How to Run Next.js Dev on HTTPS",
    description:
      "Use Next.js locally with a real HTTPS URL for auth flows, secure cookies, preview links, and webhook callbacks. Bore exposes Next.js dev over HTTPS without local certificate setup.",
    intro:
      "Next.js development often needs HTTPS for auth providers, secure cookies, embedded browser features, and remote callbacks. Bore keeps `next dev` local while still giving you a real HTTPS origin for the outside world.",
    updatedAt: "2026-04-14",
    queries: ["how to https nextjs dev", "free https nextjs", "nextjs localhost https"],
    highlights: ["Works with `next dev` on port 3000", "Useful for auth providers and secure cookies", "Stable namespaces reduce callback URL churn"],
    steps: [
      { title: "Start Next.js in development mode", body: "Run your normal Next.js dev server on localhost:3000." },
      { title: "Create the HTTPS tunnel", body: "Expose the running Next.js server with Bore and use the returned HTTPS URL in provider or callback settings.", code: "bore up 3000" },
      { title: "Reuse the same namespace later", body: "Persistent namespaces make auth and preview setups less fragile across restarts." },
      { title: "Reserve an API child host when needed", body: "Keep the Next.js app on the root hostname and route an API child host to another local service.", code: "bore host add <namespace> api\nbore host set-port <namespace> api 3001" },
    ],
    faq: [
      { question: "How do I run Next.js dev on HTTPS?", answer: "The fastest route is to run Next.js normally on localhost and expose it through Bore. That gives you a real HTTPS URL without local certificate management." },
      { question: "Is there a free HTTPS option for Next.js development?", answer: "Yes. Bore can give your local Next.js app a free HTTPS URL for development and testing flows." },
      { question: "Can Bore help when my app and API need separate origins?", answer: "Yes. Bore supports reserved child hosts, so the app can stay on the main namespace and the API can move to a child host with its own HTTPS URL." },
    ],
  },
  {
    slug: "https-vite-local",
    category: "frameworks",
    title: "How to Use Vite on HTTPS Locally",
    description:
      "Test a Vite app over HTTPS without switching your development workflow to custom local certificates. Bore gives your Vite dev server a real HTTPS URL in one step.",
    intro:
      "Vite developers often need HTTPS for service workers, secure browser APIs, mobile testing, or integration callbacks. Bore makes that easier by putting a real HTTPS URL in front of the existing Vite dev server.",
    updatedAt: "2026-04-14",
    queries: ["try vite local on https", "vite localhost https", "vite ssl local dev"],
    highlights: ["Works with Vite's normal local port", "Useful for service worker and browser API testing", "Can expose a separate HTTPS API origin too"],
    steps: [
      { title: "Run the Vite app locally", body: "Keep Vite on its usual development port, commonly 5173." },
      { title: "Expose Vite through Bore", body: "Use Bore to create an HTTPS URL for the Vite app without teaching the app to manage certificates.", code: "bore up 5173" },
      { title: "Use the HTTPS URL for testing", body: "Open the Bore URL on desktop or mobile devices and use it for secure browser feature testing." },
      { title: "Route a child host to a separate backend when needed", body: "Bore can reserve an HTTPS child host for a local API on a different port.", code: "bore host add <namespace> api\nbore host set-port <namespace> api 3001" },
    ],
    faq: [
      { question: "How do I try a Vite app on HTTPS locally?", answer: "Run Vite normally and expose the port with Bore. You get a real HTTPS URL without setting up and trusting local certificates." },
      { question: "Can I use Bore for mobile and browser testing with Vite?", answer: "Yes. Bore gives your Vite server a public HTTPS URL that can be opened from other devices and external integrations." },
      { question: "Can the API use a different HTTPS hostname than the Vite app?", answer: "Yes. Bore supports reserved child hosts so your Vite app and local API can use separate HTTPS origins during development." },
    ],
  },
  {
    slug: "https-react-local",
    category: "frameworks",
    title: "How to Put a React App on HTTPS in Development",
    description:
      "Expose a React development app over HTTPS for secure browser APIs, embedded flows, mobile testing, and auth callbacks without setting up local certificate chains.",
    intro:
      "Not every React app runs through Next.js. If you have a plain React frontend on a local dev server, Bore is a good fit when the real requirement is a secure public URL rather than local TLS termination inside the toolchain.",
    updatedAt: "2026-04-14",
    queries: ["react localhost https", "react dev server https", "react app local ssl"],
    highlights: ["Works with React dev servers on localhost", "Good for browser API and auth testing", "Pairs well with separate local API services"],
    steps: [
      { title: "Run the React app locally", body: "Start the app on its current local port, often 3000 or 5173." },
      { title: "Expose it over HTTPS", body: "Use Bore to give the React app a secure public URL.", code: "bore up 5173" },
      { title: "Use the URL for secure frontend testing", body: "Test secure cookies, embedded flows, service workers, or mobile browser behavior against the HTTPS origin." },
      { title: "Add a child host if the API should stay on another origin", body: "Bore can reserve a child host under the same namespace and point it at the local API." },
    ],
    faq: [
      { question: "How do I make a React app run on HTTPS locally?", answer: "If you need a real secure URL rather than local certificate plumbing, the shortest path is to expose the local React app through Bore." },
      { question: "Is this only for Vite-based React apps?", answer: "No. Bore works with any React development server that is already running on a local port." },
      { question: "Can this help with app and API split setups?", answer: "Yes. Bore can keep the React app on the root hostname and move the API to a child host on another local port." },
    ],
  },
];
