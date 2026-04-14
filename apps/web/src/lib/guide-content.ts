export type GuideStep = {
  title: string;
  body: string;
  code?: string;
};

export type GuideFaq = {
  question: string;
  answer: string;
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  queries: string[];
  highlights: string[];
  steps: GuideStep[];
  faq: GuideFaq[];
};

export const GUIDES: Guide[] = [
  {
    slug: "https-local-website",
    title: "How to Put a Local Website on HTTPS",
    description:
      "Expose a local website over HTTPS without managing local certificates. Bore gives localhost a real HTTPS URL for browser testing, callbacks, and webhook flows.",
    intro:
      "If you need HTTPS for a local website, the shortest path is usually a tunnel with real TLS in front of your app. Bore gives your localhost server a public HTTPS URL, keeps the setup simple, and lets you keep using your normal dev server on localhost.",
    queries: ["https local website", "how to add ssl to local dev", "localhost https"],
    highlights: [
      "Real HTTPS URL for localhost",
      "No local certificate authority setup",
      "Useful for browser APIs, callbacks, and webhooks",
    ],
    steps: [
      {
        title: "Install the Bore CLI",
        body: "Install Bore once on your machine and keep using your existing dev workflow.",
        code: "curl -sL https://bore.dk/install.sh | bash",
      },
      {
        title: "Run your local site as usual",
        body: "Keep your app on its normal local port, such as 3000, 4173, or 8080.",
      },
      {
        title: "Expose the local port over HTTPS",
        body: "Start a tunnel and Bore will assign a public HTTPS URL to your local website.",
        code: "bore up 3000",
      },
      {
        title: "Reuse the same namespace later",
        body: "Bore keeps namespace ownership persistent, so you can reconnect to a stable public hostname instead of changing callback URLs all the time.",
      },
    ],
    faq: [
      {
        question: "How do I add SSL to local dev?",
        answer:
          "The simplest approach is to put a real HTTPS endpoint in front of your local app. Bore does that without forcing you to generate and trust local certificates on every machine.",
      },
      {
        question: "Can I make a local website HTTPS for free?",
        answer:
          "Yes. Bore can give a local website a free HTTPS URL so you can test secure flows during development.",
      },
      {
        question: "When should I use local certificates instead?",
        answer:
          "Use local certificates when the process itself must bind HTTPS directly on localhost. Use Bore when the main goal is secure public access to your dev server.",
      },
    ],
  },
  {
    slug: "https-node-run-dev",
    title: "How to Run a Node.js Dev Server on HTTPS",
    description:
      "Run a Node.js development server behind a real HTTPS URL without wiring custom TLS code into your app. Bore exposes your local Node server over HTTPS in one command.",
    intro:
      "Developers often search for a way to run Node.js dev over HTTPS when they really need secure callbacks, secure cookies, or a public URL for testing. Bore lets your local Node server stay simple on localhost while HTTPS terminates at the Bore edge.",
    queries: ["how to https node run dev", "node dev https", "ssl node localhost"],
    highlights: [
      "Works with plain local Node servers",
      "Avoids custom cert files in app code",
      "Better fit for callback and webhook testing",
    ],
    steps: [
      {
        title: "Start your Node.js app normally",
        body: "Run Express, Fastify, Hono, or a custom Node server on a local port like 3000.",
      },
      {
        title: "Expose the app with Bore",
        body: "Bore creates the public HTTPS URL while your Node app keeps listening on localhost.",
        code: "bore up 3000",
      },
      {
        title: "Point external integrations to the HTTPS URL",
        body: "Use the Bore URL for OAuth callbacks, mobile testing, webhooks, and secure browser flows.",
      },
      {
        title: "Add a child host if your API needs a separate origin",
        body: "Bore can reserve an HTTPS child host like api.<namespace>.bore.dk and route it to another local port.",
        code: "bore host add <namespace> api\nbore host set-port <namespace> api 3001",
      },
    ],
    faq: [
      {
        question: "How do I HTTPS a Node.js run dev setup?",
        answer:
          "If you mainly need a secure public URL, keep the Node server on localhost and expose it with Bore. That is much simpler than maintaining local TLS certificates in development.",
      },
      {
        question: "Do I need https.createServer for dev?",
        answer:
          "Only if the Node process itself must terminate TLS locally. For most development cases, Bore can provide HTTPS without changing your app server code.",
      },
      {
        question: "Can I split app and API onto separate HTTPS subdomains?",
        answer:
          "Yes. Bore lets you keep the main namespace on one port and assign a reserved child host such as api.<namespace>.bore.dk to another local port.",
      },
    ],
  },
  {
    slug: "https-nextjs-dev",
    title: "How to Run Next.js Dev on HTTPS",
    description:
      "Use Next.js locally with a real HTTPS URL for auth flows, secure cookies, preview links, and webhook callbacks. Bore exposes Next.js dev over HTTPS without local certificate setup.",
    intro:
      "Next.js development often needs HTTPS for auth providers, secure cookies, embedded browser features, and remote callbacks. Bore is a practical way to keep `next dev` local while still getting a real HTTPS origin.",
    queries: ["how to https nextjs dev", "free https nextjs", "nextjs localhost https"],
    highlights: [
      "Works with `next dev` on port 3000",
      "Useful for auth providers and secure cookies",
      "Stable namespaces reduce callback URL churn",
    ],
    steps: [
      {
        title: "Start Next.js in development mode",
        body: "Run your normal Next.js dev server on localhost:3000.",
      },
      {
        title: "Create the HTTPS tunnel",
        body: "Expose the running Next.js server with Bore and use the returned HTTPS URL in your provider or callback settings.",
        code: "bore up 3000",
      },
      {
        title: "Reuse the same namespace for future sessions",
        body: "Bore keeps reserved namespaces so your callback URLs do not need to change every time you restart development.",
      },
      {
        title: "Reserve an API child host when your app needs it",
        body: "You can keep the Next.js app on the root hostname and route an HTTPS child host like api.<namespace>.bore.dk to a different local service.",
        code: "bore host add <namespace> api\nbore host set-port <namespace> api 3001",
      },
    ],
    faq: [
      {
        question: "How do I run Next.js dev on HTTPS?",
        answer:
          "The fastest route is to run Next.js normally on localhost and expose it through Bore. That gives you a real HTTPS URL without local certificate management.",
      },
      {
        question: "Is there a free HTTPS option for Next.js development?",
        answer:
          "Yes. Bore can give your local Next.js app a free HTTPS URL for development and testing flows.",
      },
      {
        question: "Can Bore help when my app and API need separate origins?",
        answer:
          "Yes. Bore supports reserved child hosts, so the app can stay on the main namespace and the API can move to a child host with its own HTTPS URL.",
      },
    ],
  },
  {
    slug: "https-vite-local",
    title: "How to Use Vite on HTTPS Locally",
    description:
      "Test a Vite app over HTTPS without switching your development workflow to custom local certificates. Bore gives your Vite dev server a real HTTPS URL in one step.",
    intro:
      "Vite developers often need HTTPS for service workers, secure browser APIs, mobile testing, or integration callbacks. Bore makes that easier by putting a real HTTPS URL in front of your existing Vite dev server.",
    queries: ["try vite local on https", "vite localhost https", "vite ssl local dev"],
    highlights: [
      "Works with Vite's normal local port",
      "Useful for service worker and browser API testing",
      "Can expose a separate HTTPS API origin too",
    ],
    steps: [
      {
        title: "Run the Vite app locally",
        body: "Keep Vite on its usual development port, commonly 5173.",
      },
      {
        title: "Expose Vite through Bore",
        body: "Use Bore to create an HTTPS URL for the Vite app without changing the app to manage certificates.",
        code: "bore up 5173",
      },
      {
        title: "Use the HTTPS URL for testing",
        body: "Open the Bore URL on desktop or mobile devices and use it for secure browser feature testing.",
      },
      {
        title: "Route a child host to a separate backend when needed",
        body: "Bore can reserve an HTTPS child host for a local API on a different port.",
        code: "bore host add <namespace> api\nbore host set-port <namespace> api 3001",
      },
    ],
    faq: [
      {
        question: "How do I try a Vite app on HTTPS locally?",
        answer:
          "Run Vite normally and expose the port with Bore. You get a real HTTPS URL without setting up and trusting local certificates.",
      },
      {
        question: "Can I use Bore for mobile and browser testing with Vite?",
        answer:
          "Yes. Bore gives your Vite server a public HTTPS URL that can be opened from other devices and external integrations.",
      },
      {
        question: "Can the API use a different HTTPS hostname than the Vite app?",
        answer:
          "Yes. Bore supports reserved child hosts so your Vite app and local API can use separate HTTPS origins during development.",
      },
    ],
  },
  {
    slug: "child-subdomain-https",
    title: "HTTPS for Child Subdomains in Local Development",
    description:
      "Bore lets you expose a local app on one HTTPS hostname and a second local service on a reserved child host like api.bo.bore.dk. That makes app and API origin splits much easier in development.",
    intro:
      "This is the Bore feature that matters when one public URL is not enough. If your namespace is `bo.bore.dk`, Bore can also reserve `api.bo.bore.dk` and keep HTTPS on that child host while routing it to a different local port.",
    queries: [
      "https custom subdomain tunnel",
      "ssl child subdomain localhost",
      "api subdomain https local dev",
    ],
    highlights: [
      "Keep app and API on separate HTTPS origins",
      "Reserve child hosts under the same namespace",
      "Route each child host to its own local port",
    ],
    steps: [
      {
        title: "Create the main tunnel",
        body: "Start your main app on localhost and expose it with Bore.",
        code: "bore up 3000",
      },
      {
        title: "Reserve the child host under your namespace",
        body: "If your namespace is `bo`, reserve `api.bo.bore.dk` with the host add command.",
        code: "bore host add bo api",
      },
      {
        title: "Route the child host to a different local port",
        body: "Point the child host at a backend, API server, or another local service.",
        code: "bore host set-port bo api 3001",
      },
      {
        title: "Use the split HTTPS origins in development",
        body: "Keep the frontend on `https://bo.bore.dk` and the API on `https://api.bo.bore.dk` without managing separate local certificates or extra proxy layers.",
      },
    ],
    faq: [
      {
        question: "What makes Bore different from other dev tunnels?",
        answer:
          "Bore can reserve HTTPS child hosts under your namespace and route them independently. That is useful when the main app and API need different origins during development.",
      },
      {
        question: "Can I add HTTPS to api.bo.bore.dk in Bore?",
        answer:
          "Yes. After the namespace is reserved, Bore can reserve child hosts such as api.bo.bore.dk and route them to a chosen local port.",
      },
      {
        question: "Why is child-host HTTPS useful in development?",
        answer:
          "It helps when your app depends on separate frontend and API origins, domain-based auth rules, or multi-service local environments that need realistic hostnames.",
      },
    ],
  },
];

export function getGuide(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug);
}
