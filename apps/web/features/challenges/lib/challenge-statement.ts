import type { Challenge } from "../../../shared/types/api";
import { buildMetadata } from "./challenge-formatters";

export function statementBody(challenge: Challenge) {
  const list = (items: string[]) =>
    items.map((item) => "- " + item.replace(/\n/g, "\n  ")).join("\n");
  const sections = [
    `## The build\n\n${challenge.problemStatement}`,
    `## Expected outcome\n\n${challenge.expectedOutcome}`,
    `## Constraints and exclusions\n\n${list(challenge.constraints)}`,
  ];
  if (challenge.implementationMilestones.length) {
    sections.push(
      `## Implementation milestones\n\n${challenge.implementationMilestones
        .map(
          (milestone, index) =>
            `${index + 1}. ${milestone.replace(/\n/g, "\n   ")}`,
        )
        .join("\n")}`,
    );
  }
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
  const metadata = buildMetadata(challenge)
    .map(({ label, value }) => `${label}: ${value}`)
    .join("\n");
  return `# ${challenge.title}\n\n${metadata}\n\n${statementBody(challenge)}`;
}
