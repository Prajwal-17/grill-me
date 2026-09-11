import type { ReactNode } from "react";
import type { Challenge } from "../../../shared/types/api";
import { Markdown } from "../../../shared/components/markdown";
import { formatChallengeType } from "../lib/challenge-formatters";
function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-muted">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-sm font-semibold">{label}</h2>
      <div className="reading">{children}</div>
    </section>
  );
}
export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  return (
    <article className="mx-auto w-full min-w-0 max-w-[68ch]">
      <header className="border-b border-line pb-6">
        <p className="mb-3 text-xs text-muted">
          {formatChallengeType(challenge.type)}
        </p>
        <h1 className="page-title leading-tight">{challenge.title}</h1>
      </header>
      <Section label={challenge.type === "question" ? "Question" : "The task"}>
        <Markdown>{challenge.problemStatement}</Markdown>
      </Section>
      <Section
        label={
          challenge.type === "question" ? "Your answer" : "Expected outcome"
        }
      >
        <Markdown>{challenge.expectedOutcome}</Markdown>
      </Section>
      <Section label="Constraints">
        <Checklist items={challenge.constraints} />
      </Section>
      {challenge.starterCode && (
        <Section label="Starter code">
          <Markdown>
            {"\x60\x60\x60\n" + challenge.starterCode + "\n\x60\x60\x60"}
          </Markdown>
        </Section>
      )}
      <Section label="Completion criteria">
        <Checklist items={challenge.completionCriteria} />
      </Section>
    </article>
  );
}
