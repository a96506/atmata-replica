# Next.js 16 standalone multi-stage build for Railway.
# One deploy unit: the Next app. Schema migrations are a separate setup step,
# not part of this image's runtime.
# https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile
#
# Note: BuildKit --mount=type=cache is omitted. Railway's BuildKit requires a
# cacheKey-prefixed id for cache mounts; the marginal build-speed win is not
# worth the fragility for day-one. Re-add once a stable cache-key syntax is
# confirmed.

ARG NODE_VERSION=22-slim

# ---- deps: install full node_modules (incl. devDeps for the build) ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# ---- builder: build the standalone server ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure public/ exists even if the repo has none yet, so the runner stage
# can COPY it unconditionally. Forward-compatible when a public/ dir is added.
RUN mkdir -p public
# NEXT_PUBLIC_* vars are inlined at build time. Railway passes service
# variables to the build step, so set them as Railway service variables.
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for security.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# standalone server.js does NOT copy public/ or .next/static automatically.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Writable .next for prerender cache / image cache.
RUN mkdir -p .next && chown -R nextjs:nodejs .next

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
