import type {
  AgentConfig,
  MeResponse,
  NamespaceAccessHostView,
  NamespaceReleaseResponse,
  NamespaceView,
  SyncResponse,
  TunnelView,
} from "./types.js";

export class ApiClient {
  constructor(private readonly config: AgentConfig) {}

  async getMe(): Promise<MeResponse> {
    return this.request("/api/v1/me");
  }

  async registerDevice(): Promise<{ deviceId: string }> {
    const { buildDeviceRegistration } = await import("./device.js");
    return this.request("/api/v1/devices/register", {
      method: "POST",
      body: JSON.stringify(buildDeviceRegistration(this.config)),
    });
  }

  async syncTunnels(): Promise<SyncResponse> {
    return this.request("/api/v1/tunnels/sync", {
      method: "POST",
      body: JSON.stringify({
        deviceId: this.config.deviceId,
        desiredTunnels: this.config.desiredTunnels,
      }),
    });
  }

  async listTunnels(): Promise<TunnelView[]> {
    const response = await this.request<{ tunnels: TunnelView[] }>("/api/v1/tunnels");
    return response.tunnels;
  }

  async listNamespaces(): Promise<NamespaceView[]> {
    const response = await this.request<{ namespaces: NamespaceView[] }>("/api/v1/namespaces");
    return response.namespaces;
  }

  async releaseNamespace(subdomain: string): Promise<NamespaceReleaseResponse> {
    return this.request(`/api/v1/namespaces/${encodeURIComponent(subdomain)}`, {
      method: "DELETE",
    });
  }

  async createAccessHost(
    subdomain: string,
    label: string,
  ): Promise<{ accessHost?: NamespaceAccessHostView; namespace?: NamespaceView }> {
    return this.request(`/api/v1/namespaces/${encodeURIComponent(subdomain)}/access-hosts`, {
      method: "POST",
      body: JSON.stringify({ label }),
    });
  }

  async removeAccessHost(
    subdomain: string,
    label: string,
  ): Promise<{ removedHostname: string; namespace?: NamespaceView }> {
    return this.request(`/api/v1/namespaces/${encodeURIComponent(subdomain)}/access-hosts`, {
      method: "DELETE",
      body: JSON.stringify({ label }),
    });
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, this.config.serverOrigin), {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: this.config.token ? `Bearer ${this.config.token}` : "",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}

