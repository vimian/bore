import type { Metadata } from "next";
import Link from "next/link";

import { GUIDES } from "@/lib/guide-content";
import { getSiteOrigin } from "@/lib/env";

const pageTitle = "Local HTTPS Guides for Node, Next.js, Vite, and Localhost";
const pageDescription =
  "Bore guides for putting localhost on HTTPS, running Next.js and Node.js dev over HTTPS, testing Vite with HTTPS, and using HTTPS child subdomains in local development.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: "/guides",
  },
  keywords: [
    "https local website",
    "how to add ssl to local dev",
    "how to https nextjs dev",
    "free https nextjs",
    "how to https node run dev",
    "try vite local on https",
    "https child subdomain localhost",
  ],
  openGraph: {
    title: `Bore | ${pageTitle}`,
    description: pageDescription,
    url: `${getSiteOrigin()}/guides`,
  },
  twitter: {
    title: `Bore | ${pageTitle}`,
    description: pageDescription,
  },
};

export default function GuidesIndexPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <nav className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/" className="transition hover:text-white">
            Bore
          </Link>
          <span>/</span>
          <span>Guides</span>
        </nav>

        <header className="mt-8 max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            HTTPS Development Guides
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-white sm:text-6xl">
            Answers for the HTTPS local development searches developers actually use
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-300">{pageDescription}</p>
          <p className="mt-5 text-base leading-7 text-zinc-400">
            These pages are written around common searches such as `https local website`, `how to
            https nextjs dev`, `how to https node run dev`, `try vite local on https`, and the
            Bore-specific child-host HTTPS workflow.
          </p>
        </header>

        <section className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/50 p-6 transition hover:border-zinc-700 hover:bg-zinc-900/80"
            >
              <h2 className="text-2xl font-semibold text-white">{guide.title}</h2>
              <p className="mt-4 text-sm leading-7 text-zinc-400">{guide.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {guide.queries.map((query) => (
                  <span
                    key={query}
                    className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300"
                  >
                    {query}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
