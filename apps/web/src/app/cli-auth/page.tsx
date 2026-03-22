import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LaptopMinimal, RadioTower } from "lucide-react";

import { completeCliAuth } from "@/app/cli-auth/actions";
import { AuthPanel } from "@/components/auth-panel";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "CLI Authentication",
  description: "Approve Bore CLI login requests in the browser.",
  robots: {
    index: false,
    follow: false,
  },
};

type PageProps = {
  searchParams: Promise<{
    request?: string;
  }>;
};

export default async function CliAuthPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestId = params.request;

  if (!requestId) {
    return (
      <main className="relative min-h-screen overflow-hidden px-6 py-10 md:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_24%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.14),_transparent_18%),linear-gradient(180deg,_rgba(9,9,11,0.98)_0%,_rgba(9,9,11,1)_100%)]" />
        <div className="relative mx-auto max-w-3xl rounded-[2rem] border border-rose-900/50 bg-rose-950/40 p-6 text-rose-100 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.7)] backdrop-blur">
          <h1 className="font-[family-name:var(--font-display)] text-3xl">
            Missing CLI auth request
          </h1>
          <p className="mt-3 text-sm leading-6 text-rose-100/80">
            Start the login flow from <code>bore login</code> so the browser has
            a request to approve.
          </p>
        </div>
      </main>
    );
  }

  const user = await getCurrentUser();

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-10 md:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_24%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.14),_transparent_18%),linear-gradient(180deg,_rgba(9,9,11,0.98)_0%,_rgba(9,9,11,1)_100%)]" />
      <div className="relative mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2.5rem] border border-zinc-800 bg-zinc-900/70 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.9)] backdrop-blur md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300">
            <RadioTower className="h-4 w-4" />
            Bore CLI
          </div>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-5xl leading-[0.95] text-white">
            {user
              ? "Approve this terminal session."
              : "Sign in to approve this terminal session."}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
            Bore will hand the terminal a scoped control-plane session after you
            approve this request in the browser.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-white"
          >
            Back to bore.dk
          </Link>

          {user ? (
            <div className="mt-8 rounded-[2rem] border border-zinc-800 bg-zinc-950 p-5 text-zinc-50">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                Signed in as
              </p>
              <p className="mt-3 text-lg font-medium">{user.email}</p>
              <p className="mt-1 text-xs text-zinc-500">User ID: {user.id}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <form action={completeCliAuth}>
                  <input type="hidden" name="requestId" value={requestId} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
                  >
                    Continue to Bore CLI
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
                <SignOutButton />
              </div>
            </div>
          ) : (
            <div className="mt-8 flex items-start gap-4 rounded-[2rem] border border-zinc-800 bg-zinc-950/80 p-5">
              <LaptopMinimal className="mt-1 h-5 w-5 text-zinc-300" />
              <div>
                <p className="font-medium text-white">This request is ready</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Sign in or create an account on the right, then approve the
                  terminal session from this page.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="relative">
          <div className="absolute -left-10 top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -right-8 bottom-8 h-28 w-28 rounded-full bg-sky-500/15 blur-2xl" />
          {user ? (
            <div className="relative overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900/90 p-6 shadow-[0_30px_100px_-60px_rgba(0,0,0,0.95)] backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                Ready to continue
              </p>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-white">
                Browser approval complete
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Use the button on the left to hand the CLI a session token and
                return to the terminal.
              </p>
            </div>
          ) : (
            <AuthPanel context="cli" />
          )}
        </section>
      </div>
    </main>
  );
}
