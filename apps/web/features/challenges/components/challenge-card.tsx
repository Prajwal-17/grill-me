import type { Challenge } from "../../../shared/types/api";
import { Markdown } from "../../../shared/components/markdown";
import { formatChallengeType } from "../lib/challenge-formatters";

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li className="flex gap-3 text-[15px] leading-7 text-muted" key={item}>
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand-bright shadow-[0_0_8px_var(--color-brand)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line py-6 last:border-b-0">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
        {label}
      </h2>
      <div className="text-[15px] leading-7 text-muted">{children}</div>
    </section>
  );
}

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  return (
    <article className="mx-auto w-full max-w-2xl">
      <header className="border-b border-line pb-7">
        <span className="mb-2 block text-[11px] font-semibold tracking-[0.14em] text-brand-bright uppercase">
          {formatChallengeType(challenge.type)}
        </span>
        <h1 className="text-2xl leading-tight font-semibold tracking-[-0.03em] md:text-[28px]">
          {challenge.title}
        </h1>
      </header>

      <Section label={challenge.type === "question" ? "Question" : "Problem"}>
        <Markdown>{challenge.problemStatement}</Markdown>
      </Section>
      <Section
        label={
          challenge.type === "question"
            ? "What a strong answer covers"
            : "Expected outcome"
        }
      >
        <Markdown>{challenge.expectedOutcome}</Markdown>
      </Section>
      <Section label="Constraints">
        <Checklist items={challenge.constraints} />
      </Section>
      {challenge.starterCode && (
        <Section label="Starter code">
          <Markdown>{`\`\`\`\n${challenge.starterCode}\n\`\`\``}</Markdown>
        </Section>
      )}
      <Section label="Completion criteria">
        <Checklist items={challenge.completionCriteria} />
      </Section>
    </article>
  );
}
