import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, RadioTower } from "lucide-react";
import { redirect } from "next/navigation";

import { NamespaceDashboard } from "@/components/namespace-dashboard";
import { SignOutButton } from "@/components/sign-out-button";
import { getDashboardOverview } from "@/lib/bore-db";
import { getPublicDomain } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage Bore namespaces, tunnels, and account settings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const overview = getDashboardOverview(user.id, getPublicDomain());

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-8 md:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_26%),radial-gradient(circle_at_20%_0%,_rgba(59,130,246,0.12),_transparent_22%),linear-gradient(180deg,_rgba(9,9,11,0.96)_0%,_rgba(9,9,11,1)_100%)]" />
      <div className="relative mx-auto max-w-6xl">
        <header className="mb-8 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900/70 p-6 shadow-[0_30px_100px_-60px_rgba(0,0,0,0.9)] backdrop-blur md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300">
                <RadioTower className="h-4 w-4" />
                Bore Console
              </div>
              <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white md:text-5xl">
                {user.name ? `Hello, ${user.name.split(" ")[0]}.` : "Hello."}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
                Reserved namespaces, live claim state, and per-user host limits
                are all flowing from the shared SQLite store.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to bore.dk
              </Link>
            </div>

            <div className="flex flex-col gap-3 rounded-[1.75rem] border border-zinc-800 bg-zinc-950/80 p-5 text-zinc-50">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                Signed in as
              </p>
              <p className="font-medium">{user.email}</p>
              <p className="text-xs text-zinc-500">User ID: {user.id}</p>
              <div className="mt-auto flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-700 hover:text-white"
                >
                  Marketing site
                </Link>
                <SignOutButton />
              </div>
            </div>
          </div>
        </header>

        <NamespaceDashboard initialOverview={overview} />
      </div>
    </main>
  );
}
