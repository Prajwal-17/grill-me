import type { Challenge } from "../../../shared/types/api";
export function statementBody(challenge: Challenge) {
  const list = (items: string[]) =>
    items.map((item) => "- " + item.replace(/\n/g, "\n  ")).join("\n");
  const sections = [
    `## ${challenge.type === "question" ? "Question" : "The task"}\n\n${challenge.problemStatement}`,
    `## ${challenge.type === "question" ? "Your answer" : "Expected outcome"}\n\n${challenge.expectedOutcome}`,
    `## Constraints\n\n${list(challenge.constraints)}`,
  ];
  if (challenge.starterCode) {
    const longest = Math.max(
      2,
      ...Array.from(
        challenge.starterCode.matchAll(/`+/g),
        (match) => match[0].length,
      ),
    );
    const fence = "`".repeat(longest + 1);
    sections.push(
      `## Starter code\n\n${fence}\n${challenge.starterCode}\n${fence}`,
    );
  }
  sections.push(
    `## Completion criteria\n\n${list(challenge.completionCriteria)}`,
  );
  return sections.join("\n\n");
}
export function statementMarkdown(challenge: Challenge) {
  return `# ${challenge.title}\n\n${statementBody(challenge)}`;
}
