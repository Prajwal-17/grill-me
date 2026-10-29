import * as postgres from "./schema.pg";
import * as sqlite from "./schema.sqlite";
// One backend process owns one explicitly configured dialect. The common query
// surface retains the PostgreSQL types; actual tables/mappers come from its adapter.
export let profiles = postgres.profiles;
export let profilePreferences = postgres.profilePreferences;
export let generationCounters = postgres.generationCounters;
export let challenges = postgres.challenges;
export let quizzes = postgres.quizzes;
export let generationJobs = postgres.generationJobs;
export let quizAttempts = postgres.quizAttempts;
export let messages = postgres.messages;
export let aiLogs = postgres.aiLogs;
export let projects = postgres.projects;
export let submissions = postgres.submissions;
export let reviewJobs = postgres.reviewJobs;
export let verificationRuns = postgres.verificationRuns;
export let aiLogEvents = postgres.aiLogEvents;

export function selectSchema(dialect: "sqlite" | "postgres") {
  const selected = (dialect === "sqlite"
    ? sqlite
    : postgres) as unknown as typeof postgres;
  profiles = selected.profiles;
  profilePreferences = selected.profilePreferences;
  generationCounters = selected.generationCounters;
  challenges = selected.challenges;
  quizzes = selected.quizzes;
  generationJobs = selected.generationJobs;
  quizAttempts = selected.quizAttempts;
  messages = selected.messages;
  aiLogs = selected.aiLogs;
  projects = selected.projects;
  submissions = selected.submissions;
  reviewJobs = selected.reviewJobs;
  verificationRuns = selected.verificationRuns;
  aiLogEvents = selected.aiLogEvents;
}
