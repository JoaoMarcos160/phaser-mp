FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Production image
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY server-bun.ts index-bun.html ./

USER bun
EXPOSE 3000

CMD ["bun", "run", "server-bun.ts"]
