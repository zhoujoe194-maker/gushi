FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 DATABASE_PATH=/app/data/company.sqlite
RUN groupadd --system app && useradd --system --gid app app && mkdir -p /app/data /app/backups && chown -R app:app /app
COPY --from=builder --chown=app:app /app/.next-production/standalone ./
COPY --from=builder --chown=app:app /app/.next-production/static ./.next-production/static
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/runtime ./runtime
COPY --from=builder --chown=app:app /app/scripts ./scripts
COPY --from=builder --chown=app:app /app/app/server/password.ts ./app/server/password.ts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node","scripts/selfhost-healthcheck.mjs"]
CMD ["node","scripts/container-start.mjs"]
