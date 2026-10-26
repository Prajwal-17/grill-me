# UI revamp implementation checklist

## Direction

Rebuild Grill Me as a compact personal development workspace. T3Code is the
reference for tonal hierarchy, consistent control geometry, restrained borders,
sidebar organization, and settings composition—not a screen-for-screen template.
Use shadcn/Radix primitives throughout. Preserve the original charcoal/white
palette, monochrome action buttons, full-color logo, and orange Grill accent.
Improve surface lightness, border clarity, and state contrast within those hues.
Use local Inter Variable for interface/prose and retain Plex Mono for code and paths.

The user's latest explicit correction rejects replacement palettes. The earlier
blue and navy interpretations in this task were incorrect and are superseded.
The existing redesign layouts remain; this correction is limited to palette and
state refinement.

### Direction contract

- THESIS: Make creating, finding, and completing personal practice work feel like
  operating a coherent developer workspace.
- OWN-WORLD: T3Code-inspired tonal hierarchy, original neutral charcoal/white
  surfaces, monochrome interaction states, Inter/Plex Mono typography, and Lucide icons.
- STORY: Choose or resume work, read the task, implement in an editor, submit for
  review, test understanding, and revisit past work.
- FIRST VIEWPORT: Persistent navigation and a compact page toolbar; collection
  routes expose filters and rows immediately; settings expose section navigation
  and aligned fields; home exposes the composer and recent work.
- FORM: Operate mode; code-led implementation. `seed:05ff340147fd28bc` was run;
  the user's pinned T3Code reference governs the direction over random alternatives.

## Audit and planning

- [x] Inspect routes, existing shadcn primitives, current design docs, and screenshot evidence.
- [x] Study T3Code source: semantic geometry in `index.css`, layered neutral theme,
      sidebar organization, and grouped settings rows.
- [x] Read Impeccable and Emil Kowalski design guidance.
- [x] Establish the replacement design and implementation boundaries.

## Foundation and application frame

- [x] Correct the shadcn Vite configuration and document component conventions.
- [x] Replace light/dark color tokens; unify spacing, control sizes, typography,
      borders, radii, focus, selected, hover, loading, disabled, and error states.
- [x] Rebuild sidebar/header hierarchy with compact navigation and useful workspace context.
- [x] Add shared page, collection toolbar, empty-state, and settings layout patterns.
- [x] Preserve responsive navigation, accessible names, keyboard use, reduced
      motion, route URLs, profile scope, and theme storage.

## Collections and settings

- [x] Challenges: searchable, filterable, sortable collection; compact aligned
      metadata; status tabs and counts; useful empty/filter-reset states.
- [x] Quizzes: cohesive creation/list layout and controls; sorting/filtering;
      retain standalone/challenge context, attempt resume/retake and autosave recovery.
- [x] Preferences: section navigation for profile, practice, projects, and model;
      consistent field rows; eliminate arbitrary left offsets and long blank gutters;
      preserve unsaved edits, resume import, validation, and persistence.
- [x] Profile entry: concise local workspace selection using the new primitives.

## Work surfaces

- [x] Home/create: focused composer and practical recent-work navigation.
- [x] Practice: consistent tab toolbar, task reading measure, submission, reviews,
      reference/files panels, and status hierarchy.
- [x] History: consistent filters, results, details, and progress layout.
- [x] Logs: dense readable diagnostics, filters, pagination, and payload details.
- [x] Ensure dialogs, menus, sheets, errors, and empty states share the same system.

## Validation and handoff

- [x] Run frontend typecheck, lint, production build, and mocked Playwright suite.
- [x] Add meaningful coverage for new filtering/sorting and settings navigation.
- [x] Capture and inspect changed surfaces at desktop/mobile sizes, light/dark,
      plus populated, empty, and error states where fixtures support them.
- [x] Run Impeccable detector once on the finished UI, assess its findings.
- [x] Obtain an independent review using GPT-6 Luna or GPT-6.1 Sol; fix material findings.
- [x] Replace DESIGN.md, update PRODUCT.md and design.json to match the implementation.
- [x] Record outcomes and any remaining limits in this checklist.

## Outcome

The shadcn-based redesign is implemented across the application shell, collections,
preferences, creation/practice workspace, history, logs, and profile entry. Both
themes and responsive layouts use the documented semantic design system.

TypeScript, ESLint, production build, and all 24 mocked production Playwright tests
pass. Independent visual review identified one keyboard-focus issue after quiz
generation; it was fixed and covered by a passing regression test. Final design
documentation was checked against source.

Screenshots and the interactive gallery are in `artifacts/ui-revamp/`. Captures use
mocked data and do not establish live backend behavior. Existing large-bundle
warnings remain for syntax and practice modules. Detailed evidence and review
findings are in `artifacts/ui-revamp/VALIDATION.md` and `REVIEW.md`.

## Ownership

- Main agent: design foundation, shared layouts/primitives, shell, home/practice,
  history/logs, profile entry, integration and final validation.
- GPT-6.1 Sol (high reasoning): challenges, quizzes, preferences and their domain
  components; new behavior tests in a dedicated e2e file. No shared primitive or
  global stylesheet edits, no backend/API contract changes.
- Independent reviewer: evidence-based visual/accessibility/behavior review once
  the build is integrated.

## Original-palette restoration after explicit correction

- [x] Recover the original colors from Git, rather than deriving another replacement.
- [x] Restore exact original canvas, surface, foreground, muted text, action, and semantic hues.
- [x] Refine table-header/overlay lightness and input-border contrast within the neutral palette.
- [x] Remove navy/cobalt claims from current product and design documentation.
- [x] Validate rendered states, inspect both themes, and share corrected screenshots.

## Border polish

- [x] Match T3Code's subtle resting edges and 8px control corners within the original palette.
- [x] Preserve distinct hover and keyboard-focus states.
- [x] Validate production build and 4 targeted browser tests; inspect and share refreshed captures.

## Typography refinement

- [x] Assess typography independently and run the type-only mechanical scan.
- [x] Install local Inter Variable (normal/italic), retain Plex Mono, and preserve font licensing.
- [x] Establish rem-based type roles across the shared UI and feature components.
- [x] Improve heading hierarchy, metadata readability, Markdown, review prose, and code sizing.
- [x] Verify font loading, narrow layouts, enlarged text, full browser suite, and final screenshots.

## Motion refinement

Preserve the approved palette, typography, and layout. Use T3Code's small press
response, anchored overlay origins, and fast interruption as reference.

- [x] Audit shared primitives and existing motion.
- [x] Feedback: a brief check acknowledgement for copy/save; 120ms pointer feedback.
- [x] Continuity: 160/100ms anchored menus, 180/120ms dialogs, 200/140ms sheets;
      stable trigger geometry and no page-entry animation.
- [x] Attachments and notifications enter/leave with bounded transform/opacity;
      removal of the last attachment must finish before its container disappears.
- [x] Budget: existing Motion only for presence, CSS for controls/overlays;
      no layout animation or permanent will-change. Keyboard/reduced motion instant.
- [x] Verify interruption, focus return, desktop/mobile, and reduced motion;
      capture actual rendered UI and document the shared rules.
