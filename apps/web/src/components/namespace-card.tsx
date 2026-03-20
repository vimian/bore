import { ArrowUpRight, HardDrive, Network } from "lucide-react";

import {
  getTrafficTargetKey,
  type Namespace,
  type TrafficTarget,
} from "@/components/dashboard-types";
import { StatusPill, formatTime } from "@/components/dashboard-ui";
import { RequestStatsPanel } from "@/components/request-stats-panel";

function AccessHostsSection({
  namespace,
  cleaningTrafficKey,
  onCleanTraffic,
}: {
  namespace: Namespace;
  cleaningTrafficKey: string | null;
  onCleanTraffic: (target: TrafficTarget) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-stone-900/8 bg-stone-50/80 p-4">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-stone-500" />
        <span className="text-xs uppercase tracking-[0.18em] text-stone-500">
          Child Hosts
        </span>
      </div>
      {namespace.accessHosts.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">
          No child hosts reserved yet. Add them with `bore host add {namespace.subdomain} &lt;label&gt;`.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {namespace.accessHosts.map((accessHost) => {
            const trafficTarget: TrafficTarget = {
              scope: "child",
              subdomain: namespace.subdomain,
              accessHostId: accessHost.accessHostId,
              label: accessHost.label,
              hostname: accessHost.hostname,
            };

            return (
              <div
                key={accessHost.accessHostId}
                className="rounded-[1.25rem] border border-stone-900/10 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-stone-900">
                      {accessHost.label}
                    </span>
                    <span className="text-xs uppercase tracking-[0.16em] text-stone-500">
                      {accessHost.kind}
                    </span>
                  </div>
                  <a
                    href={accessHost.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-stone-700 transition hover:text-stone-950"
                  >
                    Open
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
                <div className="mt-3">
                  <RequestStatsPanel
                    title="Child Host Traffic"
                    stats={accessHost.requestStats}
                    emptyLabel="No child-host requests recorded yet."
                    isCleaning={cleaningTrafficKey === getTrafficTargetKey(trafficTarget)}
                    onClean={() => {
                      onCleanTraffic(trafficTarget);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NamespaceClaims({ namespace }: { namespace: Namespace }) {
  if (namespace.claims.length === 0) {
    return (
      <p className="text-sm text-stone-600">
        Reserved and available. No device is claiming this namespace right now.
      </p>
    );
  }

  return namespace.claims.map((claim) => (
    <div
      key={claim.tunnelId}
      className="grid gap-4 rounded-[1.5rem] border border-stone-900/8 bg-stone-50/80 p-4 md:grid-cols-[1.2fr_1fr_auto]"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <StatusPill status={claim.status} />
          <span className="text-xs uppercase tracking-[0.18em] text-stone-500">
            claim
          </span>
        </div>
        <p className="font-medium text-stone-900">
          {claim.deviceName} on {claim.hostname}
        </p>
        <p className="text-sm text-stone-600">
          Port {claim.localPort} / {claim.platform}
        </p>
      </div>
      <div className="space-y-2 text-sm text-stone-600">
        <p className="flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          Last seen {formatTime(claim.lastSeenAt)}
        </p>
        <p>Claimed {formatTime(claim.claimedAt)}</p>
        <p>Updated {formatTime(claim.updatedAt)}</p>
      </div>
      <div className="flex items-start justify-end">
        <a
          href={namespace.publicUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-white px-4 py-2 text-sm text-stone-800 transition hover:border-stone-900/30 hover:text-stone-950"
        >
          Open
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  ));
}

export function NamespaceCard({
  namespace,
  isReleasing,
  cleaningTrafficKey,
  onRelease,
  onCleanTraffic,
}: {
  namespace: Namespace;
  isReleasing: boolean;
  cleaningTrafficKey: string | null;
  onRelease: (subdomain: string) => void;
  onCleanTraffic: (target: TrafficTarget) => void;
}) {
  const hasClaims = namespace.claims.length > 0;
  const directTrafficTarget: TrafficTarget = {
    scope: "direct",
    subdomain: namespace.subdomain,
  };

  return (
    <article className="overflow-hidden rounded-[2rem] border border-stone-900/10 bg-white/78 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="border-b border-stone-900/8 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={namespace.status} />
              <span className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-50">
                {namespace.subdomain}
              </span>
            </div>
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-3xl text-stone-950">
                {namespace.subdomain}
              </h3>
              <a
                href={namespace.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-sm text-stone-700 transition hover:text-stone-950"
              >
                {namespace.publicUrl}
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="grid gap-2 text-sm text-stone-600 lg:text-right">
              <span>Last used {formatTime(namespace.lastUsedAt)}</span>
              <span>{namespace.claims.length} active claim record(s)</span>
              <span>{namespace.accessHosts.length} child host(s)</span>
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <button
                type="button"
                onClick={() => {
                  onRelease(namespace.subdomain);
                }}
                disabled={hasClaims || isReleasing}
                className="inline-flex items-center justify-center rounded-full border border-rose-600/20 bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-stone-900/10 disabled:bg-stone-300"
              >
                {isReleasing ? "Releasing..." : "Release namespace"}
              </button>
              <p className="max-w-xs text-xs leading-5 text-stone-500 lg:text-right">
                {hasClaims
                  ? "Stop every claim with bore down before releasing this reservation."
                  : "This removes the reserved namespace and all child hosts under it."}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-6 py-5">
        <RequestStatsPanel
          title="Direct Traffic"
          stats={namespace.directRequestStats}
          emptyLabel="No direct namespace requests recorded yet."
          isCleaning={cleaningTrafficKey === getTrafficTargetKey(directTrafficTarget)}
          onClean={() => {
            onCleanTraffic(directTrafficTarget);
          }}
        />
        <AccessHostsSection
          namespace={namespace}
          cleaningTrafficKey={cleaningTrafficKey}
          onCleanTraffic={onCleanTraffic}
        />
        <NamespaceClaims namespace={namespace} />
      </div>
    </article>
  );
}
