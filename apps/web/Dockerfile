# syntax=docker/dockerfile:1
# Next.js 16 web app. Build from the REPO ROOT so the pnpm workspace and
# packages/core are in the context:
#   docker build -f apps/web/Dockerfile -t gigsnano-web .
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so they
# arrive as --build-arg; changing them means rebuilding the image.
# Debian slim base (glibc) — avoids sharp's musl/alpine native-binary friction.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate

# ---- deps: install the web app's workspace deps from the frozen lockfile ----
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@gigsnano/web..."

# ---- builder: produce the standalone Next.js server ----
FROM deps AS builder
COPY apps/web apps/web
COPY packages/core packages/core
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_USE_MOCKS
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GANTT_DHTMLX
ARG NEXT_PUBLIC_JOURNEY
ARG NEXT_PUBLIC_WORK_ITEM_V2
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG API_PROXY_TARGET
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_USE_MOCKS=$NEXT_PUBLIC_USE_MOCKS
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GANTT_DHTMLX=$NEXT_PUBLIC_GANTT_DHTMLX
ENV NEXT_PUBLIC_JOURNEY=$NEXT_PUBLIC_JOURNEY
ENV NEXT_PUBLIC_WORK_ITEM_V2=$NEXT_PUBLIC_WORK_ITEM_V2
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV API_PROXY_TARGET=$API_PROXY_TARGET
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @gigsnano/web build

# ---- runner: minimal runtime from the standalone output ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
# In a workspace the standalone tree mirrors the repo: server.js is at apps/web/.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
