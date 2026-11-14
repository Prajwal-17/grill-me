import { constants } from "node:fs";
import { access, lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ProjectFrozenSpecification,
  ModelSelection,
} from "@repo/backend/shared/contracts";
import {
  EXPERIENCE,
  FOCUS,
  LANGUAGES,
  STACK,
  optionLabel,
  optionLabels,
} from "@repo/backend/shared/preferences";
import { AppError } from "../../shared/errors/app-error";
import type { ProfilePreferences } from "../profiles/profile.schema";
import {
  deleteProjectJournal,
  emptyProjectJournal,
  projectFileRecord,
  projectRelativePath,
  readProjectJournal,
  withGeneratedFile,
  writeProjectJournal,
  type ProjectJournal,
  type ProjectLayout,
} from "./project-workspace";
import type { ChallengeRow } from "./challenge.model";

export const frozenSpecificationPath = "CHALLENGE.md";

export function frozenProjectSpecification(input: {
  challenge: ChallengeRow;
  request: string;
  preferences: ProfilePreferences;
  selection?: ModelSelection;
  at?: Date;
}): ProjectFrozenSpecification {
  const { challenge, preferences } = input;
  return {
    version: 1,
    challengeId: challenge.id,
    profileId: challenge.profileId,
    challengeNumber: challenge.number,
    title: challenge.title,
    request: input.request.trim().slice(0, 4_000),
    scope: challenge.scope,
    difficulty: challenge.difficulty,
    problemStatement: challenge.problemStatement,
    expectedOutcome: challenge.expectedOutcome,
    implementationBoundary: challenge.implementationBoundary,
    constraints: [...challenge.constraints],
    objectives: challenge.implementationMilestones.length
      ? [...challenge.implementationMilestones]
      : [challenge.expectedOutcome],
    acceptanceCriteria: [...challenge.completionCriteria],
    durationEstimate: {
      minMinutes: challenge.durationMinMinutes,
      maxMinutes: challenge.durationMaxMinutes,
    },
    starterCode:
      challenge.starterCode && !/^\s*={3,}\s*FILE:/m.test(challenge.starterCode)
        ? challenge.starterCode
        : null,
    stack: {
      experienceLevel:
        optionLabel(EXPERIENCE, preferences.experienceLevel) || null,
      languages: optionLabels(LANGUAGES, preferences.languages),
      stack: optionLabels(STACK, preferences.stack),
      currentFocus: optionLabel(FOCUS, preferences.currentFocus) || null,
    },
    model: {
      selection: input.selection ?? null,
      label: input.selection?.model ?? "provider default",
    },
    frozenAt: (input.at ?? new Date()).toISOString(),
  };
}

function list(items: readonly string[], ordered = false) {
  return items
    .map((item, index) =>
      ordered
        ? `${index + 1}. ${item.trim()}`
        : `- ${item.replace(/\s+/g, " ").trim()}`,
    )
    .join("\n");
}

/** The visible, immutable challenge contract written before scaffolding runs. */
export function projectChallengeMarkdown(
  specification: ProjectFrozenSpecification,
) {
  const sections = [
    `# Challenge #${specification.challengeNumber}: ${specification.title}`,
    `> Frozen preparation specification. Project preparation and later reviews use this contract. Do not rewrite its requirements.\n>\n> Frozen ${specification.frozenAt}`,
    `## Original request\n\n${specification.request}`,
    `## Task\n\n${specification.problemStatement.trim()}`,
    `## Expected outcome\n\n${specification.expectedOutcome.trim()}`,
    `## Acceptance criteria (rubric)\n\n${list(
      specification.acceptanceCriteria,
      true,
    )}`,
    `## Objectives\n\n${list(specification.objectives, true)}`,
  ];
  if (specification.constraints.length)
    sections.push(`## Constraints\n\n${list(specification.constraints)}`);
  if (specification.implementationBoundary)
    sections.push(
      `## Implementation boundary\n\n${specification.implementationBoundary.trim()}`,
    );
  const stack = [
    specification.stack.languages.length
      ? `Languages: ${specification.stack.languages.join(", ")}`
      : "",
    specification.stack.stack.length
      ? `Frameworks and tools: ${specification.stack.stack.join(", ")}`
      : "",
    specification.stack.experienceLevel
      ? `Experience: ${specification.stack.experienceLevel}`
      : "",
    specification.stack.currentFocus
      ? `Current focus: ${specification.stack.currentFocus}`
      : "",
  ].filter(Boolean);
  sections.push(
    [
      "## Preparation context",
      `Scope: ${specification.scope}. Difficulty: ${specification.difficulty}. Estimated duration: ${specification.durationEstimate.minMinutes}–${specification.durationEstimate.maxMinutes} minutes.`,
      ...(stack.length ? [stack.join("\n")] : []),
      "Not every project uses JavaScript or Node. Follow the frozen stack and language implied by the request.",
    ].join("\n\n"),
  );
  if (specification.starterCode?.trim())
    sections.push(
      "## Starter code supplied with the challenge\n\n```text\n" +
        specification.starterCode.trim() +
        "\n```",
    );
  sections.push(
    [
      "## Project boundary",
      "This folder is the prepared practice project. Grill Me writes separate implementation, configuration, migration, fixture, documentation, rubric, milestone, and test files here. The exercise's core interfaces and reasoning stay as explicit TODO work for the developer.",
      "Existing files are never silently replaced. Failed, cancelled, or interrupted preparation leaves every partial file in place.",
    ].join("\n\n"),
  );
  return sections.join("\n\n") + "\n";
}

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function specificationConflict(message: string) {
  return new AppError("PROJECT_SCAFFOLD_SPEC_CONFLICT", message, 409, false, {
    path: frozenSpecificationPath,
  });
}

/**
 * Save the frozen specification before any model call. The markdown file is
 * journaled before it is written; a write failure restores the previous journal
 * so later preparation cannot mistake an unknown file for generated content.
 */
export async function writeFrozenSpecification(
  layout: ProjectLayout,
  specification: ProjectFrozenSpecification,
  now: () => Date = () => new Date(),
): Promise<ProjectJournal> {
  projectRelativePath(frozenSpecificationPath);
  const content = projectChallengeMarkdown(specification);
  const record = projectFileRecord(content, now());
  const target = join(layout.projectRoot, frozenSpecificationPath);
  const root = await lstat(layout.projectRoot).catch(() => null);
  if (!root || root.isSymbolicLink() || !root.isDirectory())
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "The challenge project folder must be a real folder before the frozen specification can be saved.",
      400,
    );

  let current: Awaited<ReturnType<typeof lstat>> | null = null;
  try {
    current = await lstat(target);
  } catch (error) {
    if (fsCode(error) !== "ENOENT")
      throw new AppError(
        "PROJECT_ROOT_UNAVAILABLE",
        "The frozen specification could not be inspected.",
        503,
        true,
      );
  }
  if (current) {
    if (current.isSymbolicLink() || !current.isFile())
      throw specificationConflict(
        "The frozen specification path is not a regular file.",
      );
    let existing: string;
    try {
      existing = await readFile(target, "utf8");
    } catch {
      throw new AppError(
        "PROJECT_ROOT_UNAVAILABLE",
        "The frozen specification could not be read.",
        503,
        true,
      );
    }
    if (existing !== content)
      throw specificationConflict(
        "The frozen specification already exists with different content. Start a fresh project attempt instead of rewriting it.",
      );
    const journal = await readProjectJournal(layout);
    if (!journal) {
      const recovered = {
        ...emptyProjectJournal(layout.projectDirectory, now()),
        files: { [frozenSpecificationPath]: record },
      };
      await writeProjectJournal(layout, recovered);
      return recovered;
    }
    if (journal.files[frozenSpecificationPath]?.sha256 !== record.sha256)
      throw specificationConflict(
        "The frozen specification journal no longer matches CHALLENGE.md. Inspect the project folder before retrying.",
      );
    return journal;
  }

  const previous = await readProjectJournal(layout);
  const next = withGeneratedFile(
    previous ?? emptyProjectJournal(layout.projectDirectory, now()),
    frozenSpecificationPath,
    record,
  );
  await writeProjectJournal(layout, next);
  try {
    await access(layout.projectRoot, constants.R_OK | constants.W_OK);
    await writeFile(target, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    try {
      if (previous) await writeProjectJournal(layout, previous);
      else await deleteProjectJournal(layout);
    } catch {
      throw new AppError(
        "PROJECT_METADATA_UNAVAILABLE",
        "The frozen specification could not be saved and its journal could not be restored. Inspect the project folder before retrying.",
        503,
        false,
      );
    }
    if (fsCode(error) === "EEXIST")
      throw specificationConflict(
        "The frozen specification appeared while it was written. Start a fresh attempt.",
      );
    throw new AppError(
      "PROJECT_ROOT_UNAVAILABLE",
      "The frozen specification could not be written.",
      503,
      true,
    );
  }
  return next;
}
