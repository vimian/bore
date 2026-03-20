import type { RequestStats } from "@/components/dashboard-types";
import { formatTime } from "@/components/dashboard-ui";
import { cn } from "@/lib/utils";

type IpBadgeKey = "internal" | "external" | "datacenter";

const ipBadgeTone: Record<IpBadgeKey, string> = {
  internal: "border-sky-500/20 bg-sky-500/10 text-sky-900",
  external: "border-stone-900/10 bg-stone-900/5 text-stone-700",
  datacenter: "border-amber-500/25 bg-amber-500/10 text-amber-900",
};

function normalizeIpAddress(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const unwrapped =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;

  return unwrapped.split("%")[0] ?? unwrapped;
}

function parseIpv4(input: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(input)) {
    return null;
  }

  const octets = input.split(".").map((segment) => Number(segment));
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function classifyIpv4(octets: number[]): {
  scope: "internal" | "external";
  isDatacenterLikely: boolean;
} {
  const [first, second] = octets;

  if (first === 10) {
    return { scope: "internal", isDatacenterLikely: false };
  }

  if (first === 100 && second >= 64 && second <= 127) {
    return { scope: "internal", isDatacenterLikely: false };
  }

  if (first === 127) {
    return { scope: "internal", isDatacenterLikely: false };
  }

  if (first === 169 && second === 254) {
    return { scope: "internal", isDatacenterLikely: false };
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return { scope: "internal", isDatacenterLikely: true };
  }

  if (first === 192 && second === 168) {
    return { scope: "internal", isDatacenterLikely: false };
  }

  return { scope: "external", isDatacenterLikely: false };
}

function getIpBadges(ipAddress: string): Array<{
  key: IpBadgeKey;
  label: string;
  title?: string;
}> {
  const normalized = normalizeIpAddress(ipAddress);
  const ipv4MappedMatch = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  const ipv4 = parseIpv4(ipv4MappedMatch?.[1] ?? normalized);
  const classification = ipv4
    ? classifyIpv4(ipv4)
    : normalized === "::1" || /^fe[89ab]/.test(normalized)
      ? { scope: "internal" as const, isDatacenterLikely: false }
      : /^f[cd]/.test(normalized)
        ? { scope: "internal" as const, isDatacenterLikely: true }
        : { scope: "external" as const, isDatacenterLikely: false };
  const badges: Array<{
    key: IpBadgeKey;
    label: string;
    title?: string;
  }> = [{ key: classification.scope, label: classification.scope }];

  if (classification.isDatacenterLikely) {
    badges.push({
      key: "datacenter",
      label: "datacenter",
      title:
        "Likely on a private infra network. Bore does not currently use ASN or provider lookups.",
    });
  }

  return badges;
}

export function RequestStatsPanel({
  title,
  stats,
  emptyLabel,
  onClean,
  isCleaning = false,
}: {
  title: string;
  stats: RequestStats;
  emptyLabel: string;
  onClean?: () => void;
  isCleaning?: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-stone-900/8 bg-stone-50/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.18em] text-stone-500">
          {title}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500">
            {stats.requestCount} requests / {stats.uniqueIpCount} IPs
          </span>
          {onClean ? (
            <button
              type="button"
              onClick={onClean}
              disabled={stats.requestCount === 0 || isCleaning}
              className="inline-flex items-center justify-center rounded-full border border-rose-600/20 bg-white px-3 py-1 text-xs font-medium text-rose-700 transition hover:border-rose-600/40 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-stone-900/10 disabled:bg-stone-200 disabled:text-stone-500"
            >
              {isCleaning ? "Cleaning..." : "Clean"}
            </button>
          ) : null}
        </div>
      </div>
      {stats.requestCount === 0 ? (
        <p className="mt-3 text-sm text-stone-600">{emptyLabel}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {stats.lastRequestAt ? (
            <p className="text-sm text-stone-600">
              Last request {formatTime(stats.lastRequestAt)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {stats.ipAddresses.map((entry) => {
              const badges = getIpBadges(entry.ipAddress);

              return (
                <span
                  key={entry.ipAddress}
                  className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-stone-900/10 bg-white px-3 py-1 text-xs text-stone-700"
                >
                  <span className="font-medium text-stone-900">{entry.ipAddress}</span>
                  <span className="text-stone-500">
                    {entry.requestCount} request{entry.requestCount === 1 ? "" : "s"}
                  </span>
                  {badges.map((badge) => (
                    <span
                      key={`${entry.ipAddress}-${badge.key}`}
                      title={badge.title}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        ipBadgeTone[badge.key],
                      )}
                    >
                      {badge.label}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
