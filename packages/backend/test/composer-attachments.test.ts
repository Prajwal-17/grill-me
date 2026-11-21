import { describe, expect, test } from "bun:test";
import { generationRequestSchema } from "@repo/backend/modules/generations/generation.schema";
import { generationTask } from "@repo/backend/modules/ai/agent/tasks/build";

describe("composer attachments", () => {
  const attachment = {
    filename: "router.ts",
    text: "const app = new Hono();",
  };

  test("generation requests accept text attachments", () => {
    const parsed = generationRequestSchema.parse({
      kind: "challenge",
      requestId: "0d5c7d5a-1c44-4a5e-9e07-9a1c9db70f01",
      input: {
        prompt: "Build a URL shortener with rate limiting.",
        scope: "feature",
        difficulty: "medium",
        clarificationContext: null,
        clarificationHistory: [],
        attachments: [attachment],
      },
    });
    if (parsed.kind !== "challenge") throw new Error("wrong kind");
    expect(parsed.input.attachments).toEqual([attachment]);
  });

  test("generation requests accept any text filename", () => {
    const parsed = generationRequestSchema.parse({
      kind: "challenge",
      requestId: "0d5c7d5a-1c44-4a5e-9e07-9a1c9db70f01",
      input: {
        prompt: "Build a URL shortener with rate limiting.",
        scope: "feature",
        difficulty: "medium",
        clarificationContext: null,
        clarificationHistory: [],
        attachments: [
          { filename: "extracted notes.log", text: "request logged" },
          { filename: "spec.pdf", text: "extracted PDF text" },
        ],
      },
    });
    if (parsed.kind !== "challenge") throw new Error("wrong kind");
    expect(parsed.input.attachments).toHaveLength(2);
  });

  test("generation requests reject path traversal and oversized text", () => {
    const build = (attachments: unknown) => ({
      kind: "challenge",
      requestId: "0d5c7d5a-1c44-4a5e-9e07-9a1c9db70f01",
      input: {
        prompt: "Build a URL shortener with rate limiting.",
        scope: "feature",
        difficulty: "medium",
        clarificationContext: null,
        clarificationHistory: [],
        attachments,
      },
    });
    expect(() =>
      generationRequestSchema.parse(
        build([{ filename: "../secrets.env", text: "nope" }]),
      ),
    ).toThrow();
    expect(() =>
      generationRequestSchema.parse(
        build([{ filename: "big.txt", text: "x".repeat(1_500_001) }]),
      ),
    ).toThrow();
  });

  test("generation requests reject more than five attachments", () => {
    expect(() =>
      generationRequestSchema.parse({
        kind: "challenge",
        requestId: "0d5c7d5a-1c44-4a5e-9e07-9a1c9db70f01",
        input: {
          prompt: "Build a URL shortener with rate limiting.",
          scope: "feature",
          difficulty: "medium",
          clarificationContext: null,
          clarificationHistory: [],
          attachments: Array.from({ length: 6 }, (_, index) => ({
            filename: `file-${index}.ts`,
            text: "export {};",
          })),
        },
      }),
    ).toThrow();
  });

  test("generation context renders attachments as untrusted blocks", () => {
    const task = generationTask({
      prompt: "Build a URL shortener with rate limiting.",
      scope: "feature",
      difficulty: "medium",
      clarificationContext: null,
      learner: {
        profileId: "profile",
        preferences: {
          experienceLevel: "intermediate",
          languages: [],
          stack: [],
          learningGoals: [],
          currentFocus: null,
          aboutMe: null,
          topicFamiliarity: [],
          knownConcepts: [],
          learningGoal: null,
          includeRecentChallenges: false,
        } as never,
        recentChallenges: [],
      },
      attachments: [attachment],
    });
    expect(task.context).toContain('untrusted_attachment filename="router.ts"');
    expect(task.context).toContain("const app = new Hono();");
  });

  test("generation context omits the block without attachments", () => {
    const task = generationTask({
      prompt: "Build a URL shortener with rate limiting.",
      scope: "feature",
      difficulty: "medium",
      clarificationContext: null,
      learner: {
        profileId: "profile",
        preferences: {
          experienceLevel: "intermediate",
          languages: [],
          stack: [],
          learningGoals: [],
          currentFocus: null,
          aboutMe: null,
          topicFamiliarity: [],
          knownConcepts: [],
          learningGoal: null,
          includeRecentChallenges: false,
        } as never,
        recentChallenges: [],
      },
    });
    expect(task.context).not.toContain("untrusted_attachment");
  });
});
