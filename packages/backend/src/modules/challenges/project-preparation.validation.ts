import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import {
  projectScaffoldReportSchema,
  type ProjectCheckProposal,
  type ProjectCommand,
  type ProjectCommandProposal,
  type ProjectFileRole,
  type ProjectFrozenSpecification,
  type ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { canonicalPath } from "../../shared/storage/canonical-path";
import {
  projectRelativePath,
  readProjectJournal,
  type ProjectJournal,
  type ProjectLayout,
} from "./project-workspace";
import {
  frozenSpecificationPath,
  projectChallengeMarkdown,
} from "./project-preparation.spec";

export type ProjectScaffoldValidationContext = {
  layout: ProjectLayout;
  specification: ProjectFrozenSpecification;
  /**
   * Persisted command execution records. When present, reported check results
   * must match the latest real execution instead of being accepted as prose.
   */
  commands?: ProjectCommand[];
  /** Kept for compatibility with callers that validate reports without commands. */
  allowExecutionResults?: boolean;
};

function invalid(message: string, issues?: string[]) {
  return new AppError(
    "PROJECT_SCAFFOLD_INVALID",
    message,
    502,
    true,
    issues?.length ? { issues: issues.slice(0, 40) } : undefined,
  );
}

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function inside(root: string, candidate: string) {
  const value = relative(root, candidate);
  return (
    Boolean(value) &&
    value !== ".." &&
    !value.startsWith(".." + sep) &&
    !isAbsolute(value)
  );
}

function hash(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedCwd(value: string) {
  return value.trim() === "" || value.trim() === "." ? "." : value.trim();
}

function commandSignature(
  proposal: Pick<ProjectCommandProposal, "command" | "cwd">,
) {
  return `${proposal.command.trim()}\0${normalizedCwd(proposal.cwd)}`;
}

function specificationText(specification: ProjectFrozenSpecification) {
  return [
    specification.request,
    specification.problemStatement,
    specification.expectedOutcome,
    specification.implementationBoundary ?? "",
    ...specification.objectives,
    ...specification.acceptanceCriteria,
    ...specification.constraints,
  ].join("\n");
}

function requestsMultipleFiles(specification: ProjectFrozenSpecification) {
  const text = specificationText(specification);
  return [
    /\bmulti[- ]file\b/i,
    /\bmultiple\b[^.\n]{0,80}\bfiles\b/i,
    /\bseparate\b[^.\n]{0,120}\bfiles\b/i,
    /\b(?:split|divided|organi[sz]ed)\b[^.\n]{0,80}\b(?:into|across|in)\b[^.\n]{0,40}\b(?:files|modules)\b/i,
    /\b(?:several|multiple|distinct|individual)\s+(?:source|code|module|implementation)\s+files\b/i,
    /\b(?:separate|multiple|several)\s+modules\b/i,
    /\bmodular\b/i,
  ].some((pattern) => pattern.test(text));
}

function requiresMigration(specification: ProjectFrozenSpecification) {
  const text = specificationText(specification).replace(
    /\b(?:no|not|never|without|avoid)\b[^.\n]{0,100}\b(?:migrations?|database|databases|sql|sqlite|postgres(?:ql)?|mysql|mariadb|mongo(?:db)?|dynamodb|persistent storage|data store)\b/gi,
    "",
  );
  const stack = [
    ...specification.stack.languages,
    ...specification.stack.stack,
    specification.stack.currentFocus ?? "",
  ].join(" ");
  const dataSignal =
    /\b(?:migrations?|database|databases|sql|sqlite|postgres(?:ql)?|mysql|mariadb|mongo(?:db)?|dynamodb|prisma|drizzle|sequelize|typeorm|knex|persist(?:ence|ent|ed|ing)?|data store|storage (?:layer|boundary)|url shortener|short link|link shortener)\b/i;
  return dataSignal.test(text) || dataSignal.test(stack);
}

function triviallyFailing(command: string) {
  const value = command.trim().replace(/\s+/g, " ");
  if (!value) return true;
  if (/^(?:false|exit(?:\s+[1-9]\d*)?|!\s*true)$/i.test(value)) return true;
  if (
    /^(?:(?:sh|bash|zsh|dash|fish)\s+-c\s+)?(['"])(?:false|exit(?:\s+[1-9]\d*)?)\1$/i.test(
      value,
    )
  )
    return true;
  if (
    /(?:^|\s)(?:-e|--eval|-c|-r)(?:\s|=)/.test(value) &&
    /(?:process\.exit\s*\(\s*[1-9]\d*\s*\)|Deno\.exit\s*\(\s*[1-9]\d*\s*\)|sys\.exit\s*\(\s*[1-9]\d*\s*\)|\bexit\s*\(\s*[1-9]\d*\s*\)|raise\s+SystemExit)/i.test(
      value,
    )
  )
    return true;
  return /[;&|]\s*(?:false|exit\s+[1-9]\d*)\s*$/i.test(value);
}

function checkSignature(check: ProjectCheckProposal) {
  return check.command
    ? `${check.command.trim()}\0${normalizedCwd(check.cwd)}`
    : null;
}

function executedCheck(
  check: ProjectCheckProposal,
  commands: ProjectCommand[],
) {
  const signature = checkSignature(check);
  if (!signature) return undefined;
  return [...commands]
    .reverse()
    .find(
      (command) =>
        command.purpose === "check" &&
        command.checkId === check.id &&
        command.result !== null &&
        `${command.command.trim()}\0${normalizedCwd(command.cwd)}` ===
          signature,
    );
}

function actualCheckStatus(command: ProjectCommand) {
  if (
    command.result?.status === "timed_out" ||
    command.result?.status === "cancelled" ||
    command.result?.status === "spawn_failed"
  )
    return "blocked" as const;
  if (command.status === "succeeded") return "passed" as const;
  if (command.status === "failed") return "failed" as const;
  return "blocked" as const;
}

function setupFailed(commands: ProjectCommand[]) {
  return commands.some(
    (command) =>
      (command.purpose === "setup" || command.install) &&
      (command.status === "failed" || command.status === "timed_out"),
  );
}

export async function validateProjectScaffoldReport(
  value: unknown,
  context: ProjectScaffoldValidationContext,
): Promise<ProjectScaffoldReport> {
  const parsed = projectScaffoldReportSchema.safeParse(value);
  if (!parsed.success)
    throw invalid(
      "The completion report does not match the required contract. Return every field, use project-relative paths, and do not add unknown fields.",
      z.prettifyError(parsed.error).split("\n").filter(Boolean).slice(0, 40),
    );
  const report = parsed.data;
  const { layout, specification } = context;

  const root = await canonicalPath(layout.projectRoot).catch(() => {
    throw invalid("The project folder is unavailable to validate the report.");
  });
  const journal: ProjectJournal | null = await readProjectJournal(layout);
  if (!journal)
    throw invalid(
      "The project journal is missing. Preparation cannot verify generated files.",
    );
  const contents = new Map<string, string>();

  async function trackedFile(path: string) {
    let normalized: string;
    try {
      normalized = projectRelativePath(path);
    } catch {
      throw invalid(`Reported project path is not safe: ${path}`);
    }
    const cached = contents.get(normalized);
    if (cached !== undefined) return cached;
    const record = journal!.files[normalized];
    if (!record)
      throw invalid(
        `The completion report lists ${normalized}, but Grill Me did not generate that file. Create it with the project tools or remove it from the report.`,
      );
    const target = join(layout.projectRoot, normalized);
    let info;
    try {
      info = await lstat(target);
    } catch (error) {
      if (fsCode(error) === "ENOENT")
        throw invalid(
          `The completion report lists ${normalized}, but the file is missing from disk.`,
        );
      throw invalid(`Reported file cannot be inspected: ${normalized}`);
    }
    if (info.isSymbolicLink() || !info.isFile())
      throw invalid(`Reported path is not a regular file: ${normalized}`);
    const canonical = await canonicalPath(target).catch(() => {
      throw invalid(`Reported file cannot be resolved: ${normalized}`);
    });
    if (canonical !== root && !inside(root, canonical))
      throw invalid(`Reported file escapes the project root: ${normalized}`);
    let buffer: Buffer;
    try {
      buffer = await readFile(canonical);
    } catch {
      throw invalid(`Reported file cannot be read: ${normalized}`);
    }
    if (hash(buffer) !== record.sha256 || buffer.length !== record.bytes)
      throw invalid(
        `Reported file ${normalized} no longer matches the generated-file journal. Re-read it or restore the generated content before completing.`,
      );
    const text = buffer.toString("utf8");
    contents.set(normalized, text);
    return text;
  }

  async function directoryCwd(value: string) {
    const cwd = normalizedCwd(value);
    if (cwd === ".") return cwd;
    let normalized: string;
    try {
      normalized = projectRelativePath(cwd);
    } catch {
      throw invalid(
        `A proposed working directory is not project-relative: ${cwd}`,
      );
    }
    let info;
    try {
      info = await lstat(join(layout.projectRoot, normalized));
    } catch {
      throw invalid(`A proposed working directory does not exist: ${cwd}`);
    }
    if (info.isSymbolicLink() || !info.isDirectory())
      throw invalid(`A proposed working directory is not a folder: ${cwd}`);
    const canonical = await canonicalPath(
      join(layout.projectRoot, normalized),
    ).catch(() => {
      throw invalid(`A proposed working directory cannot be resolved: ${cwd}`);
    });
    if (canonical !== root && !inside(root, canonical))
      throw invalid(
        `A proposed working directory escapes the project root: ${cwd}`,
      );
    return normalized;
  }

  const specContent = await trackedFile(frozenSpecificationPath);
  if (specContent !== projectChallengeMarkdown(specification))
    throw invalid(
      "CHALLENGE.md no longer matches the frozen specification. The frozen contract must stay unchanged.",
    );

  const filePaths = new Set<string>();
  const sourceFiles: { path: string; content: string }[] = [];
  for (const file of report.files) {
    if (filePaths.has(file.path))
      throw invalid(`The completion report lists ${file.path} more than once.`);
    filePaths.add(file.path);
    const content = await trackedFile(file.path);
    if (file.path !== frozenSpecificationPath && file.role === "source")
      sourceFiles.push({ path: file.path, content });
  }
  const rolePaths = (role: ProjectFileRole) =>
    report.files
      .filter(
        (file) => file.path !== frozenSpecificationPath && file.role === role,
      )
      .map((file) => file.path);
  const unreported = Object.keys(journal.files).filter(
    (path) => path !== frozenSpecificationPath && !filePaths.has(path),
  );
  if (unreported.length)
    throw invalid(
      "The completion report must list every generated project file. Unreported: " +
        unreported.slice(0, 10).join(", "),
    );
  if (!sourceFiles.length)
    throw invalid(
      "The completion report needs at least one source file that Grill Me generated.",
    );
  if (
    sourceFiles.length === 1 &&
    /^starter\.[a-z0-9]+$/i.test(basename(sourceFiles[0]!.path))
  )
    throw invalid(
      "A single starter file is not a prepared multi-file project. Create the real source files separately.",
    );
  if (sourceFiles.length === 1) {
    const markers =
      sourceFiles[0]!.content.match(
        /^\s*(?:\/\/|#|--|;)\s*(?:file|filename)\s*[:=]\s*\S+/gim,
      )?.length ?? 0;
    if (markers >= 2)
      throw invalid(
        "The only source file contains concatenated file boundaries. Split each file into a separate journaled project file.",
      );
  }
  if (requestsMultipleFiles(specification) && sourceFiles.length < 2)
    throw invalid(
      "The frozen specification asks for a multi-file project. Create separate source files for the surrounding modules instead of one source file.",
    );
  if (!rolePaths("config").length)
    throw invalid(
      "The completion report needs stack-appropriate configuration generated as real files. Any ecosystem's configuration is acceptable; a package.json is not required.",
    );
  if (!rolePaths("test").length)
    throw invalid(
      "The completion report needs at least one generated test file for the exercise.",
    );
  if (
    !report.files.some(
      (file) =>
        file.role === "documentation" && file.path !== frozenSpecificationPath,
    )
  )
    throw invalid(
      "The completion report needs generated documentation, such as a README, rubric, or milestones file, separate from the frozen CHALLENGE.md.",
    );
  if (requiresMigration(specification) && !rolePaths("migration").length)
    throw invalid(
      "The frozen specification or stack requires persistent storage, so the completion report needs a generated migration or schema file.",
    );

  const todoKeys = new Set<string>();
  for (const todo of report.todos) {
    const content = await trackedFile(todo.path);
    const lines = content.split("\n");
    if (todo.line > lines.length)
      throw invalid(
        `TODO location ${todo.path}:${todo.line} is past the end of the file.`,
      );
    const key = `${todo.path}:${todo.line}`;
    if (todoKeys.has(key))
      throw invalid(`The completion report lists TODO ${key} more than once.`);
    todoKeys.add(key);
    if (!/\bTODO\b/i.test(lines[todo.line - 1] ?? ""))
      throw invalid(
        `TODO location ${key} does not point at a line containing an explicit TODO marker.`,
      );
  }
  if (!report.todos.length)
    throw invalid(
      "The completion report needs at least one explicit TODO location for the exercise's unfinished interface or core behavior.",
    );
  if (!report.todos.some((todo) => rolePaths("source").includes(todo.path)))
    throw invalid(
      "At least one reported TODO must point into a generated source file. Documentation or test TODOs alone do not leave the exercise unfinished.",
    );

  const checkIds = new Set<string>();
  const checkCommands = new Set<string>();
  const todoChecks = report.checks.filter(
    (check) => check.intent === "todo_exercise",
  );
  for (const check of report.checks) {
    if (checkIds.has(check.id))
      throw invalid(`Check IDs must be distinct; ${check.id} repeats.`);
    checkIds.add(check.id);
    const signature = checkSignature(check);
    if (signature) {
      if (checkCommands.has(signature))
        throw invalid(
          `Checks must use distinct commands; ${check.id} repeats another check.`,
        );
      checkCommands.add(signature);
    }
    if (check.kind !== "manual" && !check.command)
      throw invalid(
        `Check ${check.id} needs an explicit command or must use kind "manual".`,
      );
    if (check.intent === "todo_exercise" && check.expected !== "fail")
      throw invalid(
        `Check ${check.id} exercises unfinished TODO work, so its expected result must be "fail".`,
      );
    if (check.intent === "todo_exercise") {
      if (check.kind !== "test" || !check.command)
        throw invalid(
          `TODO exercise check ${check.id} needs a real test command. Manual checks cannot stand in for the failing exercise test.`,
        );
      if (triviallyFailing(check.command))
        throw invalid(
          `TODO exercise check ${check.id} runs an unconditional failure instead of a test. Use a generated test that exercises the unfinished work.`,
        );
    }
    if (check.intent === "verify" && check.expected !== "pass")
      throw invalid(
        `Check ${check.id} verifies the scaffold, so its expected result must be "pass".`,
      );
    await directoryCwd(check.cwd);
  }
  if (!todoChecks.length)
    throw invalid(
      'The report needs an intentionally failing todo_exercise test check with expected result "fail".',
    );
  if (!report.checks.some((check) => check.intent === "verify"))
    throw invalid(
      "The report needs at least one verify check for the scaffold's supporting wiring.",
    );

  const results = new Map<string, (typeof report.results)[number]>();
  const commands = context.commands ?? [];
  const executionResultsAllowed =
    context.allowExecutionResults === true || context.commands !== undefined;
  const setupDidFail = setupFailed(commands);
  for (const result of report.results) {
    if (results.has(result.checkId))
      throw invalid(
        `Check results must be distinct; ${result.checkId} repeats.`,
      );
    if (!checkIds.has(result.checkId))
      throw invalid(
        `Check result ${result.checkId} does not match a reported check.`,
      );
    results.set(result.checkId, result);
    const check = report.checks.find((entry) => entry.id === result.checkId)!;
    const executed = executedCheck(check, commands);
    if (executed) {
      const actual = actualCheckStatus(executed);
      if (result.status === "not_run")
        throw invalid(
          `Check ${check.id} was executed with an actual ${actual} result. Report that result instead of "not_run".`,
        );
      if (result.status !== actual)
        throw invalid(
          `Check ${check.id} reports "${result.status}", but its latest actual execution was ${actual}. Reports cannot change command results.`,
        );
      if (check.intent === "todo_exercise" && result.status === "passed")
        throw invalid(
          `TODO exercise check ${check.id} unexpectedly passed. The unfinished core logic must leave it failing.`,
        );
      continue;
    }
    if (!executionResultsAllowed && result.status !== "not_run")
      throw invalid(
        'Commands have not been executed yet, so every check result must be "not_run".',
      );
    if (result.status === "passed" || result.status === "failed")
      throw invalid(
        `Check ${check.id} reports "${result.status}", but there is no matching server command execution record. Run the exact check command first.`,
      );
    if (result.status === "blocked" && !setupDidFail)
      throw invalid(
        `Check ${check.id} is reported "blocked", but no setup or dependency command failed. Use "not_run" when the check was not attempted.`,
      );
  }
  for (const check of report.checks)
    if (!results.has(check.id))
      throw invalid(`Check ${check.id} is missing a result.`);

  const setupCommands = new Set<string>();
  for (const command of report.setup) {
    const signature = commandSignature(command);
    if (setupCommands.has(signature))
      throw invalid("Setup commands must be distinct.");
    setupCommands.add(signature);
    await directoryCwd(command.cwd);
  }
  const runCommands = new Set<string>();
  for (const command of report.run) {
    const signature = commandSignature(command);
    if (runCommands.has(signature))
      throw invalid("Run commands must be distinct.");
    runCommands.add(signature);
    await directoryCwd(command.cwd);
  }

  return report;
}
