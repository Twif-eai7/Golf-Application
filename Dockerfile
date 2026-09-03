# ── Stage 1: install all workspace dependencies ───────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# ── Stage 2: build shared then API ────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
# Restore installed deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules 2>/dev/null || true
# Copy source
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# 1. Compile shared → packages/shared/dist
RUN pnpm --filter @fairwaylog/shared run build
# 2. Generate Prisma client
RUN pnpm --filter @fairwaylog/api exec prisma generate
# 3. Compile API TypeScript → apps/api/dist
RUN pnpm --filter @fairwaylog/api run build

# ── Stage 3: lean production image ────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate
# Install production deps only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod
# Copy compiled shared dist (needed for @fairwaylog/shared resolution at runtime)
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
# Copy compiled API dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Copy Prisma generated client and schema (for migrations at startup if needed)
COPY --from=build /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY apps/api/prisma ./apps/api/prisma
# Cloud Run injects PORT (usually 8080); config.ts reads process.env.PORT
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
