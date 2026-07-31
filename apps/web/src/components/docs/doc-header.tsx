import { ArrowUpRight, Clock3 } from "lucide-react";
import Link from "next/link";

import { DocText } from "@/components/docs/doc-text";
import type { SeoDoc } from "@/lib/docs";

const DOC_LINKS = [
  { label: "Next.js", href: "/docs/nextjs-localhost" },
  { label: "Webhooks", href: "/docs/webhook-testing" },
  { label: "Bore vs ngrok", href: "/docs/vs-ngrok" },
];

export function DocHeader({ doc }: { doc: SeoDoc }) {
  return (
    <>
      <header className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[0.34em] text-white"
          >
            BORE
          </Link>
          <nav
            aria-label="Documentation"
            className="flex items-center gap-5 overflow-x-auto text-sm text-zinc-400"
          >
            {DOC_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={doc.slug === link.href.split("/").at(-1) ? "page" : undefined}
                className="whitespace-nowrap hover:text-white aria-[current=page]:text-cyan-300"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-100 sm:inline-flex"
          >
            Start tunneling
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-zinc-800">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,_rgba(34,211,238,0.16),_transparent_27%),linear-gradient(120deg,_transparent_40%,_rgba(255,255,255,0.035)_40%,_rgba(255,255,255,0.035)_41%,_transparent_41%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1fr_20rem] lg:py-24">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
              <span>{doc.eyebrow}</span>
              <span className="h-px w-7 bg-cyan-500/60" />
              <span className="flex items-center gap-2 text-zinc-500">
                <Clock3 className="h-3.5 w-3.5" />
                {doc.readTime}
              </span>
            </div>
            <h1 className="mt-6 max-w-5xl font-[family-name:var(--font-display)] text-4xl leading-[1.06] tracking-tight text-white sm:text-6xl">
              {doc.title}
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-300">
              <DocText>{doc.intro}</DocText>
            </p>
            <p className="mt-5 text-sm text-zinc-500">
              Updated {doc.updatedAt} · Written by the Bore team
            </p>
          </div>

          <aside className="self-end border-l border-cyan-500/30 pl-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              What you will leave with
            </p>
            <ol className="mt-5 space-y-4">
              {doc.outcomes.map((outcome, index) => (
                <li key={outcome} className="flex gap-3 text-sm leading-6 text-zinc-300">
                  <span className="font-mono text-cyan-400">0{index + 1}</span>
                  {outcome}
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
    </>
  );
}
