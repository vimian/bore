import type { ReactNode } from "react";

export function DocText({ children }: { children: string }) {
  const parts = children.split(/(`[^`]+`)/g);

  return parts.map((part, index): ReactNode => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}
