# Docker Control Plane Deploy

This repo includes a Dockerized deployment path for `apps/control-plane` and `apps/web` with Traefik in front.

## Files

- `docker/control-plane.Dockerfile`
- `docker/web.Dockerfile`
- `compose.control-plane.yml`
- `.env.production.example`
- `traefik/dynamic/base.yml`

## First deploy

1. Copy `.env.production.example` to `.env.production`.
2. Set `BORE_TOKEN_SECRET` to a long random value.
3. Adjust `BORE_SERVER_ORIGIN`, `BORE_WEB_ORIGIN`, `BORE_PUBLIC_DOMAIN`, and `TRAEFIK_ACME_EMAIL` for the real hostname you will use.
4. Start the services:

```bash
docker compose --env-file .env.production -f compose.control-plane.yml up -d --build
```

## Future pulls for a private GitHub repo

Do not store a GitHub token on the server. Use an ephemeral token only for the one command:

```bash
export GITHUB_TOKEN=...
export GIT_ASKPASS=/usr/local/bin/git-askpass-env
export GIT_TERMINAL_PROMPT=0
git pull
unset GITHUB_TOKEN GIT_ASKPASS GIT_TERMINAL_PROMPT
```

## Startup behavior

The Traefik, Bore control-plane, and Bore web containers all use Docker's `restart: unless-stopped`, so they come back automatically after host reboots once created with `docker compose up -d`.

## Routing

- `bore.dk` is served by the Next.js web app.
- `bore.dk/api/v1`, `bore.dk/ws`, `bore.dk/health`, and the CLI auth control-plane endpoints stay routed to the Bore control-plane service.
- Reserved namespaces and child hosts such as `foo.bore.dk` and `api.foo.bore.dk` are written into Traefik's watched config directory and routed to the Bore control-plane service.
