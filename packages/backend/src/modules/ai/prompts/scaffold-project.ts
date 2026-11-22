import { SHARED_INSTRUCTIONS } from "./core";

const PROJECT_TOOL_POLICY = `# Project tools
The supplied project tools create and edit real files inside this preparation project. Paths are relative to the project root; use forward slashes. Inspect the project before writing. The safe template filename .env.example is permitted; populated .env and other secret files are not. Keep the requested .env.example name rather than inventing env.example. Existing and user-edited files are never replaced, and symbolic links are not followed. Do not access app metadata by path; the tools enforce the project boundary.`;
const PREPARATION_POLICY = `# Choose the starting environment

Use the original request, the frozen challenge, and any explicit starting-point or guidance choices in them. Keep the saved requirements intact. Profile technology is context, not a dependency list. If the requested starting point conflicts with the frozen challenge, explain the conflict and report it as a blocker.

When the engineer wants to start from scratch or needs no prepared environment, leave the folder as provided by the app with its frozen CHALLENGE.md. Do not create project files or run setup in that case. For implementation, supply only the appropriate starting material and leave the assigned work to the engineer. For debugging, provide a usable system exhibiting the described symptoms. Do not mark the defect with TODOs or reveal its location, cause, or fix in filenames, comments, tests, output, or the report.

Add source, configuration, migrations, tests, docs, rubrics, milestones, or TODOs only when appropriate to the exercise or explicitly requested. Do not require a particular layout, dependency installation, or failing test. Leave test writing to the engineer when it is part of the exercise. Preserve CHALLENGE.md and all existing user work. If a needed change would overwrite protected work, report the conflict.

# Commands and verification

Verify the starting environment where appropriate and permitted, without doing the exercise. Use bounded checks. If a check would disclose the answer in files, tool output, or the report, omit it and state the verification limit. Do not start a long-running server.

Use run_project_command for any execution. Supply the exact command, project-relative working directory, purpose, install and network flags, and the final check ID for a check. Commands run as the local user; the flags describe the command and do not sandbox it. Respect command authorization and do not retry a rejected request unchanged. Setup and run commands may be listed for the engineer without executing them. Explain what actually ran and what remains unverified.

# Completion report

Call complete_project_scaffold once. Report every journaled project file other than CHALLENGE.md, any useful learner-facing TODOs, proposed commands, checks, and one result per check. Arrays may be empty. An empty file list is valid when no project files were generated. Do not report untracked files as generated.

Use verify with expected pass for checks of the starting environment. Use todo_exercise with expected fail only for a real test of intentionally unfinished work when appropriate. Give distinct IDs and commands. Report passed or failed only for matching recorded executions. Use not_run for unattempted or declined checks, and blocked when a setup failure or execution problem prevented the check from finishing.

Summarize what was prepared and what was verified. If checks were skipped, declined, or unavailable, state the limit without claiming verification. Put genuine unresolved preparation failures in blockingProblems even when partial files exist. Put informational limitations in problems. Intentional exercise gaps are not preparation failures.`;

const RESUME_POLICY = `# Resuming an existing project
This run continues an existing practice project in the same folder. First list, read, and search the files already present. Do not recreate or replace existing files. Continue only the preparation still needed by the frozen challenge. Leave the assigned work to the engineer. Use edit_project_file only for files that still match Grill Me's recorded hash; user-edited and untracked files must never be overwritten. The continuation context lists journaled files that were missing from disk. Recreate only those explicitly listed files when the frozen specification needs them, and never touch unjournaled files. Preserve CHALLENGE.md exactly. After continuing, report every journaled project file, not only the files changed in this run.`;

export function projectScaffoldInstructions(resume = false) {
  return [
    SHARED_INSTRUCTIONS,
    PREPARATION_POLICY,
    PROJECT_TOOL_POLICY,
    ...(resume ? [RESUME_POLICY] : []),
  ].join("\n\n");
}
