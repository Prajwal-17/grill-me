export type Option = {
  id: string;
  label: string;
  group?: string;
  aliases?: readonly string[];
};
export const EXPERIENCE = [
  { id: "beginner", label: "Beginner" },
  { id: "junior", label: "Junior", aliases: ["jr", "junior developer"] },
  {
    id: "mid-level",
    label: "Mid-level",
    aliases: ["mid", "mid level", "mid-level developer"],
  },
  { id: "senior", label: "Senior", aliases: ["sr", "senior developer"] },
] as const;
export const LANGUAGES = [
  { id: "javascript", label: "JavaScript", aliases: ["js"] },
  { id: "typescript", label: "TypeScript", aliases: ["ts"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "java", label: "Java" },
  { id: "rust", label: "Rust" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++", aliases: ["c plus plus"] },
  { id: "csharp", label: "C#", aliases: ["c sharp", "c-sharp"] },
  { id: "ruby", label: "Ruby" },
  { id: "php", label: "PHP" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Bash", aliases: ["shell"] },
] as const;
export const STACK = [
  { id: "react", label: "React", group: "Frontend" },
  {
    id: "nextjs",
    label: "Next.js",
    group: "Frontend",
    aliases: ["next", "nextjs"],
  },
  { id: "vue", label: "Vue", group: "Frontend", aliases: ["vuejs", "vue.js"] },
  { id: "angular", label: "Angular", group: "Frontend" },
  { id: "svelte", label: "Svelte", group: "Frontend" },
  {
    id: "nodejs",
    label: "Node.js",
    group: "Backend",
    aliases: ["node", "nodejs"],
  },
  { id: "bun", label: "Bun", group: "Backend" },
  {
    id: "express",
    label: "Express",
    group: "Backend",
    aliases: ["expressjs", "express.js"],
  },
  { id: "hono", label: "Hono", group: "Backend", aliases: ["honojs"] },
  { id: "django", label: "Django", group: "Backend" },
  { id: "fastapi", label: "FastAPI", group: "Backend" },
  { id: "flask", label: "Flask", group: "Backend" },
  { id: "spring-boot", label: "Spring Boot", group: "Backend" },
  { id: "dotnet", label: ".NET", group: "Backend", aliases: ["dotnet"] },
  {
    id: "postgresql",
    label: "PostgreSQL",
    group: "Databases",
    aliases: ["postgres"],
  },
  { id: "mysql", label: "MySQL", group: "Databases" },
  { id: "sqlite", label: "SQLite", group: "Databases" },
  { id: "mongodb", label: "MongoDB", group: "Databases", aliases: ["mongo"] },
  { id: "redis", label: "Redis", group: "Databases" },
  { id: "docker", label: "Docker", group: "Infrastructure" },
  {
    id: "kubernetes",
    label: "Kubernetes",
    group: "Infrastructure",
    aliases: ["k8s"],
  },
  {
    id: "aws",
    label: "AWS",
    group: "Infrastructure",
    aliases: ["amazon web services"],
  },
  {
    id: "azure",
    label: "Azure",
    group: "Infrastructure",
    aliases: ["microsoft azure"],
  },
  {
    id: "gcp",
    label: "Google Cloud",
    group: "Infrastructure",
    aliases: ["gcp", "google cloud platform"],
  },
] as const;
export const GOALS = [
  { id: "fundamentals", label: "Fundamentals" },
  { id: "building-features", label: "Building features" },
  { id: "debugging", label: "Debugging" },
  { id: "testing", label: "Testing" },
  { id: "code-quality", label: "Code quality" },
  { id: "system-design", label: "System design" },
  { id: "interview-practice", label: "Interview practice" },
] as const;
export const FOCUS = [
  { id: "fundamentals", label: "Fundamentals" },
  { id: "collections", label: "Collections" },
  { id: "async-concurrency", label: "Async/concurrency" },
  { id: "apis", label: "APIs" },
  { id: "databases", label: "Databases" },
  { id: "testing", label: "Testing" },
  { id: "debugging", label: "Debugging" },
  { id: "performance", label: "Performance" },
  { id: "security", label: "Security" },
  { id: "system-design", label: "System design" },
] as const;
export type TopicFamiliarity = {
  topic: string;
  familiarity: "new" | "practiced" | "comfortable";
};
export const DEFAULT_CODEX_MODEL = "gpt-5.6-sol";
export type DeveloperProject = {
  name: string;
  technologies: string[];
  contribution: string;
};
export type GuidedPreferences = {
  displayName: string | null;
  projects: DeveloperProject[];
  codexModel: string;
  includeRecentChallenges: boolean;
  topicFamiliarity: TopicFamiliarity[];
  knownConcepts: string[];
  learningGoal: string | null;
  experienceLevel: (typeof EXPERIENCE)[number]["id"] | null;
  languages: string[];
  stack: string[];
  learningGoals: (typeof GOALS)[number]["id"][];
  currentFocus: (typeof FOCUS)[number]["id"] | null;
};
export const EMPTY_GUIDED: GuidedPreferences = {
  displayName: null,
  projects: [],
  codexModel: DEFAULT_CODEX_MODEL,
  includeRecentChallenges: false,
  topicFamiliarity: [],
  knownConcepts: [],
  learningGoal: null,
  experienceLevel: null,
  languages: [],
  stack: [],
  learningGoals: [],
  currentFocus: null,
};
export function optionIds<T extends Option>(
  options: readonly T[],
): [T["id"], ...T["id"][]] {
  return options.map((option) => option.id) as [T["id"], ...T["id"][]];
}
export function optionLabel(options: readonly Option[], id: string | null) {
  return options.find((option) => option.id === id)?.label ?? id ?? "";
}
export function optionLabels(
  options: readonly Option[],
  ids: readonly string[],
) {
  return ids.map((id) => optionLabel(options, id)).filter(Boolean);
}

// Known aliases use stable catalog IDs; custom entries keep their readable name.
export function normalizeTechnology(
  value: string,
  options: readonly Option[] = [...LANGUAGES, ...STACK],
) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const key = trimmed.toLocaleLowerCase();
  return (
    options.find((option) =>
      [option.id, option.label, ...(option.aliases ?? [])].some(
        (name) => name.toLocaleLowerCase() === key,
      ),
    )?.id ?? trimmed
  );
}

export function normalizeTechnologies(
  values: readonly string[],
  options?: readonly Option[],
) {
  const seen = new Set<string>();
  return values
    .map((value) => normalizeTechnology(value, options))
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type ResumeDraft = {
  displayName: string | null;
  aboutMe: string | null;
  languages: string[];
  stack: string[];
  projects: DeveloperProject[];
};
export type ResumePreview = { draft: ResumeDraft; warnings: string[] };
export type ResumeField = keyof ResumeDraft;

export function mergeProjects(
  existing: DeveloperProject[],
  incoming: DeveloperProject[],
) {
  const key = (project: DeveloperProject) =>
    JSON.stringify({
      name: project.name.trim().toLocaleLowerCase(),
      technologies: normalizeTechnologies(project.technologies)
        .map((v) => v.toLocaleLowerCase())
        .sort(),
      contribution: project.contribution.trim().toLocaleLowerCase(),
    });
  const seen = new Set(existing.map(key));
  return [
    ...existing,
    ...incoming.filter((project) => {
      if (seen.has(key(project))) return false;
      seen.add(key(project));
      return true;
    }),
  ].slice(0, 10);
}

export function applyResumeDraft<T extends ResumeDraft>(
  form: T,
  draft: ResumeDraft,
  selected: ResumeField[],
): T {
  return {
    ...form,
    ...(selected.includes("displayName")
      ? { displayName: draft.displayName }
      : {}),
    ...(selected.includes("aboutMe") ? { aboutMe: draft.aboutMe } : {}),
    ...(selected.includes("languages")
      ? {
          languages: normalizeTechnologies([
            ...form.languages,
            ...draft.languages,
          ]).slice(0, 50),
        }
      : {}),
    ...(selected.includes("stack")
      ? {
          stack: normalizeTechnologies([...form.stack, ...draft.stack]).slice(
            0,
            50,
          ),
        }
      : {}),
    ...(selected.includes("projects")
      ? { projects: mergeProjects(form.projects, draft.projects) }
      : {}),
  };
}
