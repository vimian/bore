import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenText,
  Database,
  Github,
  Layers3,
  Linkedin,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TimerReset,
} from "lucide-react";

import { InstallCommandCopy } from "@/components/install-command-copy";

const GITHUB_REPO_URL = "https://github.com/vimian/bore";
const GITHUB_DOCS_URL = "https://github.com/vimian/bore/tree/main/docs";
const FOUNDER_LINKEDIN_URL = "https://www.linkedin.com/in/casper-fenger-jensen";
const INSTALL_COMMAND = "curl -sL https://bore.dk/install.sh | bash";

const productCards = [
  {
    eyebrow: "Live Console",
    title: "See tunnels resolve in one authenticated dashboard.",
    copy:
      "A dashboard view for namespace health, child hosts, request stats, and tunnel activity without bouncing between tools.",
    className: "lg:col-span-2",
    icon: Layers3,
    content: (
      <div className="mt-6 rounded-[1.5rem] border border-zinc-800 bg-zinc-950/90 p-4">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <p className="text-sm font-medium text-white">Dashboard Preview</p>
            <p className="mt-1 text-xs text-zinc-500">Namespace inventory</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Live
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.25rem] border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">pia</p>
                <p className="mt-1 text-xs text-zinc-500">pia.bore.dk</p>
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Active
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                <p className="text-zinc-500">Claims</p>
                <p className="mt-2 text-lg font-semibold text-white">3</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                <p className="text-zinc-500">Hosts</p>
                <p className="mt-2 text-lg font-semibold text-white">5</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                <p className="text-zinc-500">RPM</p>
                <p className="mt-2 text-lg font-semibold text-white">1.2k</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {[
              "Tunnel claimed from macbook-pro",
              "api.pia.bore.dk cert active",
              "Traffic cleaned 34 seconds ago",
            ].map((event) => (
              <div
                key={event}
                className="rounded-[1.25rem] border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-400"
              >
                {event}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: "SQLite Auth",
    title: "Local-first authentication that stays fast under load.",
    copy:
      "User records, session issuance, and namespace limits live close to the control plane for predictable access checks.",
    className: "lg:row-span-2",
    icon: Database,
    content: (
      <div className="mt-6 rounded-[1.5rem] border border-zinc-800 bg-zinc-950/90 p-5">
        <div className="flex items-center gap-3 text-zinc-300">
          <Database className="h-5 w-5" />
          <span className="text-sm font-medium">Fast path auth flow</span>
        </div>
        <div className="mt-5 space-y-3">
          {[
            "Email + password verification",
            "Per-user reservation and child-host limits",
            "Session cookies issued directly from Bore",
          ].map((line) => (
            <div
              key={line}
              className="rounded-[1.1rem] border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400"
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Persistence",
    title: "Always-on tunnels with daemon-level continuity.",
    copy:
      "Persistent connections keep routing stable even when teams pause and resume local work throughout the day.",
    className: "",
    icon: TimerReset,
    content: (
      <div className="mt-6 rounded-[1.5rem] border border-zinc-800 bg-zinc-950/90 p-5">
        <div className="space-y-4">
          {[
            ["08:41", "Tunnel restored"],
            ["09:03", "Namespace reassigned"],
            ["09:03", "Traffic resumed"],
          ].map(([time, label]) => (
            <div
              key={`${time}-${label}`}
              className="flex items-center justify-between rounded-[1.1rem] border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm"
            >
              <span className="font-mono text-zinc-500">{time}</span>
              <span className="text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Managed Namespaces",
    title: "Persistent public URLs without fragile manual routing.",
    copy:
      "Reserve `pia.bore.dk`, attach approved child hosts, and keep tunnel ownership explicit across the team.",
    className: "",
    icon: ShieldCheck,
    content: (
      <div className="mt-6 rounded-[1.5rem] border border-zinc-800 bg-zinc-950/90 p-5">
        <div className="rounded-[1.1rem] border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
            Namespace Rules
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            First-level child hosts like `api.pia.bore.dk` are persisted. Deeper
            trees are intentionally rejected to keep routing predictable.
          </p>
        </div>
      </div>
    ),
  },
];

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Open Source", href: "#open-source" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: GITHUB_DOCS_URL, external: true },
      { label: "Source Code", href: GITHUB_REPO_URL, external: true },
      {
        label: "Health",
        href: "http://91.99.163.174:8787/health",
        external: true,
      },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Open Source", href: GITHUB_REPO_URL, external: true },
      { label: "Sign In", href: "/login" },
      { label: "GitHub", href: GITHUB_REPO_URL, external: true },
    ],
  },
  {
    title: "Company",
    links: [
      {
        label: "Built by Casper Fenger Jensen",
        href: FOUNDER_LINKEDIN_URL,
        external: true,
      },
      {
        label: "MIT License",
        href: `${GITHUB_REPO_URL}/blob/main/LICENSE`,
        external: true,
      },
      { label: "About Bore", href: "#open-source" },
    ],
  },
];

type LandingPageProps = {
  consoleHref: "/dashboard" | "/login";
  consoleLabel: string;
  primaryCtaLabel: string;
  starLabel: string;
};

export function LandingPage({
  consoleHref,
  consoleLabel,
  primaryCtaLabel,
  starLabel,
}: LandingPageProps) {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_24%),radial-gradient(circle_at_0%_10%,_rgba(59,130,246,0.14),_transparent_20%),radial-gradient(circle_at_100%_20%,_rgba(255,255,255,0.08),_transparent_16%),linear-gradient(180deg,_rgba(9,9,11,0.98)_0%,_rgba(9,9,11,1)_100%)]" />
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 bg-zinc-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[0.36em] text-white sm:text-2xl"
          >
            BORE
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a
              href={GITHUB_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-white"
            >
              Docs
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-700 hover:text-white"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">Star on GitHub</span>
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                {starLabel}
              </span>
            </a>
            <Link
              href={consoleHref}
              className="inline-flex items-center justify-center rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:border-zinc-500"
            >
              {consoleLabel}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-18 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-32 lg:pt-28">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300 backdrop-blur">
            <Sparkles className="h-4 w-4" />
            Authenticated control plane
          </div>

          <div className="space-y-6">
            <h1 className="max-w-4xl font-[family-name:var(--font-display)] text-5xl leading-[0.9] text-transparent sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text">
                Secure Tunneling. Zero Friction.
              </span>
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-zinc-400">
              The authenticated control plane for exposing local services.
              Managed namespaces, live SQLite-backed telemetry, and persistent
              tunnels.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={consoleHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
            >
              {primaryCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:border-zinc-700 hover:text-white"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>

          <InstallCommandCopy command={INSTALL_COMMAND} />

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Namespaces",
                value: "Managed",
              },
              {
                label: "Telemetry",
                value: "SQLite-backed",
              },
              {
                label: "Tunnel mode",
                value: "Persistent",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[1.5rem] border border-zinc-800 bg-zinc-900/50 px-5 py-4 backdrop-blur"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  {item.label}
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="absolute inset-x-10 top-8 h-32 rounded-full bg-white/8 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900/75 shadow-[0_50px_140px_-70px_rgba(0,0,0,1)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs uppercase tracking-[0.22em] text-zinc-400">
                <TerminalSquare className="h-3.5 w-3.5" />
                Terminal
              </div>
            </div>
            <div className="space-y-6 px-4 py-5 font-mono text-xs sm:px-5 sm:py-6 sm:text-sm">
              <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/80 p-4">
                <p className="text-zinc-500">$ bore up 3000</p>
                <p className="mt-3 text-zinc-200">
                  Authenticating with Bore control plane...
                </p>
                <p className="mt-1 text-zinc-200">
                  Namespace attached:{" "}
                  <span className="text-white">pia</span>
                </p>
                <p className="mt-1 break-all text-zinc-200">
                  Public URL:{" "}
                  <span className="text-cyan-300">
                    https://pia.bore.dk
                  </span>
                </p>
                <p className="mt-1 text-zinc-200">
                  Status: <span className="text-emerald-300">persistent</span>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                    Control Plane
                  </p>
                  <p className="mt-3 text-base text-white">
                    Authenticated Bore session issued.
                  </p>
                  <p className="mt-2 text-zinc-400">
                    SQLite-backed account state is active.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                    Telemetry
                  </p>
                  <p className="mt-3 text-base text-white">
                    Request stream connected.
                  </p>
                  <p className="mt-2 text-zinc-400">
                    Namespace and host metrics update live.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="relative mx-auto max-w-7xl px-6 pb-24 lg:pb-32"
      >
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
            Product Intelligence
          </p>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white sm:text-5xl">
            The surface area developers actually need.
          </h2>
          <p className="mt-4 text-lg leading-8 text-zinc-400">
            Bore combines authenticated access, namespace management, and
            telemetry in one control plane instead of scattering state across
            tunnel commands and ad-hoc scripts.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {productCards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                key={card.title}
                className={`rounded-[2rem] border border-zinc-800 bg-zinc-900/50 p-6 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/80 ${card.className}`}
              >
                <div className="flex items-center gap-3 text-zinc-300">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    {card.eyebrow}
                  </p>
                </div>
                <h3 className="mt-6 text-2xl font-semibold text-white">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-zinc-400">
                  {card.copy}
                </p>
                {card.content}
              </article>
            );
          })}
        </div>
      </section>

      <section
        id="open-source"
        className="relative mx-auto max-w-7xl px-6 pb-24 lg:pb-32"
      >
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="rounded-[2rem] border border-zinc-800 bg-zinc-900/50 p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-zinc-300">
                <Github className="h-4 w-4" />
                Open Source
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">
                <BadgeCheck className="h-4 w-4" />
                Community built
              </span>
            </div>

            <h2 className="mt-6 font-[family-name:var(--font-display)] text-4xl text-white">
              Fully Open Source. Built for the community.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
              Bore ships the web control plane, the local agent, and deployment
              primitives in the open. Audit the stack, file issues, or fork the
              product without reverse-engineering a black box.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
              >
                View repository
                <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href={GITHUB_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:border-zinc-700 hover:text-white"
              >
                <BookOpenText className="h-4 w-4" />
                Read the docs
              </a>
            </div>
          </article>

          <article className="rounded-[2rem] border border-zinc-800 bg-zinc-900/50 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Built by
            </p>
            <h3 className="mt-4 text-2xl font-semibold text-white">
              Casper Fenger Jensen
            </h3>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Founder-facing trust signal for a developer tool is simple:
              public code, a real person, and a direct path to the builder.
            </p>
            <a
              href={FOUNDER_LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-zinc-700 hover:text-white"
            >
              <Linkedin className="h-4 w-4" />
              Meet the founder
            </a>
          </article>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-zinc-300">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="transition hover:text-white"
                        >
                          {link.label}
                        </a>
                      ) : link.href.startsWith("/") ? (
                        <Link
                          href={link.href}
                          className="transition hover:text-white"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a href={link.href} className="transition hover:text-white">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-6 border-t border-zinc-900 pt-6 text-sm text-zinc-500 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                href="/"
                className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[0.28em] text-white"
              >
                BORE
              </Link>
              <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
                Secure tunneling with managed namespaces, live telemetry, and a
                clear control plane.
              </p>
            </div>
            <p>&copy; 2026 Bore.dk. Open Source under MIT License.</p>
            <div className="flex items-center gap-4">
              <a
                href={FOUNDER_LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-white"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-white"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
