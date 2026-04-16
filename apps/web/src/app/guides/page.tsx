import type { Metadata } from "next";
import Link from "next/link";

import { GUIDE_GROUPS, getGuidesByCategory } from "@/lib/guide-content";
import { getSiteOrigin } from "@/lib/env";

const pageTitle = "Local HTTPS Guides for Frameworks, APIs, Localhost, and Loopback Hostnames";
const pageDescription =
  "Bore guides for local HTTPS development across frameworks and workflows, including localhost SSL, local APIs, loopback hostnames like l.bore.dk and local.bore.dk, webhooks, OAuth callbacks, secure cookies, mobile testing, and child subdomains.";

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
    "react localhost https",
    "webhook localhost https",
    "oauth callback localhost https",
    "secure cookies local dev",
    "local api https",
    "https child subdomain localhost",
    "l.bore.dk",
    "local.bore.dk",
    "localhost.bore.dk",
    "localhost subdomains",
    "127.0.0.1 custom domain",
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
            These pages are built around real developer tasks, not just framework names. The
            library now covers local websites, local APIs, React, Next.js, Vite, Node.js, webhook
            testing, OAuth callbacks, secure cookies, mobile-device testing, Bore's child-host
            HTTPS routing, and Bore loopback hostnames for 127.0.0.1 development.
          </p>
        </header>

        <div className="mt-12 space-y-12">
          {GUIDE_GROUPS.map((group) => {
            const guides = getGuidesByCategory(group.category);

            return (
              <section key={group.category}>
                <div className="mb-6 max-w-3xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
                    {group.title}
                  </p>
                  <p className="mt-3 text-base leading-7 text-zinc-400">{group.description}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {guides.map((guide) => (
                    <Link
                      key={guide.slug}
                      href={`/guides/${guide.slug}`}
                      className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/50 p-6 transition hover:border-zinc-700 hover:bg-zinc-900/80"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                        Updated {guide.updatedAt}
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-white">{guide.title}</h2>
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
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
