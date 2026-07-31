import { CalendarClock } from "lucide-react";

import { DocText } from "@/components/docs/doc-text";
import type { Comparison } from "@/lib/docs";

export function DocComparison({ comparison }: { comparison: Comparison }) {
  return (
    <section id="comparison" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.27em] text-cyan-300">
            Capability matrix
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white sm:text-4xl">
            Bore and {comparison.alternativeName}, side by side
          </h2>
        </div>
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <CalendarClock className="h-4 w-4" />
          Claims checked {comparison.checkedAt}
        </p>
      </div>

      <div className="mt-8 overflow-x-auto rounded-[1.5rem] border border-zinc-800">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-[0.2em] text-zinc-500">
            <tr>
              <th className="w-1/5 px-5 py-4 font-medium">Capability</th>
              <th className="w-2/5 border-l border-zinc-800 px-5 py-4 font-medium text-cyan-300">
                Bore
              </th>
              <th className="w-2/5 border-l border-zinc-800 px-5 py-4 font-medium">
                {comparison.alternativeName}
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.capability} className="border-t border-zinc-800 align-top">
                <th className="bg-zinc-900/35 px-5 py-5 text-sm font-semibold text-white">
                  {row.capability}
                </th>
                <td className="border-l border-zinc-800 px-5 py-5 text-sm leading-6 text-zinc-300">
                  <DocText>{row.bore}</DocText>
                </td>
                <td className="border-l border-zinc-800 px-5 py-5 text-sm leading-6 text-zinc-400">
                  <DocText>{row.alternative}</DocText>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
