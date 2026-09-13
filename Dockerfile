FROM oven/bun:1.4.2 AS base
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages ./packages
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --frozen-lockfile
COPY apps ./apps

FROM base AS backend
RUN bun install --global @openai/codex@0.153.4
WORKDIR /app/apps/backend
ENV API_HOST=0.0.0.0 API_PORT=8017 CODEX_HOME=/codex-state
CMD ["bun", "run", "start"]

FROM base AS web
ARG NEXT_PUBLIC_API_URL=http://localhost:8017
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
WORKDIR /app/apps/web
RUN bun run build
CMD ["bun", "run", "start"]
