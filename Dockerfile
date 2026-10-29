FROM oven/bun:1.4.2 AS base
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages ./packages
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
RUN bun install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages

FROM base AS backend
RUN bun install --global @openai/codex@0.153.4
WORKDIR /app/apps/backend
RUN bun run build
EXPOSE 17017
ENV NODE_ENV=production APP_ENV=production API_HOST=0.0.0.0 API_PORT=17017 CODEX_HOME=/codex-state
CMD ["bun", "run", "start"]

FROM base AS web-build
ARG VITE_API_URL=/api
ARG VITE_APP_ENV=production
ENV VITE_API_URL=$VITE_API_URL VITE_APP_ENV=$VITE_APP_ENV
WORKDIR /app/apps/web
RUN bun run build

FROM nginx:stable-alpine AS web
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 17018
