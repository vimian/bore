# ACME Challenge Policy

This note documents the Bore TLS policy so the public Bore deployment and any private hostnames do not get mixed together.

## Public Bore Production

- Hosted Bore production runs on the Hetzner VPS `91.99.163.174`.
- Public `bore.dk` traffic is terminated there by Traefik.
- The public Traefik deployment uses ACME `http-01` and should remain on `http-01`.
- Do not add broad DNS provider credentials to the public Hetzner Traefik deployment just to support private-network hostnames.

## Private LAN Hostnames

Example: `s.bore.dk -> 192.168.1.200`

- This is not a Hetzner ingress target. It is a private LAN target.
- The TLS terminator for `s.bore.dk` must run on the private host itself, or on another machine that can reach `192.168.1.200`.
- `http-01` will not work for this case because Let's Encrypt cannot validate a private RFC1918 address over the public internet.
- Use ACME `dns-01` for private LAN-only names.

## Required Isolation

The repo policy is:

- default to `http-01` for the public Bore deployment;
- allow `dns-01` only for explicitly isolated private hostnames;
- the current intended private-host exception is `s.bore.dk`.

To make that isolation real instead of relying on convention:

1. Keep the public record for the private host:

```dns
s.bore.dk. A 192.168.1.200
```

2. Delegate only the ACME validation name for that host:

```dns
_acme-challenge.s.bore.dk. CNAME s-bore-dk.validation.example.net.
```

3. Give the private reverse proxy credentials only for the delegated validation zone.

That keeps certificate automation for `s.bore.dk` separate from the main `bore.dk` zone and avoids handing full-zone DNS mutation rights to the public Bore server.

## Operational Rule

- If a future change wants DNS-01 for any hostname beyond the isolated private-host exception, treat that as a deliberate policy change and update this document and the deployment configuration at the same time.
