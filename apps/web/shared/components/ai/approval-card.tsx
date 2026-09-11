"use client";
// Adapted from the supplied Beautiful UI ApprovalCard (MIT; see LICENSE).
import { useEffect, useId, useRef } from "react";
import { motion, useIsPresent } from "motion/react";
import { CornerDownLeft } from "lucide-react";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { StreamingStatus } from "./streaming-status";
import GlideMenu from "./glide-menu";
import { useApprovalSubmission } from "./use-approval-submission";

export type ApprovalCardProps = {
  question: string;
  options: string[];
  choice: string;
  custom: string;
  busy: boolean;
  onChoice: (value: string) => void;
  onCustom: (value: string) => void;
  onAnswer: (value: string) => void;
};

export function ApprovalCard({
  question,
  options,
  choice,
  custom,
  busy,
  onChoice,
  onCustom,
  onAnswer,
}: ApprovalCardProps) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const present = useIsPresent();
  const submission = useApprovalSubmission(busy || !present, onAnswer);
  const answer = choice === "custom" ? custom : choice;
  useEffect(() => {
    heading.current?.focus();
  }, [question]);
  return (
    <motion.form
      layout="size"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      aria-labelledby={id}
      aria-busy={busy}
      className="mb-3 w-full overflow-hidden rounded-lg border border-line bg-surface"
      onSubmit={(event) => {
        event.preventDefault();
        submission.submit(answer);
      }}
    >
      <fieldset disabled={busy || !present}>
        <div className="p-5 pb-4">
          <h2
            id={id}
            ref={heading}
            tabIndex={-1}
            className="text-sm font-medium leading-6 outline-none"
          >
            {question}
          </h2>
          <GlideMenu
            className="mt-3 grid gap-1"
            highlightClassName="inset-x-0 rounded-lg bg-elevated"
          >
            {options.map((option) => (
              <label
                key={option}
                data-menu-row
                className="relative z-10 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 has-focus-visible:outline-2 has-focus-visible:outline-offset-0"
              >
                <input
                  type="radio"
                  name={id}
                  value={option}
                  checked={choice === option}
                  className="peer sr-only"
                  onChange={() => {
                    onChoice(option);
                    onCustom("");
                    submission.select(option);
                  }}
                />
                <span
                  aria-hidden="true"
                  className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong transition-colors peer-checked:border-foreground peer-checked:bg-foreground"
                >
                  <span
                    className="size-1.5 rounded-full bg-canvas transition-transform"
                    style={{
                      transform: choice === option ? "scale(1)" : "scale(0)",
                    }}
                  />
                </span>
                <span className="text-sm leading-5">{option}</span>
              </label>
            ))}
            <div
              data-menu-row
              className="relative z-10 mt-1 flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-2"
            >
              <input
                type="radio"
                name={id}
                checked={choice === "custom"}
                value="custom"
                aria-label="Write an answer"
                className="size-4 shrink-0 accent-foreground"
                onChange={() => {
                  submission.cancel();
                  onChoice("custom");
                }}
              />
              <input
                value={custom}
                maxLength={2000}
                aria-label="Your answer"
                placeholder="Something else…"
                className="min-w-0 flex-1 rounded-sm bg-transparent py-1 text-sm outline-none placeholder:text-muted focus-visible:ring-1 focus-visible:ring-line-strong"
                onFocus={() => {
                  submission.cancel();
                  onChoice("custom");
                }}
                onChange={(event) => {
                  submission.cancel();
                  onChoice("custom");
                  onCustom(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing && event.key === "Enter")
                    event.preventDefault();
                }}
              />
            </div>
          </GlideMenu>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/40 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full px-3"
            onClick={() => submission.submit("Use your best judgment.")}
          >
            Use your best judgment
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="rounded-full px-3"
            disabled={!answer.trim() || busy}
          >
            {busy ? "Creating…" : "Create build"}
            <Kbd className="bg-canvas/15 text-canvas">
              <CornerDownLeft size={12} />
            </Kbd>
          </Button>
        </div>
      </fieldset>
      {busy && (
        <div className="border-t border-line px-5 py-3">
          <StreamingStatus label="Creating build…" />
        </div>
      )}
    </motion.form>
  );
}
