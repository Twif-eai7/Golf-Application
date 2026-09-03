# ── Single build stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy all workspace manifests and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Install all deps, skip postinstall (prisma generate needs schema first)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy full source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package → packages/shared/dist (needed for runtime resolution)
RUN pnpm --filter @fairwaylog/shared run build

# Generate Prisma client now that schema.prisma is present
RUN pnpm --filter @fairwaylog/api exec prisma generate

# Compile API TypeScript → apps/api/dist
RUN pnpm --filter @fairwaylog/api run build

# ── Lean production image ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install prod deps only (no scripts — prisma client copied from build)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled outputs
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Copy Prisma generated client (root-level pnpm store location)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy prisma schema (for any runtime migration calls)
COPY apps/api/prisma ./apps/api/prisma

# Cloud Run sets PORT env var (usually 8080)
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
