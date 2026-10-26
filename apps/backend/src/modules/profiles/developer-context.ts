import {
  EXPERIENCE,
  FOCUS,
  GOALS,
  LANGUAGES,
  STACK,
  normalizeTechnology,
  optionLabel,
  optionLabels,
} from "@repo/preferences";
import type { ProfilePreferences } from "./profile.schema";

const catalog = [...LANGUAGES, ...STACK];
const ignored = new Set([
  "build",
  "create",
  "implement",
  "practice",
  "challenge",
  "project",
  "application",
  "using",
  "with",
  "from",
  "that",
  "this",
  "want",
  "learn",
  "help",
  "developer",
  "development",
  "service",
  "system",
  "feature",
  "contribution",
  "work",
  "code",
  "and",
  "the",
  "for",
  "task",
  "working",
  "learning",
  "built",
  "implemented",
  "into",
]);

export function requestTerms(text: string) {
  const lower = text.toLocaleLowerCase();
  const terms = new Set(
    (lower.match(/[\p{L}\p{N}+#.]+/gu) ?? [])
      .filter((term) => term.length >= 3 && !ignored.has(term))
      .map((term) => normalizeTechnology(term).toLocaleLowerCase()),
  );
  for (const option of catalog) {
    if (
      [
        option.id,
        option.label,
        ...("aliases" in option ? option.aliases : []),
      ].some((name) => {
        const escaped = name
          .toLocaleLowerCase()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(
          `(^|[^\\p{L}\\p{N}+#])${escaped}($|[^\\p{L}\\p{N}+#])`,
          "u",
        ).test(lower);
      })
    )
      terms.add(option.id);
  }
  return terms;
}

function technologyMatches(technology: string, request: string) {
  const id = normalizeTechnology(technology);
  const option = catalog.find((item) => item.id === id);
  const names = option
    ? [option.id, option.label, ...("aliases" in option ? option.aliases : [])]
    : [technology];
  return names.some((name) => {
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(^|[^\\p{L}\\p{N}+#])${escaped}($|[^\\p{L}\\p{N}+#])`,
      "iu",
    ).test(request);
  });
}

function relatedScore(text: string, terms: Set<string>) {
  return [...requestTerms(text)].filter((term) => terms.has(term)).length;
}

// This projection is the only profile context used for preparation and generation.
// Raw preferences, identity fields, and resume source never cross this boundary.
export function projectDeveloperContext(
  preferences: ProfilePreferences,
  request: string,
) {
  const terms = requestTerms(request);
  const concise = (text: string, max: number) => {
    let clean = text
      .replace(/[\w.+-]+@[\w.-]+\.[\p{L}]{2,}/gu, "[contact removed]")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, "[contact removed]")
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        "[identifier removed]",
      );
    if (preferences.displayName)
      clean = clean.replaceAll(preferences.displayName, "[name removed]");
    return clean.trim().slice(0, max);
  };
  const projects = (preferences.projects ?? [])
    .map((project, index) => ({
      project,
      index,
      score:
        relatedScore(project.contribution, terms) +
        project.technologies.filter((technology) =>
          technologyMatches(technology, request),
        ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map(({ project }) => ({
      name: concise(project.name, 120),
      technologies: optionLabels(catalog, project.technologies).map((value) =>
        concise(value, 80),
      ),
      contribution: concise(project.contribution, 600),
    }));
  return {
    updatedAt: preferences.developerContextUpdatedAt ?? null,
    experienceLevel:
      optionLabel(EXPERIENCE, preferences.experienceLevel) || null,
    languages: optionLabels(LANGUAGES, preferences.languages).map((value) =>
      concise(value, 80),
    ),
    stack: optionLabels(STACK, preferences.stack).map((value) =>
      concise(value, 80),
    ),
    background: preferences.aboutMe ? concise(preferences.aboutMe, 1200) : null,
    learningGoals: optionLabels(GOALS, preferences.learningGoals),
    learningGoal: preferences.learningGoal
      ? concise(preferences.learningGoal, 1000)
      : null,
    currentFocus: optionLabel(FOCUS, preferences.currentFocus) || null,
    knownConcepts: preferences.knownConcepts.map((value) =>
      concise(value, 200),
    ),
    topicFamiliarity: preferences.topicFamiliarity
      .filter((item) => relatedScore(item.topic, terms) > 0)
      .map((item) => ({ ...item, topic: concise(item.topic, 200) })),
    projects,
  };
}
