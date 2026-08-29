# The voice relay, as a container.
#
# Built from the repository root, because the bundle is produced from
# `src/modules/voice/relay` by the repo's own esbuild script rather than from
# anything in this directory:
#
#   docker build -f services/voice-relay/Dockerfile .
#
# The app cannot host this. A WebSocket is one long request, and the app's own
# target does not keep those open, so the relay is a service of its own with its
# own timeout and its own concurrency ceiling.

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
# One CommonJS file. `@google/genai` and `ws` are left external on purpose: the
# SDK resolves its own subpaths at runtime, and bundling it produces a file that
# resolves nothing.
RUN pnpm voice:build

# Installed with npm rather than pnpm, into a directory of their own. pnpm's
# node_modules is a tree of symlinks into a content-addressed store, so copying
# it into another image copies links pointing at nothing. This is the same trap
# that made copying the Prisma client fail in the app's own Dockerfile.
RUN mkdir /deps && cd /deps && npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund \
     "@google/genai@$(node -p "require('/app/package.json').dependencies['@google/genai']")" \
     "ws@$(node -p "require('/app/package.json').dependencies['ws']")"

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
# Cloud Run sends traffic to $PORT and this is the documented default.
ENV PORT=8080

# Never root.
RUN addgroup -g 1001 -S nodejs && adduser -S relay -u 1001

COPY --from=build --chown=relay:nodejs /deps/node_modules ./node_modules
COPY --from=build --chown=relay:nodejs /app/services/voice-relay/dist ./dist

USER relay
EXPOSE 8080

CMD ["node", "dist/main.cjs"]
