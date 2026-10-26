---
name: Grill Me
description: A compact personal development workspace built on shadcn and Radix.
colors:
  overlay-backdrop: "rgb(0 0 0 / 0.4)"
  syntax-light-keyword: "#9c36b5"
  syntax-light-string: "#18794e"
  syntax-light-number: "#9a5400"
  syntax-light-title: "#075fbd"
  syntax-light-name: "#b42318"
  syntax-dark-keyword: "#d6a3ee"
  syntax-dark-string: "#91d5ab"
  syntax-dark-number: "#e5bd82"
  syntax-dark-title: "#8fc3ee"
  syntax-dark-name: "#f19d96"
  light-destructive: "#b42318"
  light-success: "#18794e"
  light-warning: "#946200"
  light-canvas: "#f7f7f7"
  light-surface: "#ffffff"
  light-foreground: "#202020"
  light-elevated: "#ededed"
  light-muted: "#666666"
  light-line: "#e2e2e2"
  light-line-strong: "#929292"
  light-control-border: "#d4d4d4"
  light-control-border-hover: "#aaaaaa"
  light-chrome: "#f7f7f7"
  light-panel: "#f1f1f1"
  light-selection-surface: "#ededed"
  light-selection-ink: "#202020"
  light-focus: "#202020"
  light-action: "#202020"
  light-action-ink: "#f7f7f7"
  light-ember: "#a63a19"
  light-ember-surface: "#fdf4f1"
  dark-destructive: "#ff8c85"
  dark-success: "#6ed6a1"
  dark-warning: "#e8c16a"
  dark-canvas: "#171717"
  dark-surface: "#222222"
  dark-foreground: "#f2f2f2"
  dark-elevated: "#303030"
  dark-muted: "#aaaaaa"
  dark-line: "#383838"
  dark-line-strong: "#7d7d7d"
  dark-control-border: "#414141"
  dark-control-border-hover: "#5a5a5a"
  dark-chrome: "#171717"
  dark-panel: "#2a2a2a"
  dark-selection-surface: "#303030"
  dark-selection-ink: "#f2f2f2"
  dark-focus: "#f2f2f2"
  dark-action: "#f2f2f2"
  dark-action-ink: "#171717"
  dark-ember: "#ffb478"
  dark-ember-surface: "#302623"
  light-action-hover: "#383838"
  light-nav-active: "#e5e5e5"
  light-nav-active-ink: "#202020"
  light-overlay: "#ffffff"
  dark-action-hover: "#d8d8d8"
  dark-nav-active: "#303030"
  dark-nav-active-ink: "#f2f2f2"
  dark-overlay: "#2a2a2a"
typography:
  title:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3333
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  prose-heading:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5556
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  supporting:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5385
  metadata:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  prose:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  code:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6923
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  control-gap: "8px"
  control-inset: "12px"
  mobile-page: "16px"
  desktop-page: "24px"
components:
  button-primary:
    backgroundColor: "{colors.light-action}"
    textColor: "{colors.light-action-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
  button-ghost:
    textColor: "{colors.light-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.lg}"
    padding: "4px 12px"
  navigation-current:
    backgroundColor: "{colors.light-nav-active}"
    textColor: "{colors.light-nav-active-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 10px"
  metadata-badge:
    backgroundColor: "{colors.light-selection-surface}"
    textColor: "{colors.light-selection-ink}"
    typography: "{typography.metadata}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  collection:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.lg}"
---

# Design System: Grill Me

## Overview

**Creative North Star: "Personal development workspace"**

Grill Me is a personal developer practice workspace. Its visual system takes high-level inspiration from T3Code's consistent geometry, tonal surfaces, compact navigation, and settings organization. It adapts those principles to challenge creation, implementation review, quizzes, and revisiting practice.

The workspace preserves the original Grill Me palette from Git: neutral charcoal and white, inverted monochrome action buttons, the full-color mark, and the orange Grill accent. Earlier blue-tinted and navy/cobalt replacements were rejected. Keep the original hue identity. Improve depth through distinct canvas, content, table-header, hover, and overlay lightness; improve control clarity through border and focus contrast. Do not interpret “more color” or the T3Code reference as permission to recolor the application.

**Key Characteristics:**

- Continuous application frame with compact navigation and task toolbars.
- Shared shadcn/Radix controls and semantic light/dark tokens.
- Searchable collections, aligned metadata, and sectioned settings.
- Restrained motion; no page entrance choreography.

## Colors

The normative colors above are extracted from `src/app/globals.css`. Runtime
variables switch on `html[data-theme="dark"]`; stored theme behavior
is unchanged. Component frontmatter describes light defaults; components use
variables, so all states follow the active theme.

- `chrome` and `canvas` frame the workspace. `surface` holds raised content and controls; `overlay` gives floating menus a brighter plane.
- `panel` gives headers and supporting areas a second tonal layer. `elevated`
  identifies hover and grouped controls. `line` and `line-strong` distinguish
  separators from interactive boundaries. Controls use the softer `control-border` at rest, `control-border-hover` on hover, and `focus` for keyboard focus. Resting edges are deliberately subtle, following T3Code; labels, icons, and fills also identify controls. Do not use the strong border for every resting field or button.
- `action` and `action-ink` map to shadcn `primary` / `primary-foreground`.
- `selection-ink` / `selection-surface` map to `brand` / `brand-soft` for current
  settings navigation and selected answers; `focus` maps to `ring`. Main sidebar selection uses neutral `nav-active` with `nav-active-ink`.
- `action-hover` provides an explicit tonal hover state without fading text.
- The original green, amber, and red semantic colors identify difficulty levels and outcomes; labels and icons remain present. Orange remains scoped to Grill
  difficulty through `src/app/styles/grill.css`; syntax highlighting retains its
  separate palette. The brand SVG remains full color.

Existing domain utilities (`bg-surface`, `text-muted`, `border-line`) and shadcn
utilities share the same variables. In this repository `muted` is a text color;
use `panel` or `elevated` for quiet backgrounds.

## Typography

[Inter Variable](https://rsms.me/inter/) is self-hosted for interface and prose,
with normal and true italic WOFF2 files and its SIL Open Font License bundled.
The normal face is preloaded; italic loads only when used. `font-display: swap`
and a system sans fallback keep text visible. The old Plex Sans asset is removed.
Plex Mono remains for code, paths, and file content. Syntax comments use color
rather than synthesized italics; review scores use Inter tabular numerals.

Tailwind role tokens in `globals.css` own the scale; `cn.ts` registers them with
Tailwind Merge so size overrides never swallow text-color classes. At the default
16px root: `text-ui` is 14/21, `text-supporting` 13/20, `text-metadata` 12/18,
`text-reading` 16/28, `text-question` 18/28, `text-section` 20/28, `text-title`
24/32, and `text-code` 13/22. Sizes are rem-based and respect browser text scaling.
Use 400 for reading, 500 for controls and row titles, and 600 for headings. Do not
reintroduce 10–11px labels or arbitrary font-size literals.

Generated Markdown has one heading style owner in `markdown/renderers.tsx`.
Reading text is capped at 70ch, wraps long content, and uses generous paragraph
rhythm. Headings balance their wrapping; prose uses pretty wrapping. Collection
metadata stays compact; long history titles expose their full title. Mobile
inputs/selects stay at least 16px, including component overrides and enlarged
root text. Code disables discretionary ligatures; numeric columns use tabular
figures. Font sizes, weight, and spacing carry hierarchy without recoloring text.

## Layout

The shell fills the dynamic viewport. The 232px desktop sidebar begins at
768px; it collapses immediately, with Ctrl+B preserved. A shadcn Sheet provides
mobile navigation. The content frame has a single left divider, with a 52px
minimum header that wraps actions. Content regions own their scrolling.
The sidebar contains standard navigation, workspace settings, appearance, and
account controls; challenge collections belong in the main content.

Collections use 16px mobile and 24px desktop gutters, compact toolbars, one
bordered result region, and a quiet result count. Challenges and quizzes group
search with filters and a sort control; narrow screens stack these controls.
History uses a fixed-layout semantic table that gives the title the remaining
width, while diagnostic tables scroll internally when their columns cannot fit.

Home uses a 760px composer column with recent active builds beneath it. Task
workspaces retain Overview, Submit, Reviews, and Quizzes. Reading/submission
areas are constrained to approximately 880px. The optional reference is 340px
wide above the 1180px workspace breakpoint, and a drawer below it. File previews
retain their existing wide-panel and full-screen controls.

Preferences use a 160px section navigation column beside a form up to 760px
wide, inside an 1100px page. On mobile, section navigation becomes a horizontal
row and fields stack. Profile, Practice, Projects, and Code reviews remain
mounted so switching sections preserves drafts. Saving reveals and focuses any
invalid field, including one in a hidden section.

## Elevation & Depth

Most depth comes from tonal separation and 1px borders. Forms and collections
have no ambient card shadows. Menus/popovers use the existing shadcn overlay
shadows; dialogs and sheets remain portaled. Focus is visible independently of
hover. Inputs use a focused border plus a 2px translucent ring. Buttons, inputs, textareas, and select triggers share 8px corners; table and menu dividers remain 1px and quiet.

Press feedback uses 120ms easing and pointer-only scale 0.97. Disabled controls
and popup anchors never shrink. Navigation and tab colors use 100ms; repeated
keyboard interactions are immediate. Shared CSS motion classes own the timing:

- Menus, selects, popovers, context menus and tooltips: 160ms in / 100ms out,
  opacity plus scale 0.98 from their Radix transform origin. Subsequent tooltips
  open instantly during the skip-delay window.
- Dialogs: 180ms in / 120ms out from the center. Backdrops fade at the same pace.
- Sheets: 200ms in / 140ms out from their edge. Desktop sidebar toggles are immediate.
- Copy and save acknowledgements draw a check in 180ms. Copy resets after 1.8s
  and reserves label width so adjacent actions stay still.
- Uploaded attachments and notifications use the existing Motion presence runtime:
  160ms entrance, 100ms exit, at most 6px travel. The final upload row finishes
  its exit before the empty list disappears; file keys remain stable by upload ID.
- Disclosure and select chevrons use the shared 160ms ease-out.

CSS portals and Motion components share keyboard/reduced-motion policy through
`InteractionMotionProvider`. Both paths show final state and feedback immediately,
with no scaling or travel. No page-load choreography, list stagger, animated
layout dimensions, new animation dependency, or permanent `will-change`.

## Shapes

The shared radius scale is 4 / 6 / 8 / 12px. Controls and navigation use 6px;
collections and field groups use 8px; composers and larger overlays may use
12px. Line icons use Lucide with consistent 14–16px sizes. Pills are limited to
compact status treatments. No decorative gradients, glass, or technical motifs.

## Components

The core library is shadcn/ui, adapted around Radix, CVA, and Tailwind. Source
lives in `src/shared/components/ui`; `components.json` declares a Vite SPA
(`rsc: false`) and points to `src/app/globals.css`. Extend these shared primitives
rather than installing a second component vocabulary. Configuration reference:
[shadcn components.json](https://ui.shadcn.com/docs/components-json).

- **Buttons:** primary for the main commit action, secondary for ordinary actions,
  ghost for low-priority controls. Default height is 44px on mobile and 32px on
  desktop; inputs/selects are 44px / 36px. Explicit small variants remain compact.
- **Fields:** visible labels, surface backgrounds, shared hover/focus/invalid
  styles, and retained limits. `SearchField` composes the input with search and
  clear affordances. `PreferenceRow` aligns labels and controls without arbitrary
  left margins. Custom multi-select and model choices retain their existing behavior.
- **Collections:** `Table` supplies the semantic table primitives;
  `CollectionToolbar` and `CollectionSummary` supply recurring framing. Domain
  collections retain suitable responsive layouts. Search/filter empty states
  offer reset; actual empty states expose the relevant creation action.
- **Quizzes:** generation appears inline. Opening creation keeps an active
  attempt mounted and registered for autosave. Collection state persists in the
  existing per-profile namespace and in URL parameters; unrelated URL state is
  preserved. Resume, retake, recovery, deletion/restore, and scoring are unchanged.
- **Feedback:** initial loads use layout-specific skeletons for collections,
  preferences, build/quiz details, reviews, source files, folders, and recent builds.
  They use static surface blocks, reserve geometry immediately, and reveal after
  180ms (120ms fade) so fast responses do not flash placeholders. Real data renders
  as soon as it arrives; it is never held for a minimum loading duration. Keep
  navigation, filters, and table headers stable. Challenge collections load
  independently; log pagination retains previous rows within the same profile.
  Background folder refreshes keep loaded entries. Errors offer retry, save
  feedback uses an aria-live region, and disabled controls stay distinct.
- **Overlays:** menus, dialogs, sheets, confirmations, and tooltips share the
  primitive palette, radius, focus behavior, and portal layering.

## Do's and Don'ts

- Do use shared semantic tokens and shadcn primitives for new controls.
- Do keep filters next to their collection and metadata aligned across rows.
- Do preserve product behavior, local profile scoping, storage keys, and URLs.
- Do test populated, empty, error, loading, keyboard, mobile, and both theme states.
- Don't turn the personal workspace into a team dashboard or marketing page.
- Don't add decoration, oversized headings, nested cards, or redundant instructions.
- Don't use monospace to make ordinary labels look technical.
- Don't infer completion from a review score or change quiz autosave semantics.
