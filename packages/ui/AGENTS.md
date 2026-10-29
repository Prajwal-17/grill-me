# Web frontend

- This package is the shared React SPA used by the web and Electron hosts. Keep routing and providers
  in `src/app`, domain code in `src/features/<feature>`, and reusable components,
  API transport, configuration, and client state in `src/shared`.
- Use React Router for navigation and URL state, TanStack Query for server state,
  Zustand for shared client state, and local React state for component state.
- Read browser configuration through `src/shared/config/env.ts`. Validate new
  environment inputs with Zod and never expose backend secrets through `VITE_*`.
- Preserve existing URLs, per-environment storage keys, and profile scoping.
- Use `bun run check-types` and `bun run lint` in this package. The hosts own builds.
  The web host's `bun run test:e2e` uses mocked APIs and an isolated browser profile; it must not
  connect to production services. Run database tests only via the root
  `bun run test:isolated` command.
