# ── Single build stage ────────────────────────────────────────────────────────
FROM node:22-alpine AS build
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
# Patch compiled dist: add .js extensions to relative imports (Node.js ESM requires them)
# Source files omit .js for Metro/React Native compatibility
RUN for f in packages/shared/dist/*.js; do \
      sed -i 's|from "./constants"|from "./constants.js"|g' "$f"; \
      sed -i 's|from "./schemas"|from "./schemas.js"|g' "$f"; \
      sed -i 's|from "./scoring"|from "./scoring.js"|g' "$f"; \
    done

# Generate Prisma client now that schema.prisma is present
RUN pnpm --filter @fairwaylog/api exec prisma generate

# Compile API TypeScript → apps/api/dist
RUN pnpm --filter @fairwaylog/api run build

# ── Lean production image ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner
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

# Copy prisma schema + migrations (needed for migrate deploy at startup)
COPY apps/api/prisma ./apps/api/prisma

# Cloud Run sets PORT env var (usually 8080)
EXPOSE 8080
WORKDIR /app/apps/api
# Migrate against the direct DB URL (pooler URLs cannot run DDL), then start
CMD ["sh", "-c", "DATABASE_URL=\"${DIRECT_URL:-$DATABASE_URL}\" pnpm exec prisma migrate deploy || echo 'prisma migrate deploy failed — continuing'; node dist/index.js"]
