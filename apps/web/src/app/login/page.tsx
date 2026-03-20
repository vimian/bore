import Link from "next/link";
import {
  ArrowUpRight,
  Github,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth-panel";
import { getCurrentUser } from "@/lib/session";

const GITHUB_REPO_URL = "https://github.com/vimian/bore";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-10 md:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_24%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.14),_transparent_18%),linear-gradient(180deg,_rgba(9,9,11,0.98)_0%,_rgba(9,9,11,1)_100%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300 backdrop-blur">
            <LockKeyhole className="h-4 w-4" />
            Account Access
          </div>

          <div className="space-y-5">
            <Link
              href="/"
              className="inline-flex items-center gap-3 text-sm font-medium tracking-[0.32em] text-zinc-300 transition hover:text-white"
            >
              <RadioTower className="h-4 w-4" />
              BORE
            </Link>
            <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-5xl leading-[0.92] text-transparent sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text">
                Sign in to the Bore control plane.
              </span>
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-zinc-400">
              Email and password auth backed by SQLite, with instant access to
              your namespace inventory, child hosts, and tunnel telemetry.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
              <ShieldCheck className="h-5 w-5 text-zinc-200" />
              <h2 className="mt-4 text-lg font-semibold text-white">
                Local-first auth
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Fast account checks, session cookies, and zero dependency on a
                third-party identity provider.
              </p>
            </article>
            <article className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
              <Github className="h-5 w-5 text-zinc-200" />
              <h2 className="mt-4 text-lg font-semibold text-white">
                Open source by default
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Review the control plane, agent, and deployment setup in the
                public repository before you sign in.
              </p>
            </article>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-zinc-800 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-700 hover:text-white"
            >
              Back to landing page
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-700 hover:text-white"
            >
              View on GitHub
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="relative">
          <div className="absolute inset-x-10 -top-12 h-32 rounded-full bg-white/6 blur-3xl" />
          <AuthPanel />
        </section>
      </div>
    </main>
  );
}
