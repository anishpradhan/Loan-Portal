# syntax=docker/dockerfile:1
# Loan Portfolio Monitor — production image (Next.js standalone + Chromium for PDF export)

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- deps -------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
# Isolated Prisma CLI (with its own dependencies) for `migrate deploy` at runtime
RUN mkdir /prisma-cli && cd /prisma-cli && npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev "prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")"

# ---- build ------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate \
 && npm run build \
 && npx esbuild scripts/seed.ts scripts/import-workbook.ts \
      --bundle --platform=node --target=node22 --format=cjs \
      --conditions=react-server --tsconfig=tsconfig.json \
      --external:@prisma/client --external:.prisma --external:playwright-core \
      --outdir=dist-scripts

# ---- runtime ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CHROMIUM_PATH=/usr/bin/chromium \
    UPLOAD_DIR=/app/data/uploads

# Chromium renders PDF reports; Inter/DejaVu fonts make the PDF match the screen.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-inter fonts-dejavu-core openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system app && useradd --system --gid app --home /app app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/dist-scripts ./scripts
# Prisma client/engine for the app and seed script; separate CLI for migrations
COPY --from=build --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps --chown=app:app /prisma-cli/node_modules ./prisma-cli/node_modules
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh && mkdir -p /app/data/uploads && chown -R app:app /app/data
USER app
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "server.js"]
