import Link from "next/link";

import type { Guide } from "@/lib/guide-content";

const INSTALL_COMMAND = "curl -sL https://bore.dk/install.sh | bash";

type GuidePageProps = {
  guide: Guide;
  relatedGuides: Guide[];
};

export function GuidePage({ guide, relatedGuides }: GuidePageProps) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <nav className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/" className="transition hover:text-white">
            Bore
          </Link>
          <span>/</span>
          <Link href="/guides" className="transition hover:text-white">
            Guides
          </Link>
        </nav>

        <header className="mt-8 rounded-[2rem] border border-zinc-800 bg-zinc-900/60 p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Developer Guide
          </p>
          <h1 className="mt-4 max-w-4xl font-[family-name:var(--font-display)] text-4xl leading-tight text-white sm:text-5xl">
            {guide.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-300">
            {guide.description}
          </p>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-400">{guide.intro}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {guide.queries.map((query) => (
              <span
                key={query}
                className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300"
              >
                {query}
              </span>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Install Bore</p>
            <pre className="mt-3 overflow-x-auto text-sm text-zinc-200">
              <code>{INSTALL_COMMAND}</code>
            </pre>
          </div>
        </header>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {guide.highlights.map((highlight) => (
            <article
              key={highlight}
              className="rounded-[1.5rem] border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <p className="text-sm leading-7 text-zinc-300">{highlight}</p>
            </article>
          ))}
        </section>

        <section className="mt-12">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
              How It Works
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
              Simple local workflow, real HTTPS externally
            </h2>
          </div>

          <div className="space-y-4">
            {guide.steps.map((step, index) => (
              <article
                key={step.title}
                className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  Step {index + 1}
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-white">{step.title}</h3>
                <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-400">{step.body}</p>
                {step.code ? (
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-200">
                    <code>{step.code}</code>
                  </pre>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-[2rem] border border-cyan-500/20 bg-cyan-500/5 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Where Bore Differs
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
            Bore can keep HTTPS on reserved child hosts too
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300">
            Most tunnel workflows stop at one public hostname. Bore can keep your main app on one
            HTTPS namespace and reserve a child host like `api.&lt;namespace&gt;.bore.dk` for a
            second local service.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-2xl border border-cyan-500/20 bg-zinc-950/90 p-4 text-sm text-zinc-200">
            <code>{"bore host add <namespace> api\nbore host set-port <namespace> api 3001"}</code>
          </pre>
          <p className="mt-4 text-sm leading-7 text-zinc-400">
            That makes Bore a stronger fit when frontend and API origins need to stay separate in
            local development.
          </p>
        </section>

        <section className="mt-12">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">FAQ</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
              Common questions
            </h2>
          </div>

          <div className="space-y-4">
            {guide.faq.map((item) => (
              <article
                key={item.question}
                className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="text-xl font-semibold text-white">{item.question}</h3>
                <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-400">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
                Related Guides
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
                More HTTPS development guides
              </h2>
            </div>
            <Link href="/guides" className="text-sm text-cyan-300 transition hover:text-cyan-200">
              View all guides
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {relatedGuides.map((item) => (
              <Link
                key={item.slug}
                href={`/guides/${item.slug}`}
                className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/40 p-6 transition hover:border-zinc-700 hover:bg-zinc-900/70"
              >
                <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-zinc-400">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
