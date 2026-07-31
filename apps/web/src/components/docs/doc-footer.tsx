import { ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import Link from "next/link";

import { DocText } from "@/components/docs/doc-text";
import type { SeoDoc } from "@/lib/docs";

export function DocFaq({ items }: { items: SeoDoc["faq"] }) {
  return (
    <section id="faq" className="scroll-mt-24">
      <p className="text-xs font-semibold uppercase tracking-[0.27em] text-cyan-300">
        Common questions
      </p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white sm:text-4xl">
        Before you expose a port
      </h2>
      <div className="mt-8 divide-y divide-zinc-800 border-y border-zinc-800">
        {items.map((item) => (
          <article key={item.question} className="grid gap-3 py-6 sm:grid-cols-[15rem_1fr]">
            <h3 className="font-semibold leading-6 text-white">{item.question}</h3>
            <p className="leading-7 text-zinc-400">
              <DocText>{item.answer}</DocText>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DocLinks({ doc }: { doc: SeoDoc }) {
  return (
    <section className="grid gap-8 border-t border-zinc-800 pt-10 sm:grid-cols-2">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <BookOpen className="h-4 w-4 text-cyan-300" />
          Sources and further reading
        </h2>
        <ul className="mt-4 space-y-3">
          {doc.resources.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-cyan-200"
              >
                {link.label}
                {link.external ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-white">Continue reading</h2>
        <ul className="mt-4 space-y-3">
          {doc.related.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-cyan-200"
              >
                {link.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function DocCta({ cta }: { cta: SeoDoc["cta"] }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-cyan-400/[0.06] p-8 sm:p-10">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-cyan-300/20" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.27em] text-cyan-300">
          Run it locally
        </p>
        <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-3xl text-white sm:text-4xl">
          {cta.title}
        </h2>
        <p className="mt-4 max-w-2xl leading-7 text-zinc-300">{cta.body}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={cta.primary.href}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-cyan-100"
          >
            {cta.primary.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={cta.secondary.href}
            className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white"
          >
            {cta.secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
