import { Activity, Globe, Layers3, Network, ShieldCheck } from "lucide-react";

import type { Claim, Namespace, Overview } from "@/components/dashboard-types";
import { cn } from "@/lib/utils";

const statusTone: Record<Namespace["status"], string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900",
  blocked: "border-amber-500/30 bg-amber-500/10 text-amber-900",
  offline: "border-slate-500/30 bg-slate-500/10 text-slate-700",
  available: "border-sky-500/30 bg-sky-500/10 text-sky-900",
};

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function StatusPill({
  status,
}: {
  status: Namespace["status"] | Claim["status"];
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        statusTone[status],
      )}
    >
      {status}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: React.ReactNode;
}) {
  return (
    <article className="rounded-[2rem] border border-stone-900/10 bg-white/75 p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="flex items-center gap-3 text-stone-500">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-[0.24em]">
          {label}
        </span>
      </div>
      <p className="mt-6 font-[family-name:var(--font-display)] text-5xl text-stone-950">
        {value}
      </p>
      <p className="mt-2 text-sm text-stone-600">{description}</p>
    </article>
  );
}

export function OverviewStats({ overview }: { overview: Overview }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<Layers3 className="h-5 w-5" />}
        label="Reserved"
        value={overview.user.reservedNamespaceCount}
        description="Namespaces currently assigned to your account."
      />
      <StatCard
        icon={<ShieldCheck className="h-5 w-5" />}
        label="Limit"
        value={overview.user.reservationLimit}
        description="Default is 2, and this value now lives in SQLite per user."
      />
      <StatCard
        icon={<Network className="h-5 w-5" />}
        label="Child Hosts"
        value={overview.user.accessHostCount}
        description="Custom child hosts reserved for your namespaces."
      />
      <StatCard
        icon={<Globe className="h-5 w-5" />}
        label="Slots Left"
        value={overview.user.remainingAccessHostSlots}
        description={
          <>
            Custom child host reservations left before hitting your limit of{" "}
            {overview.user.accessHostLimit}.
          </>
        }
      />
    </section>
  );
}

export function LiveStateBanner({ isRefreshing }: { isRefreshing: boolean }) {
  return (
    <section className="rounded-[2rem] border border-stone-900/10 bg-white/70 p-5 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="flex items-center gap-3 text-stone-700">
        <Activity
          className={`h-5 w-5 ${isRefreshing ? "animate-pulse" : ""}`}
        />
        <p className="text-sm uppercase tracking-[0.24em]">
          {isRefreshing ? "Refreshing live state" : "Live state connected"}
        </p>
      </div>
    </section>
  );
}

export function ActionErrorBanner({ message }: { message: string }) {
  return (
    <section className="rounded-[2rem] border border-rose-500/20 bg-rose-50/80 px-5 py-4 text-sm text-rose-900 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.25)] backdrop-blur">
      {message}
    </section>
  );
}

export function EmptyNamespacesState() {
  return (
    <article className="rounded-[2rem] border border-dashed border-stone-900/15 bg-white/60 p-10 text-center shadow-[0_30px_80px_-50px_rgba(15,23,42,0.25)] backdrop-blur">
      <p className="font-[family-name:var(--font-display)] text-2xl text-stone-950">
        No namespaces reserved yet
      </p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">
        Start a tunnel from the CLI and the reservation will appear here
        automatically.
      </p>
    </article>
  );
}
