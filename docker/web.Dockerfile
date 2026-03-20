# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/
RUN pnpm install --frozen-lockfile --filter web...

FROM deps AS build
COPY apps/web ./apps/web
RUN mkdir -p /app/apps/web/public \
  && if [ ! -f /app/apps/web/next-env.d.ts ]; then \
    printf '%s\n%s\n\n%s\n' \
      '/// <reference types="next" />' \
      '/// <reference types="next/image-types/global" />' \
      '// This file should not be edited directly.' \
      > /app/apps/web/next-env.d.ts; \
  fi
RUN pnpm --filter web build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV BORE_DB_PATH=/data/bore.sqlite
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
RUN useradd --create-home --uid 10001 boreweb \
  && mkdir -p /data \
  && chown -R boreweb:boreweb /data /app
USER boreweb
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
