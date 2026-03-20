# AGENTS.md

## Package Manager

- Use `pnpm` for all dependency and workspace operations in this repository.
- Do not use `npm` commands such as `npm install`, `npm run`, or `npx` here unless the user explicitly asks for them.
- Use the root scripts through `pnpm`, for example `pnpm install`, `pnpm dev:server`, `pnpm dev:agent`, `pnpm typecheck`, and `pnpm test`.
- Keep `pnpm-lock.yaml` as the source of truth and do not add or update `package-lock.json`.

## Additional Context

- Tunnel namespace ownership and reuse rules are documented in `docs/tunnel-namespace-behavior.md`. Read it when working on reservation, routing, or CLI reuse behavior.
