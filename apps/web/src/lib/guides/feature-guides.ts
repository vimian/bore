import type { Guide } from "@/lib/guides/types";

export const FEATURE_GUIDES: Guide[] = [
  {
    slug: "localhost-like-loopback-hostnames",
    category: "features",
    title: "Loopback Hostnames for Local Development on Bore",
    description:
      "Use short Bore hostnames that resolve to 127.0.0.1 for local development, including l.bore.dk, local.bore.dk, localhost.bore.dk, and child hosts under each of them.",
    intro:
      "Sometimes you do not need a public HTTPS tunnel at all. You just need a repeatable hostname that behaves like localhost while still letting you test cookies, host-based routing, callbacks, and subdomain logic on your own machine. Bore now supports loopback hostnames like `l.bore.dk`, `local.bore.dk`, and `localhost.bore.dk`, plus child hosts under each one.",
    updatedAt: "2026-04-16",
    queries: [
      "l.bore.dk",
      "local.bore.dk",
      "localhost.bore.dk",
      "127.0.0.1 custom domain",
      "localhost subdomains for local development",
      "wildcard localhost domain",
    ],
    highlights: [
      "Maps Bore hostnames to 127.0.0.1 for local-only development",
      "Supports child hosts like api.l.bore.dk and auth.local.bore.dk",
      "Useful for cookie, callback, and host-based routing tests without public exposure",
    ],
    steps: [
      {
        title: "Keep your local app on its normal port",
        body: "Run the local website or API on the same port you already use, such as 3000, 5173, 8080, or 8787.",
      },
      {
        title: "Open the Bore loopback hostname on that port",
        body: "Use any of the Bore loopback hostnames directly in the browser, including `l.bore.dk`, `local.bore.dk`, or `localhost.bore.dk`.",
        code: "http://l.bore.dk:3000\nhttp://local.bore.dk:5173\nhttp://localhost.bore.dk:8080",
      },
      {
        title: "Use child hosts when one hostname is not enough",
        body: "Host-based routing and multi-origin local setups can use child hosts under the same loopback namespace.",
        code: "http://api.l.bore.dk:3001\nhttp://auth.local.bore.dk:3000\nhttp://admin.localhost.bore.dk:4173",
      },
      {
        title: "Use Bore tunnels only when you need outside access",
        body: "The loopback hostnames are for local-only access on your own machine. Switch to `bore up` when a phone, teammate, webhook sender, or OAuth provider needs to reach the service from outside your computer.",
      },
    ],
    faq: [
      {
        question: "What do l.bore.dk, local.bore.dk, and localhost.bore.dk do?",
        answer: "They give you Bore-managed hostnames that resolve to 127.0.0.1 for local development. That means your browser can use a named host instead of plain localhost or a raw loopback IP.",
      },
      {
        question: "Can I use subdomains like api.l.bore.dk or app.local.bore.dk?",
        answer: "Yes. Bore supports child hosts under these loopback names, so you can test host-based routing and split local origins on your own machine.",
      },
      {
        question: "Are these hostnames public?",
        answer: "No. They are meant to point back to your own local machine at 127.0.0.1, so they are useful for local-only browser and development workflows rather than public sharing.",
      },
    ],
  },
  {
    slug: "split-frontend-api-origins",
    category: "features",
    title: "How to Split Frontend and API Origins in Local HTTPS Development",
    description:
      "Keep the frontend and API on separate HTTPS origins in local development so you can test CORS, cookies, auth rules, and realistic host-based behavior.",
    intro:
      "One public hostname is not always enough. Many teams need the frontend and API on separate origins during development because production behaves that way. Bore supports that split without requiring a locally maintained reverse-proxy setup.",
    updatedAt: "2026-04-14",
    queries: ["frontend api separate origin local dev", "local https app and api subdomains", "local dev cors https origins"],
    highlights: ["Closer to real production topology", "Useful for CORS and auth testing", "Works with child hosts under one reserved namespace"],
    steps: [
      { title: "Expose the frontend namespace", body: "Start the main app locally and create its HTTPS URL with Bore.", code: "bore up 3000" },
      { title: "Reserve a child host for the API", body: "Add a child host under the same namespace for the backend service.", code: "bore host add <namespace> api" },
      { title: "Point the child host at the API port", body: "Route the child host to the API's local port.", code: "bore host set-port <namespace> api 3001" },
      { title: "Use the split origins in development", body: "Keep the frontend on the root hostname and the API on the child host while testing real origin boundaries." },
    ],
    faq: [
      { question: "Why split frontend and API origins locally?", answer: "Because some CORS, cookie, and auth behaviors only show up when the app and API are actually on separate origins, just like production." },
      { question: "Can Bore keep both origins under one namespace?", answer: "Yes. Bore can keep the app on the root hostname and reserve a child host such as api.<namespace>.bore.dk for the API." },
      { question: "Is this better than hand-rolled local proxy config?", answer: "For many teams, yes. Bore keeps the local services simple and moves the public HTTPS routing to a reusable, persistent tunnel setup." },
    ],
  },
  {
    slug: "child-subdomain-https",
    category: "features",
    title: "HTTPS for Child Subdomains in Local Development",
    description:
      "Bore lets you expose a local app on one HTTPS hostname and a second local service on a reserved child host like api.bo.bore.dk. That makes app and API origin splits much easier in development.",
    intro:
      "This is the Bore feature that matters when one public URL is not enough. If your namespace is `bo.bore.dk`, Bore can also reserve `api.bo.bore.dk` and keep HTTPS on that child host while routing it to a different local port.",
    updatedAt: "2026-04-14",
    queries: ["https custom subdomain tunnel", "ssl child subdomain localhost", "api subdomain https local dev"],
    highlights: ["Keep app and API on separate HTTPS origins", "Reserve child hosts under the same namespace", "Route each child host to its own local port"],
    steps: [
      { title: "Create the main tunnel", body: "Start your main app on localhost and expose it with Bore.", code: "bore up 3000" },
      { title: "Reserve the child host", body: "If your namespace is `bo`, reserve `api.bo.bore.dk` with the host add command.", code: "bore host add bo api" },
      { title: "Route the child host to a different port", body: "Point the child host at a backend, API server, or another local service.", code: "bore host set-port bo api 3001" },
      { title: "Use the split HTTPS origins in development", body: "Keep the frontend on `https://bo.bore.dk` and the API on `https://api.bo.bore.dk` without local certificate gymnastics." },
    ],
    faq: [
      { question: "What makes Bore different from other dev tunnels?", answer: "Bore can reserve HTTPS child hosts under your namespace and route them independently. That is useful when the main app and API need different origins during development." },
      { question: "Can I add HTTPS to api.bo.bore.dk in Bore?", answer: "Yes. After the namespace is reserved, Bore can reserve child hosts such as api.bo.bore.dk and route them to a chosen local port." },
      { question: "Why is child-host HTTPS useful in development?", answer: "It helps when your app depends on separate frontend and API origins, domain-based auth rules, or multi-service local environments that need realistic hostnames." },
    ],
  },
];
