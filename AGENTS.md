# AGENTS.md

## Package Manager

- Use `pnpm` for all dependency and workspace operations in this repository.
- Do not use `npm` commands such as `npm install`, `npm run`, or `npx` here unless the user explicitly asks for them.
- Use the root scripts through `pnpm`, for example `pnpm install`, `pnpm dev:server`, `pnpm dev:agent`, `pnpm typecheck`, and `pnpm test`.
- Keep `pnpm-lock.yaml` as the source of truth and do not add or update `package-lock.json`.

## Git Hygiene

- Require a linear history when merging into `master`. Do not create merge commits for changes landing on `master`.
- Before merging into `master`, update the branch so it is up to date with the current `master` tip and resolve any divergence first.
- After a branch has been merged into `master`, delete that merged branch locally and on `origin` if the remote branch still exists.
- Never delete `master` or the currently checked out branch as part of merged-branch cleanup.

## Production Deploy

- Treat a merge into local `master` as incomplete until production has been updated as well.
- After merging to `master`, push `master` to `origin/master` before assuming the change is live.
- Bore production runs on the dedicated VPS at `91.99.163.174` with the repo checked out at `/srv/bore/repo`.
- Update production from `/srv/bore/repo` using `compose.control-plane.yml` and `.env.production`, then verify the live site or health check reflects the change.

## Additional Context

- Tunnel namespace ownership and reuse rules are documented in `docs/tunnel-namespace-behavior.md`. Read it when working on reservation, routing, or CLI reuse behavior.
- Production deployment rule: the dedicated Bore production server must always run the `master` branch. Do not deploy feature branches or local-only commits to production.
- Before any production update for Bore, the required changes must be committed, pushed, and merged into `master`. Use the normal branch/PR flow first, then deploy production from `master`.
