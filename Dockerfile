# Pool Forge, as a container.
#
# Three stages so the image that ships carries neither the toolchain nor the
# source: deps installs, build compiles, runtime runs. The result is Next's
# standalone output plus the Prisma engines, and nothing else.

# ---------------------------------------------------------------- deps
FROM node:22-alpine AS deps

# openssl is not optional. Prisma's query engine links against it, and without
# it the container starts, serves a page, and fails on the first query with an
# error that says nothing about openssl.
RUN apk add --no-cache openssl libc6-compat

# Pinned to a major. `pnpm@latest` has shipped versions requiring a newer Node
# than the base image, which fails the install with an engine error that reads
# like a lockfile problem.
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Anything the browser reads is compiled into the bundle here, not read at
# runtime, so a value that arrives only as a Cloud Run env var is a value the
# client never sees. Each one has to be a build argument, a Cloud Build
# substitution and a deploy flag, or it silently bakes its default.
ARG NEXT_PUBLIC_APP_URL=""
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Where the browser opens its voice socket. Absent, `VoiceDock` reports the
# feature unavailable and renders nothing at all, which is correct and is
# exactly what shipped: a working agent that nobody could see.
ARG NEXT_PUBLIC_VOICE_RELAY_URL=""
ENV NEXT_PUBLIC_VOICE_RELAY_URL=$NEXT_PUBLIC_VOICE_RELAY_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone

RUN pnpm prisma generate
RUN pnpm build

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run sends traffic to $PORT and this is the documented default.
ENV PORT=8080

# Never root. A container that is compromised should not also be privileged.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# The schema and the migrations travel with the image so a release applies its
# own. The generated client and its engine are already inside `standalone`:
# Next traces them, and under pnpm they live at a .pnpm path rather than at
# node_modules/.prisma, which is why copying that path fails.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]

# ---------------------------------------------------------------- migrate
# Migrations run from their own image rather than the serving one.
#
# The Prisma CLI needs its whole dependency tree, and pulling that into the slim
# runtime meant copying pnpm's internal paths package by package: it fell over
# on the first transitive dependency and would have fallen over again on the
# next version bump. The build stage already has a working install, so the job
# uses that and the service keeps its small image.
FROM build AS migrate
ENV NODE_ENV=production
CMD ["pnpm", "prisma", "migrate", "deploy"]
