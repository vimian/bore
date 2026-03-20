# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/control-plane/package.json apps/control-plane/tsconfig.json ./apps/control-plane/
RUN pnpm install --frozen-lockfile --filter @bore/control-plane...

FROM deps AS build
COPY apps/control-plane/src ./apps/control-plane/src
RUN pnpm --filter @bore/control-plane build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV BORE_DB_PATH=/data/bore.sqlite
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/control-plane ./apps/control-plane
RUN useradd --create-home --uid 10001 bore \
  && mkdir -p /data \
  && chown -R bore:bore /data /app
USER bore
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8787') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/control-plane/dist/src/index.js"]
