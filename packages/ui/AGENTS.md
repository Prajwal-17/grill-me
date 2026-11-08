# UI package

This package is the shared React SPA rendered by Electron. There is no separate
web host; `apps/desktop` owns the window, build, and packaging. Read the root
[`AGENTS.md`](../../AGENTS.md), [`PRODUCT.md`](PRODUCT.md), and
[`DESIGN.md`](DESIGN.md) before changing behavior or visuals.

## Structure

- Keep routing and providers in `src/app`, domain code in
  `src/features/<feature>`, and reusable components, transport, configuration,
  and shared state in `src/shared`.
- Feature folders own their `api`, `components`, `hooks`, `lib`, `pages`,
  `stores`, and `types` pieces. Import through the `@/` alias; do not create
  cross-feature internals.
- Use React Router for navigation and URL state, TanStack Query for server
  state, Zustand for shared client state, and local React state for component
  state. Preserve existing URLs, per-edition storage keys, and profile scoping.

## Transport and desktop integration

- Read browser configuration through `src/shared/config/env.ts`. Validate new
  inputs with Zod and never expose backend secrets through `VITE_*`.
- Use `apiRequest` and `streamRequest` for domain data so the desktop WebSocket
  transport, profile header, and error mapping stay consistent. Do not call
  `fetch` directly for application data.
- Desktop-only behavior must check `window.desktopBridge` and degrade clearly
  when it is absent. The preload bridge is the only native boundary; do not use
  Node or Electron APIs from the renderer.

## Interface rules

- Reuse the shadcn/Radix primitives in `src/shared/components/ui` and the
  semantic tokens in `src/app/globals.css`. Do not add a second component
  vocabulary, arbitrary colors, or one-off font sizes.
- Follow the compact workspace layout and motion rules in `DESIGN.md`. Keep page
  actions in content, preserve keyboard access, visible focus, reduced-motion
  behavior, and mobile touch targets.
- Generated Markdown, forms, empty/error/loading states, and background
  generation notifications have existing owners (`markdown/renderers.tsx`,
  `feedback.tsx`, `loading-layouts.tsx`, `generation-monitor.tsx`). Extend those
  patterns instead of duplicating them.
- Do not infer completion from a review score, change quiz autosave semantics,
  or add team/project-management concepts.

## Verification

- Use `bun run check-types` and `bun run lint` in this package; the root
  `bun run check` covers formatting too.
- Run database and runtime tests only through the root `bun run test:desktop`
  command. Browser/Electron E2E suites are intentionally absent.
