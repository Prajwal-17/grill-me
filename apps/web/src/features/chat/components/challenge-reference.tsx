import { BookOpen, X } from "lucide-react";
import type { Challenge } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { Markdown } from "@/shared/components/markdown";
import {
  statementBody,
  statementMarkdown,
} from "@/features/challenges/lib/challenge-statement";

export function ChallengeReference({
  challenge,
  onClose,
}: {
  challenge: Challenge;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="flex items-center gap-2 text-ui font-medium">
          <BookOpen size={15} className="text-muted" />
          Challenge reference
        </h2>
        <div className="flex items-center gap-1">
          <CopyButton
            text={statementMarkdown(challenge)}
            label="Copy"
            ariaLabel="Copy challenge"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close challenge reference"
          >
            <X size={15} />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5 text-ui leading-6 [overflow-wrap:anywhere] [&_.markdown_h2]:text-ui [&_.markdown_h3]:text-ui">
        <p className="mb-5 text-ui font-medium">{challenge.title}</p>
        <Markdown headingPrefix={`reference-${challenge.id}`}>
          {statementBody(challenge)}
        </Markdown>
      </div>
    </div>
  );
}
