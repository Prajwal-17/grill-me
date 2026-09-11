"use client";
// Adapted from Beautiful UI's ApprovalCard: one question, choices, a custom answer, and explicit submission.
import { AnimatePresence, motion } from "motion/react";
import { Check, CornerDownLeft, MessageCircleQuestion } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { StreamingStatus } from "./streaming-status";
export function ClarificationCard({
  question,
  options,
  choice,
  custom,
  busy,
  onChoice,
  onCustom,
  onAnswer,
}: {
  question: string;
  options: string[];
  choice: string;
  custom: string;
  busy: boolean;
  onChoice: (v: string) => void;
  onCustom: (v: string) => void;
  onAnswer: (v: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [question]);
  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="mt-6 overflow-hidden rounded-xl border border-line bg-surface shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        onAnswer(choice === "custom" ? custom : choice);
      }}
    >
      <fieldset disabled={busy}>
        <div className="flex gap-3 border-b border-line px-5 py-4">
          <MessageCircleQuestion
            size={18}
            className="mt-0.5 shrink-0 text-muted"
          />
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-sm font-medium leading-6 outline-none"
          >
            {question}
          </h2>
        </div>
        <div className="grid gap-2 p-4">
          {[...options, "Write an answer"].map((option, index) => {
            const value = index === options.length ? "custom" : option;
            return (
              <label
                key={value}
                className="relative flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-sm hover:bg-canvas has-checked:border-line-strong has-checked:bg-canvas has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
              >
                <input
                  type="radio"
                  name="clarification"
                  className="peer sr-only"
                  value={value}
                  checked={choice === value}
                  onChange={() => onChoice(value)}
                />
                <span className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-canvas">
                  {choice === value && <Check size={10} />}
                </span>
                {option}
              </label>
            );
          })}
          <AnimatePresence initial={false}>
            {choice === "custom" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <Input
                  autoFocus
                  aria-label="Your answer"
                  maxLength={2000}
                  value={custom}
                  onChange={(e) => onCustom(e.target.value)}
                  placeholder="Your answer"
                  className="my-1"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/50 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAnswer("Use your best judgment.")}
          >
            Use your best judgment
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy || !choice || (choice === "custom" && !custom.trim())
            }
          >
            {busy ? "Creating…" : "Create exercise"}
            <CornerDownLeft size={14} />
          </Button>
        </div>
      </fieldset>
      {busy && (
        <div className="border-t border-line px-5 py-3">
          <StreamingStatus label="Creating exercise…" />
        </div>
      )}
    </motion.form>
  );
}
