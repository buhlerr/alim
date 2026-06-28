# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time args (Coolify injeta essas)
ARG DATABASE_URL
ARG NEXT_PUBLIC_*=*

# Roda as migrações AQUI, durante o build
RUN npx prisma migrate deploy

# Build da aplicação
RUN npm run build

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copia APENAS o client gerado (necessário em runtime)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Não precisa mais do Prisma CLI aqui!
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

EXPOSE 3000
USER nextjs

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
