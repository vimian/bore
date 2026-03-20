"use client";

import { useEffect, useReducer, useState } from "react";

import {
  ActionErrorBanner,
  EmptyNamespacesState,
  LiveStateBanner,
  OverviewStats,
} from "@/components/dashboard-ui";
import { NamespaceCard } from "@/components/namespace-card";
import {
  getTrafficTargetKey,
  type Overview,
  type TrafficTarget,
} from "@/components/dashboard-types";

type DashboardState = {
  overview: Overview | null;
  isRefreshing: boolean;
};

type DashboardAction =
  | { type: "refresh_started" }
  | { type: "refresh_succeeded"; overview: Overview }
  | { type: "refresh_finished" };

async function fetchOverview(): Promise<Overview> {
  const response = await fetch("/api/dashboard", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load dashboard state.");
  }

  return (await response.json()) as Overview;
}

async function releaseNamespace(subdomain: string): Promise<void> {
  const response = await fetch(`/api/namespaces/${encodeURIComponent(subdomain)}`, {
    method: "DELETE",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: undefined }))) as {
      error?: string;
    };
    throw new Error(payload.error ?? "Unable to release namespace.");
  }
}

async function cleanTraffic(target: TrafficTarget): Promise<void> {
  const response = await fetch(
    `/api/namespaces/${encodeURIComponent(target.subdomain)}/traffic`,
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(
        target.scope === "direct"
          ? { scope: "direct" }
          : { scope: "child", label: target.label },
      ),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: undefined }))) as {
      error?: string;
    };
    throw new Error(payload.error ?? "Unable to clean traffic.");
  }
}

function dashboardReducer(
  state: DashboardState,
  action: DashboardAction,
): DashboardState {
  switch (action.type) {
    case "refresh_started":
      return {
        ...state,
        isRefreshing: true,
      };
    case "refresh_succeeded":
      return {
        overview: action.overview,
        isRefreshing: false,
      };
    case "refresh_finished":
      return {
        ...state,
        isRefreshing: false,
      };
    default:
      return state;
  }
}

export function NamespaceDashboard({
  initialOverview,
}: {
  initialOverview: Overview;
}) {
  const [releasingNamespace, setReleasingNamespace] = useState<string | null>(null);
  const [cleaningTrafficKey, setCleaningTrafficKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveState, dispatch] = useReducer(dashboardReducer, {
    overview: null,
    isRefreshing: false,
  });
  const overview = liveState.overview ?? initialOverview;

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      dispatch({ type: "refresh_started" });

      try {
        const nextOverview = await fetchOverview();

        if (active) {
          dispatch({ type: "refresh_succeeded", overview: nextOverview });
        }
      } catch {
        if (active) {
          dispatch({ type: "refresh_finished" });
        }
      }
    };

    const interval = window.setInterval(() => {
      void refresh();
    }, 3_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const handleRelease = async (subdomain: string) => {
    if (
      !window.confirm(
        `Release ${subdomain}? This removes the reservation and every child host under it.`,
      )
    ) {
      return;
    }

    setActionError(null);
    setReleasingNamespace(subdomain);

    try {
      await releaseNamespace(subdomain);
      dispatch({ type: "refresh_started" });
      dispatch({ type: "refresh_succeeded", overview: await fetchOverview() });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to release namespace.",
      );
    } finally {
      setReleasingNamespace(null);
    }
  };

  const handleCleanTraffic = async (target: TrafficTarget) => {
    const subject = target.scope === "direct" ? target.subdomain : target.hostname;
    const scopeLabel =
      target.scope === "direct"
        ? "the direct namespace only"
        : "this child host only";

    if (
      !window.confirm(
        `Clean traffic for ${subject}? This deletes all recorded IP counts for ${scopeLabel}.`,
      )
    ) {
      return;
    }

    setActionError(null);
    setCleaningTrafficKey(getTrafficTargetKey(target));

    try {
      await cleanTraffic(target);
      dispatch({ type: "refresh_started" });
      dispatch({ type: "refresh_succeeded", overview: await fetchOverview() });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to clean traffic.",
      );
    } finally {
      setCleaningTrafficKey(null);
    }
  };

  return (
    <div className="space-y-8">
      <OverviewStats overview={overview} />
      <LiveStateBanner isRefreshing={liveState.isRefreshing} />
      {actionError ? <ActionErrorBanner message={actionError} /> : null}
      <section className="space-y-4">
        {overview.namespaces.length === 0 ? (
          <EmptyNamespacesState />
        ) : (
          overview.namespaces.map((namespace) => (
            <NamespaceCard
              key={namespace.reservationId}
              namespace={namespace}
              isReleasing={releasingNamespace === namespace.subdomain}
              cleaningTrafficKey={cleaningTrafficKey}
              onRelease={(nextSubdomain) => {
                void handleRelease(nextSubdomain);
              }}
              onCleanTraffic={(target) => {
                void handleCleanTraffic(target);
              }}
            />
          ))
        )}
      </section>
    </div>
  );
}
