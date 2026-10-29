import { test as base, expect } from "@playwright/test";
import type {
  GenerationJob,
  GenerationRequest,
} from "../../../packages/ui/src/features/generations/types";
import { EMPTY_GUIDED } from "@repo/preferences";
import type {
  Challenge,
  Profile,
  ProfilePreferences,
} from "../../../packages/ui/src/shared/types/api";
import type { AiLog } from "../../../packages/ui/src/features/logs/types";

export const profile: Profile = {
  id: "browser-test-profile",
  email: "browser@example.test",
  createdAt: "2026-01-01T00:00:00Z",
};
export function makeGenerationJob(
  request: GenerationRequest,
  overrides: Partial<GenerationJob> = {},
): GenerationJob {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    profileId: profile.id,
    kind: request.kind,
    challengeId: request.kind === "challenge_quiz" ? request.challengeId : null,
    request,
    status: "completed",
    phase: "completed",
    clarification: null,
    error: null,
    resultId: "build-one",
    resultTitle: "Group words",
    resultNumber: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    notifiedAt: null,
    ...overrides,
  };
}

export const preferences: ProfilePreferences = {
  ...EMPTY_GUIDED,
  profileId: profile.id,
  aboutMe: null,
  updatedAt: profile.createdAt,
  developerContextUpdatedAt: null,
};
export const challenge: Challenge = {
  id: "build-one",
  profileId: profile.id,
  number: 1,
  title: "Group words",
  scope: "focused",
  difficulty: "medium",
  contextualDifficulty: "medium",
  estimatedDifficultyScore: null,
  difficultyReason: "Group with edge cases.",
  topic: "Maps",
  implementationBoundary: "",
  contextSnapshot: null,
  promptVersion: "practice-v3.0",
  calibrationVersion: "difficulty-bands-v1",
  contractVersion: 2,
  completionSource: null,
  durationEstimate: { minMinutes: 20, maxMinutes: 30 },
  implementationMilestones: [],
  problemStatement: "Group supplied words by their first letter.",
  expectedOutcome: "Submit the source function.",
  constraints: [],
  starterCode: null,
  completionCriteria: ["Preserve every word."],
  hint: null,
  status: "active",
  archivedAt: null,
  createdAt: profile.createdAt,
  completedAt: null,
};
export const log: AiLog = {
  id: "log-one",
  profileId: profile.id,
  challengeId: challenge.id,
  operation: "generation",
  status: "success",
  requestedModel: "test-model",
  actualModel: "test-model",
  endpoint: "http://model.invalid",
  providerRequestId: null,
  streamed: false,
  preview: "A mocked build request",
  startedAt: profile.createdAt,
  completedAt: profile.createdAt,
  durationMs: 10,
  firstTokenMs: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  cachedTokens: null,
  reasoningTokens: null,
  costUsd: null,
  requestBody: { input: "Test input" },
  responseBody: null,
  responseText: "Mocked response",
  streamEvents: null,
  error: null,
};

export const test = base.extend<{ apiRequests: string[] }>({
  apiRequests: [
    async ({ page, context, baseURL }, use) => {
      const requests: string[] = [];
      const jobs: GenerationJob[] = [];
      const unexpected: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Block every other origin: tests can never fall through to a real API.
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === baseURL) return route.continue();
        if (url.origin !== "http://127.0.0.1:18027") {
          unexpected.push(url.href);
          return route.abort();
        }
        requests.push(url.pathname + url.search);
        if (url.pathname !== "/profiles/start") {
          expect(route.request().headers()["x-profile-id"]).toBe(profile.id);
        }
        let data: unknown;
        switch (url.pathname) {
          case "/generation-jobs":
            if (route.request().method() === "POST") {
              const job = makeGenerationJob(route.request().postDataJSON());
              jobs.push(job);
              return route.fulfill({ status: 202, json: { data: job } });
            }
            data = jobs;
            break;
          case "/profiles/start":
            data = profile;
            break;
          case "/profiles/preferences":
            data = preferences;
            break;
          case "/challenges/active":
            data = [challenge];
            break;
          case "/challenges/build-one":
            data = challenge;
            break;
          case "/challenges/build-two":
            data = { ...challenge, id: "build-two", title: "Second build" };
            break;
          case "/challenges/prepare":
            data = { question: null, options: [] };
            break;
          case "/challenges/generate":
            data = challenge;
            break;
          case "/judges/models":
            data = { models: [] };
            break;
          case "/judges/status":
            data = {
              codex: {
                installed: false,
                authenticated: false,
                version: null,
                message: "Test",
              },
              omniroute: { configured: true, online: true, message: "Test" },
              omnirouteConfigured: true,
              verificationAvailable: false,
            };
            break;
          case "/logs":
            data = {
              items: [log],
              page: Number(url.searchParams.get("page") ?? 1),
              total: 40,
              pageSize: 20,
              totalPages: 2,
            };
            break;
          case "/logs/log-one":
            data = log;
            break;
          case "/challenges/build-one/hint":
            return route.fulfill({
              contentType: "application/x-ndjson",
              body:
                [
                  { type: "delta", delta: "Use a map to group words." },
                  {
                    type: "done",
                    data: { ...challenge, hint: "Use a map to group words." },
                  },
                ]
                  .map((event) => JSON.stringify(event))
                  .join("\n") + "\n",
            });
          default:
            if (url.pathname.startsWith("/generation-jobs/")) {
              const id = url.pathname.split("/")[2];
              const job = jobs.find((job) => job.id === id);
              if (url.pathname.endsWith("/acknowledge")) {
                if (job) job.notifiedAt = new Date().toISOString();
                data = { acknowledged: true };
              } else data = job;
            } else if (
              [
                "/projects",
                "/progress",
                "/quizzes",
                "/challenges/saved",
                "/challenges/archived",
                "/challenges/history",
              ].includes(url.pathname) ||
              /^\/challenges\/build-(one|two)\/(messages|submissions|quizzes)$/.test(
                url.pathname,
              )
            )
              data = [];
            else {
              unexpected.push(url.pathname);
              return route.abort();
            }
        }
        return route.fulfill({ json: { data } });
      });
      await use(requests);
      expect(unexpected, "Unexpected network requests").toEqual([]);
      expect(errors, "Browser runtime errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function seedProfile(page: import("@playwright/test").Page) {
  await page.addInitScript((savedProfile) => {
    if (!sessionStorage.getItem("fixture-seeded")) {
      localStorage.setItem(
        "grill-me.app.test",
        JSON.stringify({
          state: {
            profile: savedProfile,
            theme: "light",
            sidebarCollapsed: false,
          },
          version: 0,
        }),
      );
      localStorage.setItem(
        "grill-me.app.production",
        "production-state-must-stay-untouched",
      );
      sessionStorage.setItem("fixture-seeded", "true");
    }
  }, profile);
}
