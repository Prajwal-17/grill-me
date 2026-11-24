import { ChevronRight } from "lucide-react";
import { CopyButton } from "@/shared/components/ui/copy-button";
import type { Challenge } from "@/shared/types/api";
import { challengePrompt } from "../lib/challenge-prompt";

export function ChallengePrompt({ challenge }: { challenge: Challenge }) {
  const request = challengePrompt(challenge);
  if (!request) return null;

  return (
    <details className="group/request mb-5 border-b border-line pb-2">
      <summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm pr-2 text-metadata font-medium text-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={14}
          className="shrink-0 group-open/request:rotate-90 motion-safe:transition-transform"
          aria-hidden="true"
        />
        Original prompt
      </summary>
      <div className="mt-2 mb-1 border-l border-line pl-3">
        <p className="whitespace-pre-wrap text-supporting leading-6 text-foreground [overflow-wrap:anywhere]">
          {request}
        </p>
        <div className="mt-1 -ml-2">
          <CopyButton text={request} label="Copy prompt" />
        </div>
      </div>
    </details>
  );
}
