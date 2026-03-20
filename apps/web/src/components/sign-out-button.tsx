"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useTransition } from "react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await authClient.signOut();
          router.refresh();
        });
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-100 transition hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-70",
        className,
      )}
    >
      {isPending ? "Signing out..." : "Sign out"}
      {isPending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowRight className="h-4 w-4" />
      )}
    </button>
  );
}
