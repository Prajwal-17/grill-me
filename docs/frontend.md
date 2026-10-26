# Frontend development

The frontend is a client-rendered React application built with Vite. The Hono
backend owns all API operations, streaming, file uploads, database access, and AI
requests. No Next.js runtime, server components, or server routes remain.
TypeScript and the existing feature components are retained.

## Local development

```sh
bun install --frozen-lockfile
# On a new checkout:
cp apps/web/.env.local.example apps/web/.env.local
bun dev
```

Vite listens on port 8028 and the development API on 8027. The frontend port is
strict: if it is occupied, Vite fails instead of silently changing the origin
that the backend allows. To run just the frontend against an already running
development API, use `bun run --cwd apps/web dev`.

For an existing checkout, rename `NEXT_PUBLIC_API_URL` to `VITE_API_URL` and
`NEXT_PUBLIC_APP_ENV` to `VITE_APP_ENV` in the web `.env.local`. The old variable
names are no longer read. Development defaults work without a web environment
file. Vite environment files belong to `apps/web`; backend files are separate.
After changing environment variables, restart Vite.

The Vite plugin provides React Fast Refresh. Feature routes load lazily. Saving a
component normally updates that component while retaining its local state;
changing non-component exports can invalidate a module and reload the page.

## Layout and state ownership

```text
apps/web/
  index.html              # Document metadata, favicon, application entry
  public/                 # Assets served without transformation
  src/
    main.tsx              # React root and global CSS
    app/                  # Providers, router, route adapters, application CSS
    assets/fonts/         # Bundled IBM Plex fonts and license
    features/<feature>/   # Domain API functions, components, hooks, pages, stores
    shared/
      components/         # Layout, UI primitives, Markdown, theme controls
      config/             # Zod environment schema and browser configuration
      lib/                # API/stream transport and utilities
      stores/             # Shared client state
      types/              # API response types
  e2e/                    # Playwright tests and mocked API fixtures
```

- **React Router** owns navigation, route parameters, search parameters, and
  browser history. Query-only navigation (such as workspace tabs) uses the router.
- **TanStack Query** owns API data, mutation state, cache invalidation, and polling.
  Its existing cache keys, retry policy, and profile-scoped data are retained.
- **Zustand** owns cross-component client state and persisted profile, theme, and
  sidebar preferences. Component-only state stays in React hooks.
- **Zod** validates the public environment at startup/build time and in the client.
  Browser configuration is read only through `shared/config/env.ts`.

Existing paths remain `/`, `/chat?id=...`, `/challenges`, `/quizzes`, `/history`,
`/preferences`, `/logs`, and `/logs/:id`. `/chat` without an ID and `/chat?new=1`
redirect home. Unknown paths have a recovery page. Fonts are bundled by Vite,
and a small inline script restores the saved theme before the first paint.

The storage namespaces remain `grill-me.app.<environment>`,
`grill-me.quiz.<environment>.<profile>.<attempt>`, and
`grill-me.quiz-library.<environment>.<profile>`. No storage or database migration
is needed for this frontend change.

## Verification

```sh
bun run check
bun run build
bun run test:isolated
cd apps/web
bunx playwright install chromium
bun run test:e2e
bun run test:e2e:build
```

The browser suites start their own server on `127.0.0.1:18028`, use a disposable
browser context and the `test` storage namespace, and intercept all API calls to
`127.0.0.1:18027`. Unexpected external requests are blocked and fail the test.
They do not start a backend, call an AI provider, or access a database. The first
suite exercises Vite development; the second exercises a freshly built bundle.
Tests use `.pw.ts` filenames so Bun's unit-test runner does not execute them.
The root isolated test runner creates and removes its own PostgreSQL container.

## Static builds and Docker

`bun run --cwd apps/web build` type-checks and writes `apps/web/dist`.
`bun run --cwd apps/web preview` serves that build locally on port 8028 for
inspection. Vite preview is a development tool, not the Docker runtime.

The Docker `web-build` stage builds the frontend and the final `web` stage serves
only its static files using Nginx on port 17018. The backend image is unchanged.
`VITE_API_URL` and `VITE_APP_ENV` are build arguments; changing them requires a
new image. Compose passes the existing production API URL and environment, so
production URLs and stored profile state remain compatible when deployed later.

Nginx falls back to `index.html` for client routes, allowing direct loads and
refreshes of nested URLs. The shell is revalidated on each request; fingerprinted
assets receive immutable caching and missing assets return 404. Other static
hosts must provide the same SPA fallback.

A web-only development smoke image can be built without starting Compose or
accessing its backend/database:

```sh
docker build --target web \
  --build-arg VITE_API_URL=http://localhost:8027 \
  --build-arg VITE_APP_ENV=development \
  -t grill-me-web-dev .
docker run --rm -p 127.0.0.1:18028:17018 grill-me-web-dev
```

This runs the optimized static bundle against the development API. Use `bun dev`
for hot reloading. The Compose files in this repository describe the production
stack; frontend development and tests do not require starting or restarting it.
