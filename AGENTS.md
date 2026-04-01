# AGENTS.md

## Package Manager

- Use `pnpm` for all dependency and workspace operations in this repository.
- Do not use `npm` commands such as `npm install`, `npm run`, or `npx` here unless the user explicitly asks for them.
- Use the root scripts through `pnpm`, for example `pnpm install`, `pnpm dev:server`, `pnpm dev:agent`, `pnpm typecheck`, and `pnpm test`.
- Keep `pnpm-lock.yaml` as the source of truth and do not add or update `package-lock.json`.

## Git Hygiene

- Require a linear history when merging into `master`. Do not create merge commits for changes landing on `master`.
- Before merging into `master`, update the branch so it is up to date with the current `master` tip and resolve any divergence first.
- Unless the user explicitly says not to, treat a completed Bore change as requiring the full release flow: merge the finished branch into local `master`, push `master` to `origin/master`, deploy that exact `master` revision to production, verify production, and only then consider the task done.
- Use a non-interactive linear-history merge strategy for `master`, such as rebasing the working branch onto `origin/master` and then fast-forwarding local `master`.
- After a branch has been merged into `master`, delete that merged branch locally and on `origin` if the remote branch still exists.
- Never delete `master` or the currently checked out branch as part of merged-branch cleanup.

## Production Deploy

- Treat a merge into local `master` as incomplete until production has been updated as well.
- After merging to `master`, push `master` to `origin/master` before assuming the change is live.
- Bore production runs on the dedicated VPS at `91.99.163.174` with the repo checked out at `/srv/bore/repo`.
- Update production from `/srv/bore/repo` using `compose.control-plane.yml` and `.env.production`, then verify the live site or health check reflects the change.
- Unless the user explicitly says not to, production deployment is the default final step for Bore changes after tests pass and `master` has been pushed.
- Deploy production from `/srv/bore/repo` only after confirming the server checkout is on `master` and aligned with `origin/master`.
- After deployment succeeds, verify the live service from the workstation, for example with the production health check at `http://91.99.163.174:8787/health` and any relevant Bore web or CLI flow affected by the change.
- After a successful production deploy, unless the user explicitly says not to, run `bore self-update` on this machine so the local CLI picks up the latest released Bore version, then report whether the update succeeded.

## Additional Context

- Tunnel namespace ownership and reuse rules are documented in `docs/tunnel-namespace-behavior.md`. Read it when working on reservation, routing, or CLI reuse behavior.
- Production deployment rule: the dedicated Bore production server must always run the `master` branch. Do not deploy feature branches or local-only commits to production.
- Before any production update for Bore, the required changes must be committed, pushed, and merged into `master`. Use the normal branch/PR flow first, then deploy production from `master`.
