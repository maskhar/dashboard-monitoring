# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Build uses standalone output configured in next.config.ts.
RUN npm run build

FROM node:22-alpine AS runner
ARG APP_VERSION=0.1.0
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.title="Utero Dashboard Monitoring" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$BUILD_REVISION
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TZ=Asia/Jakarta \
    APP_VERSION=$APP_VERSION \
    BUILD_REVISION=$BUILD_REVISION

RUN apk add --no-cache tzdata \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /app/uploads \
    && chown nextjs:nodejs /app/uploads

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts/startup-check.mjs ./startup-check.mjs

USER nextjs
EXPOSE 3000
VOLUME ["/app/uploads"]
CMD ["sh", "-c", "node startup-check.mjs && exec node server.js"]

