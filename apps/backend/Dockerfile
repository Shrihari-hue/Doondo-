# Multi-stage build for the Doondo backend.
#
# Build stage: install all deps (incl. dev) + native build tools for bcrypt,
# compile TS to JS via the build:tsconfig pipeline, then prune devDependencies
# so the runtime stage gets a lean node_modules.
#
# Runtime stage: minimal Alpine image, no build tools, just dist + node_modules
# + package.json so `node dist/index.js` runs.

# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# bcrypt has a native binding; needs python + a C++ toolchain to compile.
RUN apk add --no-cache python3 make g++

# Install dependencies first so Docker can cache this layer until package.json
# actually changes.
COPY package.json ./
RUN npm install --no-audit --no-fund

# Now copy sources and compile.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies so the next stage copies a slim node_modules.
RUN npm prune --omit=dev

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copy only what we need to run: production node_modules, the compiled dist,
# and the manifest. No source, no tsconfig, no dev deps.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 4000

# Healthcheck so hosts that support it (Fly.io, Kubernetes) can verify uptime.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1

CMD ["node", "dist/index.js"]
