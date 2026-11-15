import type { Challenge } from "@/shared/types/api";
import { buildMetadata } from "@/features/challenges/lib/challenge-formatters";

export function statementBody(challenge: Challenge) {
  const list = (items: string[]) =>
    items.map((item) => "- " + item.replace(/\n/g, "\n  ")).join("\n");
  const milestones = challenge.implementationMilestones.length
    ? [
        `## Implementation milestones\n\n${list(challenge.implementationMilestones)}`,
      ]
    : [];
  if (challenge.promptVersion) {
    return [
      `## Task\n\n${challenge.problemStatement}`,
      `## Requirements\n\n${list(challenge.completionCriteria)}`,
      ...(challenge.implementationBoundary
        ? [`## Implementation boundary\n\n${challenge.implementationBoundary}`]
        : []),
      ...milestones,
      `## Submit\n\n${challenge.expectedOutcome}`,
    ].join("\n\n");
  }
  const sections = [
    `## The build\n\n${challenge.problemStatement}`,
    `## Expected outcome\n\n${challenge.expectedOutcome}`,
    ...milestones,
    `## Completion criteria\n\n${list(challenge.completionCriteria)}`,
  ];
  return sections.join("\n\n");
}

export function statementMarkdown(challenge: Challenge) {
  const metadata = buildMetadata(challenge)
    .map(({ label, value }) => `${label}: ${value}`)
    .join("\n");
  return `# #${challenge.number} ${challenge.title}\n\n${metadata}\n\n${statementBody(challenge)}`;
}
