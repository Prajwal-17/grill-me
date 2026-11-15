# Grill Me

Grill Me is a personal, local-first practice companion for developers. It supports coding challenges, implementation reviews, standalone and challenge quizzes, and revisiting prior practice. These workflows deserve equal care.

A fresh installation asks where app data and challenge workspaces live before the backend starts, with defaults that preserve existing installations and named child folders for custom parents. Users describe what they want to learn, choose scope and difficulty, build in their own editor, and submit code or connect a local project. Each challenge keeps a local workspace folder for code, notes, and artifacts, with starter material seeded once and detected editors one action away. Reviews provide evidence and actionable feedback. Users decide when to mark a challenge completed; acceptance, difficulty, and quiz scores remain separate concepts. Quiz answers save automatically and attempts can be resumed or retaken.

The interface should be comfortable for sustained practice: readable task text, compact navigation, clear controls, and accessible keyboard operation. It supports light and dark themes and narrow touch screens. This is a personal workspace, without a team or project-management layer. Local profile selection is not authentication.

The interface uses shadcn/Radix, with T3Code as a reference for spacing, surface hierarchy, compact navigation, and settings organization. Preserve Grill Me's original neutral charcoal/white palette, inverted monochrome actions, full-color logo, and orange Grill difficulty identity. The user explicitly rejected both the gray-blue replacement and the saturated navy/cobalt replacement. Refinement means improving tonal separation, contrast, borders, and interaction states within the original palette; it does not authorize changing the hue family. Collections emphasize search/filter/sort controls, settings use task-specific sections, and active work keeps task tabs with optional reference and file panels.

Preserve existing data, API contracts, frozen challenge requirements, scoring rules, explicit completion, code attachment behavior, and quiz save/recovery behavior when extending the UI. Source product details live in the repository README.

This is a personal developer tool. Keep screens focused on controls, data, and results. Omit taglines, promotional empty states, routine instructions, and duplicate descriptions. Preserve field names, accessible semantics, technical limits, keyboard shortcuts, errors, and meaningful state.

Typography uses locally served Inter Variable for interface/prose and IBM Plex
Mono for code and paths. This follows the user's explicit typography refinement
request; the original palette and softened border system remain authoritative.
