---
name: Grill Me
description: Original Grill Me colors with restrained interaction states and the approved workspace layout.
colors:
  "light-destructive": "#b42318"
  "light-success": "#18794e"
  "light-warning": "#946200"
  "light-canvas": "#f7f7f7"
  "light-surface": "#ffffff"
  "light-foreground": "#202020"
  "light-elevated": "#ededed"
  "light-muted": "#666666"
  "light-line": "#e2e2e2"
  "light-line-strong": "#b7b7b7"
  "light-chrome": "#f7f7f7"
  "light-panel": "#ffffff"
  "light-selection-surface": "#ededed"
  "light-selection-ink": "#202020"
  "light-focus": "#202020"
  "light-action": "#202020"
  "light-action-ink": "#f7f7f7"
  "light-ember": "#a63a19"
  "light-ember-surface": "#fdf4f1"
  "dark-destructive": "#ff8c85"
  "dark-success": "#6ed6a1"
  "dark-warning": "#e8c16a"
  "dark-canvas": "#171717"
  "dark-surface": "#222222"
  "dark-foreground": "#f2f2f2"
  "dark-elevated": "#303030"
  "dark-muted": "#aaaaaa"
  "dark-line": "#383838"
  "dark-line-strong": "#616161"
  "dark-chrome": "#171717"
  "dark-panel": "#222222"
  "dark-selection-surface": "#303030"
  "dark-selection-ink": "#f2f2f2"
  "dark-focus": "#f2f2f2"
  "dark-action": "#f2f2f2"
  "dark-action-ink": "#171717"
  "dark-ember": "#ffb478"
  "dark-ember-surface": "#302623"
typography:
  headline:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.75
  body-compact:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "14px"
    lineHeight: "24px"
  label:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  metadata:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "12px"
    lineHeight: "16px"
  code:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "20px"
  file-label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
rounded:
  "sm": "0.25rem"
  "md": "0.375rem"
  "lg": "0.5rem"
  "xl": "0.75rem"
spacing:
  "1": "0.25rem"
  "1.5": "0.375rem"
  "2": "0.5rem"
  "2.5": "0.625rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "7": "1.75rem"
  "8": "2rem"
  "10": "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.light-action}"
    textColor: "{colors.light-action-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
  button-primary-dark:
    backgroundColor: "{colors.dark-action}"
    textColor: "{colors.dark-action-ink}"
  button-secondary:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
  button-secondary-hover:
    backgroundColor: "{colors.light-elevated}"
  button-ghost:
    textColor: "{colors.light-muted}"
    rounded: "{rounded.md}"
    padding: "0 12px"
  button-ghost-hover:
    backgroundColor: "{colors.light-elevated}"
    textColor: "{colors.light-foreground}"
  button-destructive:
    textColor: "{colors.light-destructive}"
    rounded: "{rounded.md}"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.light-panel}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  navigation:
    textColor: "{colors.light-muted}"
    rounded: "{rounded.md}"
    padding: "0 10px"
  navigation-current:
    backgroundColor: "{colors.light-selection-surface}"
    textColor: "{colors.light-selection-ink}"
  navigation-current-dark:
    backgroundColor: "{colors.dark-selection-surface}"
    textColor: "{colors.dark-selection-ink}"
  metadata-badge:
    backgroundColor: "{colors.light-canvas}"
    textColor: "{colors.light-muted}"
    typography: "{typography.metadata}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  metadata-badge-grill:
    backgroundColor: "{colors.light-ember-surface}"
    textColor: "{colors.light-ember}"
  metadata-badge-grill-dark:
    backgroundColor: "{colors.dark-ember-surface}"
    textColor: "{colors.dark-ember}"
  supporting-card:
    backgroundColor: "{colors.light-panel}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
  workspace-tab:
    textColor: "{colors.light-muted}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  quiz-answer:
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  quiz-answer-selected:
    backgroundColor: "{colors.light-selection-surface}"
---

# Design System: Grill Me

## Overview

**Creative North Star: "Flexible workspace"**

Grill Me is a personal developer practice workspace using its original committed color palette. The confirmed direction is layout A, the flexible workspace: task-focused tabs with optional supporting panels. T3 Code is the reference for panel consistency, line icons, and spacing. The user rejected the substituted beige/terracotta and blue palette. Preserve original white/charcoal surfaces, neutral actions, semantic colors, and orange scoped to Grill difficulty.

The visual system supports sustained reading and operation across coding challenges, implementation reviews, standalone and challenge quizzes, and revisiting practice. Typography and panel boundaries establish hierarchy; color identifies actions, selection, focus, and outcomes. Compact desktop controls coexist with larger default controls on narrow screens.

This is a source-based scan of the implemented web app, not a new visual proposal. [PRODUCT.md](PRODUCT.md) records the confirmed direction; the [repository README](../../README.md) and application code remain authoritative for product behavior. No new metaphor is introduced.

Sources: [global theme](app/globals.css), [difficulty overrides](app/styles/grill.css), [font loading](app/layout.tsx), [shared controls](shared/components/ui), [app shell](shared/components/layout/app-shell.tsx), [navigation](shared/components/layout/navigation.tsx), [practice workspace](features/chat/components/practice-workspace.tsx), [submission files](features/chat/components/submission-files.tsx), and [quiz workspace](features/quizzes/components/quiz-workspace.tsx). Spacing, radii, standard text sizes, and shadow expansions use the installed Tailwind theme; they are not a second custom scale. This pass did not use browser rendering.

**Key Characteristics:**

- Warm light surfaces and original charcoal dark surfaces, with neutral actions and ember accents.
- Plex Sans for interface and prose; Plex Mono for code and file information.
- Task-focused tabs with optional reference or file panels.
- Compact line icons, visible keyboard focus, and restrained state motion.

## Colors

The palette pairs original light surfaces and original charcoal dark surfaces with softened neutral actions, ember identity accents, neutral selection, and richer green, amber, and red semantic states. Frontmatter preserves the actual hexadecimal values from the light root and dark theme override. Token names carry a theme prefix only to distinguish both sets in this document; code uses the unprefixed variables and switches them with the root theme attribute.

### Primary

- **Soft neutral actions:** the shared primary button uses `action` fill and border with `action-ink` text. Tailwind `primary` resolves to `action`; `primary-foreground` resolves to `action-ink`.
- **Warm ember identity:** `ember` and `ember-surface` color Grill difficulty badges and options. The original colored logo remains intact. `grill-accent` resolves to `ember`. Original Grill colors remain scoped: ember #e75b37, hot #ffcb86, action #c94320/#ffab63 and action ink #ffffff/#2b1811 in light/dark themes.

### Secondary

- **Neutral selection ink:** `selection-ink` marks current navigation, selected answers, current quiz questions, and tab indicators. `selection-surface` supplies the neutral selection fill. Tailwind `brand` and `brand-bright` resolve to `selection-ink`; `brand-soft` resolves to `selection-surface`. `focus` supplies keyboard focus outlines and rings.

### Neutral

- **Canvas and chrome:** `canvas` is the page background; `chrome` frames the app and sidebar.
- **Surface and panel:** `surface` holds the main content and controls; `panel` supports toolbars, reference text, and explanatory cards.
- **Elevated surface:** `elevated` marks hover and quiet grouped controls. It is a tonal layer, not a requirement to add shadow.
- **Foreground and muted text:** `foreground` carries primary text; `muted` carries descriptions, metadata, inactive navigation, and icons.
- **Dividers and stronger boundaries:** `line` separates panels and controls; `line-strong` reinforces hover and detailed boundaries.

### Semantic states

`success`, `destructive`, and `warning` carry outcome meaning, not secondary brand palettes. Quiz feedback uses success or destructive borders and translucent fills with explicit text and check/cross icons. Difficulty distinguishes levels through labels and icons; the Grill override adds ember text, a warm surface, and an ember/line mixed border without glow or animated heat effects. Syntax highlighting has a separate light/dark palette in the global stylesheet and the file viewer uses its configured GitHub syntax themes; those colors are not interface accents.

The frontmatter component summaries show light-theme base assignments unless named otherwise. Their source variables resolve the corresponding dark values automatically; the sidecar snippets retain that binding. Alpha fills, outlines, and hover opacity belong in those snippets rather than invented solid-color tokens. Sidecar tonal ramps are labeled synthesized preview swatches, never application tokens.

## Typography

**Interface and prose:** IBM Plex Sans, loaded locally as a variable font (weights 100–700). **Code and file information:** IBM Plex Mono, loaded locally at weight 400. Source font variables are `--font-plex-sans` and `--font-plex-mono`; browser fallback stacks in the sidecar only keep specimens usable when the host has not loaded the fonts.

The hierarchy is compact and task-oriented. There is no separate display face or enforced modular ratio. Frontmatter roles describe observed contexts, not a requirement that every heading share one size.

- **Headline:** page introductions use the headline role; their descriptions use compact body text and a maximum measure of 65ch.
- **Title:** active quiz titles use the title role, wrap anywhere as needed, and occupy a separate row above controls. Challenge titles, when shown in the statement component, use 26px semibold with tight leading and the same tightened tracking.
- **Body:** challenge statements and quiz answers use the body role. Reference prose uses compact body text. Markdown preserves the surrounding font size and line height; section headings have their own stylesheet rules.
- **Label:** buttons, navigation, breadcrumbs, and panel titles commonly use 13px; workspace tabs use 14px. Small button variants and metadata use 12px, while file tabs use the file-label role.
- **Code:** the submission viewer uses the code role. File paths and file-tree rows also use Mono. Shortcut keycaps use Sans in the implemented shared component.

## Layout

The app shell fills the dynamic viewport and contains scrolling inside its content regions. At the medium viewport breakpoint (48rem, normally 768px), the desktop sidebar is 224px wide, collapsible to zero, with an 8px outer inset and rounded bordered content frame. Below that breakpoint, navigation opens in a 280px left drawer. The page header has a minimum height of 52px, wraps actions, and keeps breadcrumbs and controls separate from scrolling content.

Spacing derives from Tailwind's quarter-rem unit, including half steps. The extracted frontmatter lists recurring used steps, not every available utility. Controls commonly use 8px gaps and 12px horizontal padding; navigation uses 10px gaps and padding. Panels use 16px or 20px padding; workspace reading areas use 20px side padding, increasing to 40px at the medium breakpoint. Default buttons and inputs are 44px high on narrow screens; desktop defaults are 32px buttons and 36px inputs. Explicit small and icon variants remain compact, so there is no claim that every control is 44px.

### Flexible practice workspace

Overview, Submit, Reviews, and Quizzes are task tabs. The tab strip can scroll horizontally, while toolbar actions wrap. Overview content has an 850px maximum and Submit has a 900px maximum; the standalone statement component defaults to a 76ch reading measure. Each active task owns its overflow instead of growing the entire application beyond the viewport.

The [wide-workspace hook](features/chat/hooks/use-wide-workspace.ts) tests the viewport at 1180px. At or above that width, the optional task reference is 340px wide with a 300px minimum and 35% maximum. Below it, the reference becomes a right drawer capped at 440px and the viewport width. Reference text scrolls independently. The reference is available outside Overview, and task reference and submission files share one mutually exclusive panel selection.

Submission files use a desktop side panel at 58% width, constrained to 560–920px, or a right drawer below 1180px. The file drawer fills narrow viewports and is capped at 760px from the small breakpoint. Expansion opens a full-viewport dialog. The file tree defaults open in wide workspaces and closed in narrow ones; selecting a file on a narrow viewport closes the tree. An opened tree overlays the viewer below 40rem and sits beside it at 260px from 40rem upward. File tabs scroll horizontally and code scrolls inside the viewer. These are fixed constraints, not draggable splitters.

### Quiz workspace

The active quiz title and metadata sit above a separate wrapping toolbar. The attempt area scrolls independently. A container query at 850px of available quiz width changes the question/answer area from a stack to a flexible main column plus a 180px answer-overview column, with a 32px gap. This is a container threshold, not the viewport breakpoint for task panels. The overview grid uses five columns on narrow screens, ten from the small viewport breakpoint, and three in the wide quiz container.

## Elevation & Depth

Depth comes primarily from surface tone and single-pixel dividers. The app frame, reading surfaces, reference panel, answer overview, and hint card do not add ambient shadows. Selected default segmented tabs use the small Tailwind shadow; line tabs explicitly remove it. Dropdowns use the medium shadow, while dialogs and sheets use the large shadow. Exact expansions are recorded in the sidecar from the installed Tailwind theme. Full-screen files explicitly remove the dialog shadow and rounded border.

Radix dialog and sheet overlays use black at 50% opacity. The native dialog backdrop rule is black at 40%; it is separate from those overlay components. Keyboard focus is an outline or ring, not surface elevation: the global outline is 2px with a 3px offset, and shared controls add their own ring styles.

State motion is brief: navigation and tabs use 100ms color transitions; pressable controls use 120ms transitions and pointer-only pressed scale (0.97). Keyboard input disables pressable/tab transitions and specified overlay animations. Sheets open in 200ms and close in 150ms; tooltips and dropdowns use 150ms. Reduced-motion preferences suppress transforms and shorten CSS motion, while the Motion provider respects the user's preference.

## Shapes

Corners are gently rounded and consistent with the installed Tailwind scale: small for keycaps and menu rows, medium for buttons, inputs, navigation, metadata, and tabs; large for supporting cards and ordinary dialogs; extra-large for the desktop content frame. The frontmatter records these scale values. File-tree rows use the explicit 5px library override. Full-screen file viewing uses square corners. Panels meet at straight one-pixel dividers; dashed boundaries are used for attachment affordances, not general page framing.

Line icons support labels rather than competing with content. Navigation icons are 16px with a 1.7px stroke; workspace and file controls commonly use 14–17px icons. Small metadata icons are 12px. The file-tree library intentionally retains colored file-type icons; the interface also retains its colored brand mark and meaningful semantic colors.

## Components

### Brand

The brand mark renders the original `/icon.svg` in full color, without grayscale, opacity, or color-filter treatment. `BrandMark` defaults to 40px; `BrandLockup` uses a 44px mark with a 10px gap and an 18px semibold foreground wordmark. Navigation overrides this to a 32px mark, 8px gap, and 16px wordmark. The mark is decorative within the named home link. Source: [brand components](shared/components/brand.tsx).

### Buttons

Compact, clear actions. The shared default is secondary: surface fill, line border, and foreground text, changing to elevated fill on hover. Primary/default variants use neutral action fill and border with action-ink text, with 90% hover opacity. Outline and hint share secondary styling. Ghost has a transparent border and muted text, becoming elevated with foreground text on hover. Review uses elevated fill with a 25% foreground border; destructive uses 10% destructive fill, 30% border, and 20% hover fill; link uses foreground text with a hover underline. These are existing variants, not new action categories.

All share the medium corner radius, focus ring treatment, and disabled opacity (40%) with pointer events disabled. Standard size has 12px horizontal padding; small uses 10px, 12px text, and 32px height; large is 44px high with 16px padding. Default icon size is 40px, changing to 36px on desktop; small icons use 32px. Icon-only actions retain accessible names and often tooltips.

### Inputs / Fields

Panel fill, line border, medium corners, and muted placeholder text. Inputs use 12px horizontal and 4px vertical padding; textareas use 12px horizontal and 8px vertical padding with an initial 64px minimum. Narrow input text is 16px, desktop 14px. Focus changes the border to focus color and adds a 20% focus ring. Invalid fields use destructive borders and ring color (20% light, 40% dark); disabled fields have 50% opacity. The file-search input intentionally overrides this with a compact Mono treatment.

### Navigation and tabs

Primary navigation uses neutral selection fill and ink for the current page, including its icon. Selected Continue practicing items use the same neutral treatment. Inactive items use muted text and a translucent elevated hover fill. Current page is exposed with `aria-current`. Desktop rows are at least 36px, narrow rows 44px. Sidebar collapse and the mobile drawer use the same navigation content.

Workspace line tabs have a foreground 2px bottom indicator and foreground selected text. Default segmented tabs instead use elevated grouping and a raised active surface. Radix owns tab behavior; CSS specimens only illustrate appearance. Tab focus, disabled state, horizontal overflow, and named tab lists are part of the pattern.

### Chips / metadata

Metadata badges are static labels, not buttons: canvas fill, line border, muted text, medium corners, and compact Sans type. Default padding is 4px by 8px; the compact form uses 2px by 6px and 11px text. Difficulty includes its icon and label. The Grill badge and Grill options use ember text, ember-surface fill, and a border mixing 35% ember with line in sRGB. Interactive Grill options keep ember-surface on hover, open, and highlighted states; menu radio options add a 6px top margin and a line-colored top border. Do not invent hover or pressed affordances for these noninteractive labels.

### Cards / containers

Supporting cards use a line border, panel fill, large corners, and generally 16px padding. Hints and answer-overview cards follow this pattern; answer explanations use 20px padding. The submission composer uses a surface-filled bordered container with divided rows. The challenge statement is an article with a separated header, not a generic raised card. Preserve the distinction between reading content and boxed supporting controls.

### Quiz answers

Answer labels have a 48px minimum height, large corners, 12px by 16px padding, and a 28px square Mono letter marker. Unselected answers use line borders, strengthening the border and using elevated fill on hover. Selected answers use neutral selection fill and a 60% selection-ink border, with a check icon while answering. Correct/incorrect results use 50% semantic borders, 10% fills, and explicit result labels. The radio's visible focus outline surrounds the whole answer. Saving, recovery, submission, and keyboard navigation remain owned by the quiz implementation; the sidecar is not a substitute for that behavior.

### Supporting panels and feedback

Task and file panels keep a compact header above independently scrolling content and return focus to their triggering controls when closed. File viewing provides loading, error/retry, selection-empty, binary, and oversized-preview states. The code preview limit is not an attachment limit; the README governs submission capability. Existing menus, sheets, and dialogs supply their Radix behavior and focus handling. Empty states use concise text and dividers; errors use alert semantics and a retry action where available.

## Do's and Don'ts

### Do:

- Do use the existing theme variables and shared controls for new surfaces.
- Do preserve the flexible workspace: one active task and optional supporting context.
- Do keep task prose readable and let long quiz titles wrap above the controls.
- Do pair status color with text or icons and keep completion, difficulty, and review outcomes distinct.
- Do preserve keyboard focus, accessible control names, and reduced-motion behavior.

### Don't:

- Preserve the original committed palette. Do not introduce beige surfaces, blue selection, or app-wide terracotta actions. Keep orange scoped to Grill difficulty; omit glow and animated heat effects.
- Don't style primary actions blue by assuming the primary token is the selection accent.
- Don't force desktop side panels into narrow viewports or default the narrow file tree open.
- Don't replace task text with screenshot-specific sample content or turn a personal workspace into a team dashboard.
- Don't treat these CSS specimens as implementations of saving, tabs, dialogs, or review behavior.
