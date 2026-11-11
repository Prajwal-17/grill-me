import { useMemo, useRef, useState, useEffect } from "react";
import { List } from "lucide-react";
import type { Challenge } from "@/shared/types/api";
import {
  markdownOutline,
  type OutlineItem,
} from "@/shared/lib/markdown-outline";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { ChallengeCard } from "@/features/challenges/components/challenge-card";
import {
  statementBody,
  statementMarkdown,
} from "@/features/challenges/lib/challenge-statement";
import { cn } from "@/shared/lib/cn";

export function StatementReader({ challenge }: { challenge: Challenge }) {
  const prefix = "statement-" + challenge.id + "-";
  const outline = useMemo(
    () => markdownOutline(statementBody(challenge), prefix),
    [challenge, prefix],
  );
  const [active, setActive] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current?.closest('[role="tabpanel"]');
    if (!container) return;
    const update = () => {
      const headings = outline
        .map((item) => document.getElementById(item.id))
        .filter((item): item is HTMLElement => Boolean(item));
      const top = container.getBoundingClientRect().top + 96;
      const previous = headings.filter(
        (item) => item.getBoundingClientRect().top <= top,
      );
      setActive((previous.at(-1) ?? headings[0])?.id ?? "");
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [outline]);
  const jump = (item: OutlineItem) => {
    const heading = document.getElementById(item.id);
    heading?.scrollIntoView({ block: "start", behavior: "instant" });
    heading?.focus({ preventScroll: true });
  };
  const links = (
    <nav aria-label="Statement contents" className="grid gap-0.5">
      {outline.map((item) => (
        <a
          key={item.id}
          href={"#" + item.id}
          onClick={(event) => {
            event.preventDefault();
            jump(item);
          }}
          aria-current={active === item.id ? "location" : undefined}
          className={cn(
            "block rounded py-1.5 pr-2 text-left text-metadata leading-5 text-muted hover:text-foreground focus-visible:outline-offset-0",
            active === item.id && "bg-elevated text-foreground",
          )}
          style={{ paddingLeft: 8 + Math.max(0, item.depth - 2) * 10 }}
        >
          {item.title}
        </a>
      ))}
    </nav>
  );
  return (
    <div
      ref={root}
      className="mx-auto grid w-full max-w-[1100px] min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_176px] xl:gap-10"
    >
      <div className="min-w-0">
        <div className="mb-4 xl:hidden">
          <details className="min-w-0 xl:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded py-1.5 text-metadata text-muted">
              <List size={14} />
              On this page
            </summary>
            <div className="my-3 border-l border-line pl-2">{links}</div>
          </details>
        </div>
        <ChallengeCard
          challenge={challenge}
          headingPrefix={prefix}
          className="max-w-none"
          headerAction={
            <CopyButton
              text={statementMarkdown(challenge)}
              label="Copy statement"
            />
          }
        />
      </div>
      <aside className="sticky top-5 hidden max-h-[calc(100dvh-150px)] self-start overflow-y-auto xl:block">
        {links}
      </aside>
    </div>
  );
}
