import { useState } from "react";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { Challenge } from "@/shared/types/api";
import { challengePrompt } from "../lib/challenge-prompt";

const CLAMP_CHARS = 320;
const CLAMP_LINES = 5;

/** Shows the learner's original request above the generated challenge. */
export function ChallengePrompt({
  challenge,
  className,
}: {
  challenge: Challenge;
  className?: string;
}) {
  const prompt = challengePrompt(challenge);
  const [expanded, setExpanded] = useState(false);
  if (!prompt) return null;
  const long =
    prompt.length > CLAMP_CHARS || prompt.split("\n").length > CLAMP_LINES;
  return (
    <section
      aria-label="Your prompt"
      className={cn(
        "rounded-xl border border-line bg-panel px-4 py-3",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-metadata font-medium text-muted">
        <MessageSquareText size={13} className="shrink-0" aria-hidden="true" />
        Your prompt
      </p>
      <p
        className={cn(
          "mt-2 whitespace-pre-wrap break-words text-supporting leading-6 text-foreground",
          !expanded && long && "line-clamp-5",
        )}
      >
        {prompt}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 flex items-center gap-1 rounded-sm text-metadata text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            size={12}
            className={cn("transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      )}
    </section>
  );
}
