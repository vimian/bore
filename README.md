# bore

`bore` is an authenticated tunneling system split into an installable agent, a control plane, and a web console:

- `apps/agent`: the `bore` CLI plus a background daemon that reconnects tunnels on boot.
- `apps/control-plane`: SQLite-backed auth, device/tunnel coordination, the HTTP relay path, and Traefik automation.
- `apps/web`: a Next.js console for Bore account access, CLI approval, and namespace visibility.

## Install

For the hosted Bore service, install the native CLI with:

```bash
curl -sL https://bore.dk/install.sh | bash
```

The installer puts `bore` in `~/.local/bin` by default.
Update an installed client later with:

```bash
bore self-update
```

## App Names

- Client: `apps/agent`
- Server: `apps/control-plane`
- Web console: `apps/web`

## Implemented Behavior

- `bore login` opens a browser-based Bore login flow and stores a local session token.
- `bore up <port>` persists the desired tunnel locally, installs boot persistence, starts the daemon, and syncs the tunnel to the control plane.
- `bore down <port>` removes the local desired tunnel but keeps the subdomain reservation on the server.
- `bore release <namespace>` permanently removes an unused reserved namespace and every child host reserved under it.
- `bore reassign <port>` lets the user move a tunnel to one of their other reserved namespaces or generate a new one.
- `bore ps` and `bore ls` list the user tunnels with `active`, `blocked`, or `offline` state.
- Device handoff is modeled server-side: the most recently claimed online device keeps the subdomain active, older online claims become `blocked`.
- The control plane can relay buffered HTTP traffic and websocket upgrades over a websocket-connected agent.
- New namespaces are generated server-side, but users can later reuse any of their reserved top-level namespaces on other ports or devices when those namespaces are not actively claimed elsewhere.
- Fully deleting a reservation is a separate step: first remove every claim with `bore down`, then run `bore release <namespace>`.
- A reserved subdomain owns its full nested namespace, so `pia.example.com`, `api.pia.example.com`, and `*.pia.example.com` route to the same active client.
- When the control plane runs with `BORE_TLS_MODE=acme`, public traffic is HTTPS-only and the agent relay uses `wss://`.
- Users have a reservation limit stored alongside their account record. The default is `2`.
- Users also have a per-account child-host limit stored in SQLite. The default is `5`.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Start the control plane in development:

```bash
BORE_SERVER_ORIGIN=http://localhost:8787
BORE_PUBLIC_DOMAIN=example.com
BORE_TOKEN_SECRET=change-me
pnpm dev:server
```

For production with automatic DNS + Let's Encrypt wildcard certificates:

```bash
BORE_SERVER_ORIGIN=https://bore.example.com
BORE_PUBLIC_DOMAIN=example.com
BORE_TOKEN_SECRET=change-me
BORE_TLS_MODE=acme
BORE_ACME_EMAIL=ops@example.com
BORE_DNS_COMMAND=/opt/bore/bin/dns-hook
BORE_INGRESS_RECORD_TYPE=CNAME
BORE_INGRESS_RECORD_VALUE=bore.example.com
PORT=443
BORE_HTTP_PORT=80
pnpm dev:server
```

3. Start the web console in another shell:

```bash
BORE_CONTROL_PLANE_ORIGIN=http://localhost:8787
BORE_PUBLIC_DOMAIN=example.com
pnpm dev:web
```

4. Start using the agent in another shell:

```bash
pnpm dev:agent login
pnpm dev:agent up 3000
pnpm dev:agent ps
```

When using the public hosted service, the agent defaults to `https://bore.dk`.
When developing against a local control plane instead, point the agent at your local server:

```bash
BORE_SERVER_ORIGIN=http://localhost:8787 pnpm dev:agent login
```

## Package Manager

- This repo uses `pnpm` only.
- Prefer `pnpm install`, `pnpm dev:server`, `pnpm dev:web`, `pnpm dev:agent`, `pnpm typecheck`, and `pnpm test`.

## License

This repository is source-available under `BUSL-1.1`.

The Additional Use Grant allows:

- personal use; and
- internal company use.

A separate commercial license is required for:

- resale or sublicensing;
- SaaS, hosted, or managed services for third parties; and
- paid wrappers, paid add-ons, OEM use, commercial distribution, or other commercial offerings built on top of this code where this code is a material underlying component.

See `LICENSE` and `COMMERCIAL-LICENSE.md` for the governing terms.

## Notes

- Production TLS is now built into the control plane through ACME DNS-01, but it requires a DNS hook command.
- The DNS hook is called with `BORE_DNS_ACTION`, `BORE_DNS_NAME`, `BORE_DNS_TYPE`, `BORE_DNS_VALUE`, and `BORE_DNS_TTL`.
- Set `BORE_INGRESS_RECORD_VALUE` to automatically create both `<subdomain>.<domain>` and `*.<subdomain>.<domain>` DNS records for each reserved tunnel namespace.
- The server-to-agent path stays on the existing websocket relay. With an `https://` server origin it upgrades to `wss://`, which keeps the relay encrypted without adding SSH session overhead.
- Plain HTTP requests still buffer request/response bodies in memory, while websocket upgrades stay open and stream frames between the public client and local app.
- The agent stores its local state under `~/.bore/`.
- `bore login --server <origin>` overrides the saved server origin for that login and persists the new value.
- `apps/web` and `apps/control-plane` both default to the shared SQLite database at `.data/bore.sqlite` when `BORE_DB_PATH` is not set.
- The web console uses its own session cookie plus control-plane API calls for namespace actions and CLI approval.
