import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EMPTY_GUIDED } from "@repo/preferences";
import { createOpenAIModel } from "../src/modules/ai/openai.model";
import { db, migrateDatabase } from "../src/shared/database/db";
import { createProfileService } from "../src/modules/profiles/profile.service";
import {
  profileModel,
  profilePreferencesModel,
} from "../src/modules/profiles/profile.model";
import { challengeModel } from "../src/modules/challenges/challenge.model";
import { messageModel } from "../src/modules/messages/message.model";
import { createChallengeService } from "../src/modules/challenges/challenge.service";
import {
  challengeContentSchema,
  type BuildDifficulty,
  type BuildScope,
} from "../src/modules/challenges/challenge.schema";
import { validateReview } from "../src/modules/reviews/review.schema";
import { evaluationsPath } from "../src/shared/storage/paths";
import {
  PROMPT_VERSION,
  CALIBRATION_VERSION,
} from "../src/modules/ai/prompts/core";

const scopes: BuildScope[] = ["focused", "feature", "system"];
const difficulties: BuildDifficulty[] = ["easy", "medium", "hard", "grill"];
const cases = scopes.flatMap((scope, s) =>
  difficulties.map((difficulty, d) => ({
    scope,
    difficulty,
    prompt: [
      "Practice JavaScript promises",
      "Practice React state transitions",
      "Practice Go channels",
    ][(s + d) % 3]!,
    familiarity: d === 0 ? ("new" as const) : ("practiced" as const),
  })),
);
if (!process.argv.includes("--run")) {
  console.log(
    "Opt-in paid prompt evaluation. Add --run to use the configured AI provider.\nGenerations, assistance and synthetic review cases are saved under the separate prompt-evaluations@grill-me.local profile.\nResults include topic checks, readability measurements, assistance samples and review fairness outcomes. Human inspection remains necessary for semantic quality.\n",
  );
  console.table(cases);
} else {
  const profiles = createProfileService(profileModel, profilePreferencesModel);
  const llm = createOpenAIModel();
  const challenges = createChallengeService({
    challenges: challengeModel,
    messages: messageModel,
    profiles,
    llm,
  });
  const results: unknown[] = [];
  try {
    await migrateDatabase();
    const profile = await profiles.start("prompt-evaluations@grill-me.local");
    await profiles.savePreferences(profile.id, {
      ...EMPTY_GUIDED,
      aboutMe: "Practicing recently learned concepts through implementation.",
      experienceLevel: "junior",
    });
    for (const input of cases) {
      try {
        const challenge = await challenges.generate(
          {
            ...input,
            timeBudgetMinutes: null,
            emphasis: null,
            clarificationContext: null,
            clarificationHistory: [],
          },
          profile.id,
        );
        const text = [
          challenge.problemStatement,
          ...challenge.completionCriteria,
        ].join(" ");
        const topic = input.prompt.replace(/^Practice /, "").split(" ")[0]!;
        let hint = "";
        for await (const delta of llm.generateHint({
          challenge,
          messages: [],
          learner: {
            profileId: profile.id,
            preferences: await profiles.getPreferences(profile.id),
            recentChallenges: [],
          },
        }))
          hint += delta;
        results.push({
          kind: "generation",
          input,
          challenge,
          checks: {
            bandMatches: challenge.contextualDifficulty === input.difficulty,
            noNumericDifficulty: challenge.estimatedDifficultyScore === null,
            topicMentioned: text.toLowerCase().includes(topic.toLowerCase()),
            emptyLegacyArrays:
              !challenge.constraints.length &&
              !challenge.implementationMilestones.length,
          },
          readability: {
            words: text.split(/\s+/).length,
            criteria: challenge.completionCriteria.length,
            longestCriterion: Math.max(
              ...challenge.completionCriteria.map(
                (criterion) => criterion.length,
              ),
            ),
          },
          limitedAssistance: {
            hint,
            words: hint.split(/\s+/).length,
            containsCodeFence: hint.includes("```"),
          },
        });
      } catch (error) {
        results.push({
          kind: "generation",
          input,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const content = challengeContentSchema.parse({
      title: "Group words by initial",
      scope: "focused",
      difficulty: "easy",
      contextualDifficulty: "easy",
      estimatedDifficultyScore: null,
      difficultyReason: "Direct grouping.",
      topic: "JavaScript maps",
      implementationBoundary: "",
      problemStatement:
        "Implement groupWords(words) for an array of nonempty strings, returning an object keyed by each first character.",
      expectedOutcome: "Submit the source function.",
      constraints: [],
      starterCode: null,
      completionCriteria: [
        "Every input word appears under its first character; repeated initials keep all words in input order.",
        "Empty input returns an empty object.",
      ],
      durationEstimate: { minMinutes: 10, maxMinutes: 20 },
      implementationMilestones: [],
    });
    const { toChallenge } =
      await import("../src/modules/challenges/challenge.utils");
    const fixture = toChallenge(
      await challengeModel.create(
        profile.id,
        content,
        "Prompt evaluation review fixture",
        { developerContext: { updatedAt: null } },
      ),
    );
    for (const sample of [
      {
        name: "valid alternative without prose or authored tests",
        expected: "accepted",
        code: "export const groupWords = words => words.reduce((groups, word) => { (groups[word[0]] ??= []).push(word); return groups; }, {});",
      },
      {
        name: "demonstrated requirement violation",
        expected: "needs_revision",
        code: "export const groupWords = words => ({});",
      },
      {
        name: "missing essential source",
        expected: "needs_evidence",
        code: "// Implementation file was omitted.",
      },
    ]) {
      try {
        const evidence = {
          status: "inspection_only" as const,
          reason:
            "Evaluation fixture: no execution claimed. Missing environment is not a defect.",
          checks: [],
        };
        const raw = await llm.judge!({
          challenge: fixture,
          content: "Review the supplied source.",
          attachments: [{ filename: "answer.js", text: sample.code }],
          assistance: { hints: 2, guidance: true },
          evidence,
        });
        const review = validateReview(raw, fixture, evidence);
        results.push({
          kind: "review-fairness",
          sample,
          review,
          matchesExpectedVerdict: review.result.verdict === sample.expected,
        });
      } catch (error) {
        results.push({
          kind: "review-fairness",
          sample,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const directory = evaluationsPath();
    await mkdir(directory, { recursive: true });
    const path = join(directory, `prompt-${Date.now()}.json`);
    await writeFile(
      path,
      JSON.stringify(
        {
          promptVersion: PROMPT_VERSION,
          calibrationVersion: CALIBRATION_VERSION,
          results,
          inspectionGuide: [
            "Topic fidelity: implementation must exercise the requested concept.",
            "Readability: direct task, observable requirements, concise submission instruction; word counts are informational.",
            "Limited assistance: no complete implementation or accumulated solution leakage.",
            "Review fairness: accept equivalent implementations, avoid prose/test demands, distinguish environment limits from defects.",
          ],
        },
        null,
        2,
      ),
    );
    console.log(`Evaluation report: ${path}`);
  } finally {
    await db.$client.close();
  }
}
