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
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#", aliases: ["c sharp"] },
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
export type GuidedPreferences = {
  includeRecentChallenges: boolean;
  topicFamiliarity: TopicFamiliarity[];
  knownConcepts: string[];
  learningGoal: string | null;
  experienceLevel: (typeof EXPERIENCE)[number]["id"] | null;
  languages: (typeof LANGUAGES)[number]["id"][];
  stack: (typeof STACK)[number]["id"][];
  learningGoals: (typeof GOALS)[number]["id"][];
  currentFocus: (typeof FOCUS)[number]["id"] | null;
};
export const EMPTY_GUIDED: GuidedPreferences = {
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
  return options.find((option) => option.id === id)?.label ?? "";
}
export function optionLabels(
  options: readonly Option[],
  ids: readonly string[],
) {
  return ids.map((id) => optionLabel(options, id)).filter(Boolean);
}
