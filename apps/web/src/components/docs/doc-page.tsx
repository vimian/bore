import { DocComparison } from "@/components/docs/doc-comparison";
import { DocCta, DocFaq, DocLinks } from "@/components/docs/doc-footer";
import { DocHeader } from "@/components/docs/doc-header";
import { ContentSections, StepList } from "@/components/docs/doc-sections";
import type { SeoDoc } from "@/lib/docs";

export function DocPage({ doc }: { doc: SeoDoc }) {
  const contents = [
    ...(doc.steps ? [{ id: "setup", title: "Step by step" }] : []),
    ...(doc.comparison ? [{ id: "comparison", title: "Capability matrix" }] : []),
    ...doc.sections.map((section) => ({ id: section.id, title: section.title })),
    { id: "faq", title: "FAQ" },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <DocHeader doc={doc} />
      <div className="mx-auto grid max-w-7xl gap-14 px-6 py-14 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-20">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-600">
              On this page
            </p>
            <ol className="mt-5 space-y-4 border-l border-zinc-800 pl-4">
              {contents.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-sm leading-5 text-zinc-500 hover:text-cyan-200"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0 max-w-4xl space-y-20">
          {doc.steps ? <StepList steps={doc.steps} /> : null}
          {doc.comparison ? <DocComparison comparison={doc.comparison} /> : null}
          <ContentSections sections={doc.sections} />
          <DocFaq items={doc.faq} />
          <DocLinks doc={doc} />
          <DocCta cta={doc.cta} />
        </article>
      </div>
    </main>
  );
}
