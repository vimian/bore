import { randomUUID } from "node:crypto";

import {
  generateRandomSubdomain,
  nextAvailableSubdomain,
  normalizeDnsLabel,
  normalizeReservedSubdomain,
} from "./subdomains.js";
import {
  DEFAULT_ACCESS_HOST_LIMIT,
  type ControlPlaneStore,
  DEFAULT_RESERVATION_LIMIT,
  setDeviceConnection as persistDeviceConnection,
} from "./store.js";
import type {
  AccessHostRecord,
  DesiredTunnelInput,
  DeviceRegistrationInput,
  DeviceTunnelRecord,
  PersistedState,
  RequestStatsRecord,
  SyncResponse,
  TunnelReservationRecord,
  TunnelStatus,
  TunnelView,
  UserRecord,
} from "./types.js";
import { buildDashboardOverview, type ReservationView } from "./state-model.js";

interface DeviceConnectionState {
  connectedAt: string;
}

interface ResolvedHostnameTarget {
  reservationId: string;
  kind: "direct" | "child";
  accessHostId?: string;
}

type ClearTrafficTarget =
  | {
      kind: "direct";
    }
  | {
      kind: "child";
      label: string;
    };

function buildAccessHostname(label: string, subdomain: string): string {
  return `${label}.${subdomain}`;
}

export class TunnelCoordinator {
  readonly #connections = new Map<string, DeviceConnectionState>();

  constructor(
    private readonly store: ControlPlaneStore,
    private readonly publicDomain: string,
  ) {}

  async registerDevice(
    userId: string,
    input: DeviceRegistrationInput,
  ): Promise<{ deviceId: string }> {
    const deviceId = await this.store.update((state) => {
      const now = new Date().toISOString();
      const existing = state.devices[input.deviceId];

      if (existing && existing.userId !== userId) {
        throw new Error("Device belongs to another user");
      }

      state.devices[input.deviceId] = {
        id: input.deviceId,
        userId,
        name: input.name,
        hostname: input.hostname,
        platform: input.platform,
        fingerprint: input.fingerprint,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastSeenAt: now,
      };

      return input.deviceId;
    });

    return { deviceId };
  }

  async syncDeviceTunnels(
    user: UserRecord,
    deviceId: string,
    desiredTunnels: DesiredTunnelInput[],
  ): Promise<SyncResponse> {
    await this.store.update((state) => {
      const device = state.devices[deviceId];

      if (!device || device.userId !== user.id) {
        throw new Error("Unknown device");
      }

      const now = new Date().toISOString();
      device.lastSeenAt = now;
      device.updatedAt = now;

      const desiredPorts = new Set(desiredTunnels.map((item) => item.localPort));

      for (const tunnel of Object.values(state.deviceTunnels)) {
        if (tunnel.deviceId === deviceId && !desiredPorts.has(tunnel.localPort)) {
          delete state.deviceTunnels[tunnel.id];
        }
      }

      for (const desiredTunnel of desiredTunnels) {
        const existingTunnel = Object.values(state.deviceTunnels).find(
          (candidate) =>
            candidate.deviceId === deviceId &&
            candidate.localPort === desiredTunnel.localPort,
        );
        const reservation = this.upsertReservation(state, user, desiredTunnel, existingTunnel);
        const id = existingTunnel?.id ?? randomUUID();
        const changedSubdomain = existingTunnel?.subdomain !== reservation.subdomain;

        state.deviceTunnels[id] = {
          id,
          userId: user.id,
          deviceId,
          localPort: desiredTunnel.localPort,
          reservationId: reservation.id,
          subdomain: reservation.subdomain,
          claimedAt: existingTunnel && !changedSubdomain ? existingTunnel.claimedAt : now,
          updatedAt: now,
        };

        reservation.lastUsedAt = now;
        reservation.updatedAt = now;
      }
    });

    return this.buildSyncResponse(user.id, deviceId);
  }

  async listUserTunnels(userId: string): Promise<TunnelView[]> {
    return this.buildTunnelViews(this.store.snapshot(), userId);
  }

  listUserNamespaces(user: UserRecord): ReservationView[] {
    return buildDashboardOverview(this.store.snapshot(), user, this.publicDomain).namespaces;
  }

  async setDeviceConnection(deviceId: string, connected: boolean): Promise<void> {
    if (connected) {
      const connectedAt = new Date().toISOString();
      this.#connections.set(deviceId, { connectedAt });
      await this.store.update((state) => {
        persistDeviceConnection(state, deviceId, connectedAt);
      });
      return;
    }

    this.#connections.delete(deviceId);
    await this.store.update((state) => {
      persistDeviceConnection(state, deviceId);
    });
  }

  findActiveTunnelByHostname(host: string): TunnelView | undefined {
    const snapshot = this.store.snapshot();
    const target = this.resolveHostnameTarget(snapshot, host);

    if (!target) {
      return undefined;
    }

    const views = Object.values(snapshot.deviceTunnels)
      .filter((tunnel) => tunnel.reservationId === target.reservationId)
      .map((tunnel) => this.toTunnelView(snapshot, tunnel, this.getStatus(snapshot, tunnel)))
      .filter((view): view is TunnelView => view !== undefined);

    return views
      .filter((view) => view.status === "active")
      .sort((left, right) => right.subdomain.length - left.subdomain.length)[0];
  }

  hasLiveConnection(deviceId: string): boolean {
    return this.#connections.has(deviceId);
  }

  listReservedSubdomains(): string[] {
    return [
      ...new Set(
        Object.values(this.store.snapshot().reservations).map((reservation) => reservation.subdomain),
      ),
    ].sort();
  }

  listAccessHosts(): string[] {
    return [
      ...new Set(
        Object.values(this.store.snapshot().accessHosts).map((accessHost) => accessHost.hostname),
      ),
    ].sort();
  }

  async touchAccessHostname(host: string): Promise<AccessHostRecord | undefined> {
    return this.store.update((state) => {
      const target = this.resolveHostnameTarget(state, host);

      if (!target || target.kind !== "child" || !target.accessHostId) {
        return undefined;
      }

      const existing = state.accessHosts[target.accessHostId];

      if (!existing) {
        return undefined;
      }

      const now = new Date().toISOString();
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      return existing;
    });
  }

  async recordHostnameRequest(host: string, ipAddress: string): Promise<void> {
    const normalizedIpAddress = this.normalizeIpAddress(ipAddress);

    if (!normalizedIpAddress) {
      return;
    }

    await this.store.update((state) => {
      const target = this.resolveHostnameTarget(state, host);

      if (!target) {
        return;
      }

      const now = new Date().toISOString();

      if (target.kind === "direct") {
        const reservation = state.reservations[target.reservationId];

        if (!reservation) {
          return;
        }

        reservation.directRequestStats = this.incrementRequestStats(
          reservation.directRequestStats,
          normalizedIpAddress,
          now,
        );
        return;
      }

      if (!target.accessHostId) {
        return;
      }

      const accessHost = state.accessHosts[target.accessHostId];

      if (!accessHost) {
        return;
      }

      accessHost.lastSeenAt = now;
      accessHost.updatedAt = now;
      accessHost.requestStats = this.incrementRequestStats(
        accessHost.requestStats,
        normalizedIpAddress,
        now,
      );
    });
  }

  async reserveAccessHostname(
    user: UserRecord,
    subdomainInput: string,
    labelInput: string,
    kind: "default" | "custom" = "custom",
  ): Promise<AccessHostRecord> {
    const subdomain = normalizeReservedSubdomain(subdomainInput);
    const label = normalizeDnsLabel(labelInput, "Child host label");

    return this.store.update((state) => {
      const reservation = Object.values(state.reservations).find(
        (candidate) => candidate.userId === user.id && candidate.subdomain === subdomain,
      );

      if (!reservation) {
        throw new Error(`Namespace ${subdomain} is not reserved for this account`);
      }

      const hostname = buildAccessHostname(label, reservation.subdomain);
      const existing = Object.values(state.accessHosts).find(
        (accessHost) => accessHost.hostname === hostname,
      );
      const now = new Date().toISOString();

      if (existing) {
        existing.kind = kind === "default" ? "default" : existing.kind ?? "custom";
        existing.lastSeenAt = now;
        existing.updatedAt = now;
        return existing;
      }

      if (kind === "custom") {
        const accessHostLimit = user.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT;
        const accessHostCount = Object.values(state.accessHosts).filter(
          (accessHost) =>
            accessHost.userId === reservation.userId && (accessHost.kind ?? "custom") === "custom",
        ).length;

        if (accessHostCount >= accessHostLimit) {
          throw new Error(
            `You have reached your child hostname limit of ${accessHostLimit}. Reuse an existing child hostname or increase your limit.`,
          );
        }
      }

      const accessHost: AccessHostRecord = {
        id: randomUUID(),
        userId: reservation.userId,
        reservationId: reservation.id,
        hostname,
        kind,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      };

      state.accessHosts[accessHost.id] = accessHost;
      return accessHost;
    });
  }

  async removeAccessHostname(
    user: UserRecord,
    subdomainInput: string,
    labelInput: string,
  ): Promise<AccessHostRecord> {
    const subdomain = normalizeReservedSubdomain(subdomainInput);
    const label = normalizeDnsLabel(labelInput, "Child host label");

    return this.store.update((state) => {
      const reservation = Object.values(state.reservations).find(
        (candidate) => candidate.userId === user.id && candidate.subdomain === subdomain,
      );

      if (!reservation) {
        throw new Error(`Namespace ${subdomain} is not reserved for this account`);
      }

      const hostname = buildAccessHostname(label, reservation.subdomain);
      const existing = Object.values(state.accessHosts).find(
        (accessHost) =>
          accessHost.reservationId === reservation.id && accessHost.hostname === hostname,
      );

      if (!existing) {
        throw new Error(`Child host ${hostname} is not reserved for this account`);
      }

      delete state.accessHosts[existing.id];
      return existing;
    });
  }

  async releaseNamespace(
    user: UserRecord,
    subdomainInput: string,
  ): Promise<{ releasedSubdomain: string; removedAccessHostnames: string[] }> {
    const subdomain = normalizeReservedSubdomain(subdomainInput);

    return this.store.update((state) => {
      const reservation = Object.values(state.reservations).find(
        (candidate) => candidate.userId === user.id && candidate.subdomain === subdomain,
      );

      if (!reservation) {
        throw new Error(`Namespace ${subdomain} is not reserved for this account`);
      }

      const claims = Object.values(state.deviceTunnels).filter(
        (tunnel) => tunnel.reservationId === reservation.id,
      );

      if (claims.length > 0) {
        const suffix = claims.length === 1 ? "" : "s";
        throw new Error(
          `Namespace ${subdomain} still has ${claims.length} tunnel claim${suffix}. Run bore down for every tunnel using it before releasing the reservation.`,
        );
      }

      const removedAccessHostnames = Object.values(state.accessHosts)
        .filter((accessHost) => accessHost.reservationId === reservation.id)
        .map((accessHost) => accessHost.hostname)
        .sort();

      for (const accessHost of Object.values(state.accessHosts)) {
        if (accessHost.reservationId === reservation.id) {
          delete state.accessHosts[accessHost.id];
        }
      }

      delete state.reservations[reservation.id];

      return {
        releasedSubdomain: reservation.subdomain,
        removedAccessHostnames,
      };
    });
  }

  async clearTraffic(
    user: UserRecord,
    subdomainInput: string,
    target: ClearTrafficTarget,
  ): Promise<void> {
    const subdomain = normalizeReservedSubdomain(subdomainInput);

    await this.store.update((state) => {
      const reservation = Object.values(state.reservations).find(
        (candidate) => candidate.userId === user.id && candidate.subdomain === subdomain,
      );

      if (!reservation) {
        throw new Error(`Namespace ${subdomain} is not reserved for this account`);
      }

      const now = new Date().toISOString();

      if (target.kind === "direct") {
        delete reservation.directRequestStats;
        reservation.updatedAt = now;
        return;
      }

      const label = normalizeDnsLabel(target.label, "Child host label");
      const hostname = buildAccessHostname(label, reservation.subdomain);
      const accessHost = Object.values(state.accessHosts).find(
        (candidate) =>
          candidate.reservationId === reservation.id && candidate.hostname === hostname,
      );

      if (!accessHost) {
        throw new Error(`Child host ${hostname} is not reserved for this account`);
      }

      delete accessHost.requestStats;
      accessHost.updatedAt = now;
    });
  }

  listNamespaceHostnames(subdomainInput: string): string[] {
    const subdomain = normalizeReservedSubdomain(subdomainInput);
    const snapshot = this.store.snapshot();
    const reservation = Object.values(snapshot.reservations).find(
      (candidate) => candidate.subdomain === subdomain,
    );

    if (!reservation) {
      return [];
    }

    return [
      reservation.subdomain,
      ...Object.values(snapshot.accessHosts)
        .filter((accessHost) => accessHost.reservationId === reservation.id)
        .map((accessHost) => accessHost.hostname),
    ].sort();
  }

  private buildSyncResponse(userId: string, deviceId: string): SyncResponse {
    const snapshot = this.store.snapshot();

    return {
      deviceId,
      tunnels: this.buildTunnelViews(snapshot, userId),
      reusableSubdomains: this.getReusableSubdomains(snapshot, userId, deviceId),
    };
  }

  private buildTunnelViews(state: PersistedState, userId: string): TunnelView[] {
    return Object.values(state.deviceTunnels)
      .filter((tunnel) => tunnel.userId === userId)
      .map((tunnel) => this.toTunnelView(state, tunnel, this.getStatus(state, tunnel)))
      .filter((view): view is TunnelView => view !== undefined)
      .sort((left, right) =>
        left.subdomain.localeCompare(right.subdomain) || left.localPort - right.localPort,
      );
  }

  private toTunnelView(
    state: PersistedState,
    tunnel: DeviceTunnelRecord,
    status: TunnelStatus,
  ): TunnelView | undefined {
    const device = state.devices[tunnel.deviceId];

    if (!device) {
      return undefined;
    }

    return {
      deviceId: device.id,
      deviceName: device.name,
      hostname: device.hostname,
      platform: device.platform,
      localPort: tunnel.localPort,
      subdomain: tunnel.subdomain,
      publicUrl: `https://${tunnel.subdomain}.${this.publicDomain}`,
      status,
      claimedAt: tunnel.claimedAt,
      updatedAt: tunnel.updatedAt,
      lastSeenAt: device.lastSeenAt,
    };
  }

  private getStatus(state: PersistedState, tunnel: DeviceTunnelRecord): TunnelStatus {
    if (!this.#connections.has(tunnel.deviceId)) {
      return "offline";
    }

    const onlineClaims = Object.values(state.deviceTunnels)
      .filter(
        (candidate) =>
          candidate.userId === tunnel.userId &&
          candidate.subdomain === tunnel.subdomain &&
          this.#connections.has(candidate.deviceId),
      )
      .sort((left, right) =>
        right.claimedAt.localeCompare(left.claimedAt) ||
        right.updatedAt.localeCompare(left.updatedAt),
      );

    const winner = onlineClaims[0];

    if (!winner) {
      return "offline";
    }

    return winner.id === tunnel.id ? "active" : "blocked";
  }

  private getReusableSubdomains(
    state: PersistedState,
    userId: string,
    deviceId: string,
  ): string[] {
    const localSubdomains = new Set(
      Object.values(state.deviceTunnels)
        .filter((tunnel) => tunnel.deviceId === deviceId)
        .map((tunnel) => tunnel.subdomain),
    );

    const activeElsewhere = new Set(
      Object.values(state.deviceTunnels)
        .filter(
          (tunnel) =>
            tunnel.userId === userId &&
            tunnel.deviceId !== deviceId &&
            this.getStatus(state, tunnel) === "active",
        )
        .map((tunnel) => tunnel.subdomain),
    );

    return Object.values(state.reservations)
      .filter((reservation) => reservation.userId === userId)
      .map((reservation) => reservation.subdomain)
      .filter(
        (subdomain) => !localSubdomains.has(subdomain) && !activeElsewhere.has(subdomain),
      )
      .sort();
  }

  private incrementRequestStats(
    stats: RequestStatsRecord | undefined,
    ipAddress: string,
    now: string,
  ): RequestStatsRecord {
    const existing = stats?.ipAddresses[ipAddress];

    return {
      requestCount: (stats?.requestCount ?? 0) + 1,
      firstRequestAt: stats?.firstRequestAt ?? now,
      lastRequestAt: now,
      ipAddresses: {
        ...(stats?.ipAddresses ?? {}),
        [ipAddress]: {
          ipAddress,
          requestCount: (existing?.requestCount ?? 0) + 1,
          firstSeenAt: existing?.firstSeenAt ?? now,
          lastSeenAt: now,
        },
      },
    };
  }

  private resolveHostnameTarget(
    state: PersistedState,
    host: string,
  ): ResolvedHostnameTarget | undefined {
    const hostNamespace = this.getHostNamespace(host);

    if (!hostNamespace) {
      return undefined;
    }

    const reservation = Object.values(state.reservations).find(
      (candidate) => candidate.subdomain === hostNamespace,
    );

    if (reservation) {
      return {
        reservationId: reservation.id,
        kind: "direct",
      };
    }

    const accessHost = Object.values(state.accessHosts).find(
      (candidate) => candidate.hostname === hostNamespace,
    );

    if (!accessHost) {
      return undefined;
    }

    return {
      reservationId: accessHost.reservationId,
      kind: "child",
      accessHostId: accessHost.id,
    };
  }

  private getHostNamespace(host: string): string | undefined {
    const normalizedHost = host.toLowerCase();
    const suffix = `.${this.publicDomain}`;

    if (!normalizedHost.endsWith(suffix) || normalizedHost === this.publicDomain) {
      return undefined;
    }

    const hostNamespace = normalizedHost.slice(0, -suffix.length);

    return hostNamespace || undefined;
  }

  private normalizeIpAddress(ipAddress: string): string | undefined {
    const trimmed = ipAddress.trim().toLowerCase();

    if (!trimmed) {
      return undefined;
    }

    if (trimmed.startsWith("::ffff:")) {
      return trimmed.slice("::ffff:".length);
    }

    return trimmed;
  }

  private upsertReservation(
    state: PersistedState,
    user: UserRecord,
    desiredTunnel: DesiredTunnelInput,
    existingTunnel?: DeviceTunnelRecord,
  ): TunnelReservationRecord {
    if (desiredTunnel.preferredSubdomain) {
      const normalizedPreferred = normalizeReservedSubdomain(desiredTunnel.preferredSubdomain);

      if (normalizedPreferred.endsWith(`.${this.publicDomain}`)) {
        throw new Error(`Subdomain must not include the public suffix ${this.publicDomain}`);
      }

      const owner = Object.values(state.reservations).find(
        (candidate) => candidate.subdomain === normalizedPreferred,
      );

      if (!owner) {
        throw new Error(`Subdomain ${normalizedPreferred} is not reserved for this account`);
      }

      if (owner.userId !== user.id) {
        throw new Error(`Subdomain ${normalizedPreferred} is already reserved`);
      }

      return owner;
    }

    if (!desiredTunnel.allocateNewSubdomain && existingTunnel) {
      const existingReservation = state.reservations[existingTunnel.reservationId];

      if (existingReservation && existingReservation.userId === user.id) {
        return existingReservation;
      }
    }

    const now = new Date().toISOString();
    const reservationLimit = user.reservationLimit ?? DEFAULT_RESERVATION_LIMIT;
    const reservedCount = Object.values(state.reservations).filter(
      (reservation) => reservation.userId === user.id,
    ).length;

    if (reservedCount >= reservationLimit) {
      throw new Error(
        `You have reached your namespace limit of ${reservationLimit}. Reuse an existing namespace or increase your limit.`,
      );
    }

    const base = generateRandomSubdomain(
      Object.values(state.reservations).map((candidate) => candidate.subdomain),
    );
    const subdomain = nextAvailableSubdomain(
      base,
      Object.values(state.reservations).map((candidate) => candidate.subdomain),
    );

    const reservation: TunnelReservationRecord = {
      id: randomUUID(),
      userId: user.id,
      subdomain,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    };

    state.reservations[reservation.id] = reservation;
    return reservation;
  }
}
