import { AlertCircle, Check, TerminalSquare } from "lucide-react";

import { DocText } from "@/components/docs/doc-text";
import type { DocSection, DocStep } from "@/lib/docs";

export function StepList({ steps }: { steps: DocStep[] }) {
  return (
    <section id="setup" className="scroll-mt-24">
      <SectionLabel>Step by step</SectionLabel>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white sm:text-4xl">
        From localhost to public HTTPS
      </h2>
      <div className="mt-8 space-y-4">
        {steps.map((step, index) => (
          <article
            key={step.title}
            className="grid gap-5 rounded-[1.5rem] border border-zinc-800 bg-zinc-900/45 p-6 sm:grid-cols-[3rem_1fr]"
          >
            <span className="font-mono text-lg text-cyan-300">0{index + 1}</span>
            <div>
              <h3 className="text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-3 leading-7 text-zinc-400">
                <DocText>{step.text}</DocText>
              </p>
              {step.code ? <CodeBlock label="Terminal" value={step.code} /> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ContentSections({ sections }: { sections: DocSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          {section.eyebrow ? <SectionLabel>{section.eyebrow}</SectionLabel> : null}
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-white sm:text-4xl">
            {section.title}
          </h2>
          <div className="mt-5 space-y-4 text-base leading-8 text-zinc-400">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>
                <DocText>{paragraph}</DocText>
              </p>
            ))}
          </div>
          {section.bullets ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {section.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/35 p-4 text-sm leading-6 text-zinc-300"
                >
                  <Check className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                  <span>
                    <DocText>{bullet}</DocText>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {section.code?.map((code) => (
            <CodeBlock key={code.label} label={code.label} value={code.value} />
          ))}
          {section.callout ? (
            <div className="mt-6 flex gap-3 border-l-2 border-amber-300 bg-amber-300/5 px-5 py-4 text-sm leading-6 text-amber-100/80">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>
                <DocText>{section.callout}</DocText>
              </p>
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.27em] text-cyan-300">
      {children}
    </p>
  );
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
        <TerminalSquare className="h-4 w-4" />
        {label}
      </div>
      <pre className="overflow-x-auto p-5 text-sm leading-7 text-zinc-200">
        <code>{value}</code>
      </pre>
    </div>
  );
}
