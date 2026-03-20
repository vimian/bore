"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

const RESET_DELAY_MS = 2000;

type InstallCommandCopyProps = {
  command: string;
};

export function InstallCommandCopy({ command }: InstallCommandCopyProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, RESET_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-zinc-400 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 font-medium text-zinc-300 transition-all duration-300 hover:border-zinc-600 hover:text-white"
        aria-label={copied ? "Install command copied" : "Copy install command"}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
