# ==============================================================================
# Household Intelligence — Production Container Image (Frontend SPA + Fastify API)
# ==============================================================================
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app

# Copy workspace manifests first for optimal layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.backend.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/tools/package.json ./packages/tools/package.json
COPY packages/agents/package.json ./packages/agents/package.json

RUN pnpm install --frozen-lockfile

# Copy full source and build the frontend production bundle
COPY . .
RUN pnpm --filter @household/web build

# Production runtime stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY --from=build /app /app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/api/health || exit 1

CMD ["pnpm", "--filter", "@household/api", "start"]
