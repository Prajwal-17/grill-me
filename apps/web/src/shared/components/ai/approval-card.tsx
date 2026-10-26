// Adapted from Beautiful UI ApprovalCard (MIT; see LICENSE).
import { useEffect, useId, useRef } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { useApprovalSubmission } from "@/shared/components/ai/use-approval-submission";

export type ApprovalCardProps = {
  question: string;
  options: string[];
  choice: string;
  custom: string;
  busy: boolean;
  onChoice: (value: string) => void;
  onCustom: (value: string) => void;
  onAnswer: (value: string) => void;
  onEdit: () => void;
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
  onEdit,
}: ApprovalCardProps) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const customInput = useRef<HTMLTextAreaElement>(null);
  const answerContent = useRef<HTMLDivElement>(null);
  const submission = useApprovalSubmission(busy, onAnswer);
  const answer = !options.length || choice === "custom" ? custom : choice;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [question]);
  useEffect(() => {
    if (!options.length || choice === "custom") {
      customInput.current?.focus({ preventScroll: true });
      if (answerContent.current)
        answerContent.current.scrollTop = answerContent.current.scrollHeight;
    }
  }, [choice, options.length]);

  return (
    <form
      aria-labelledby={id}
      aria-busy={busy}
      className="flex min-h-0 max-h-[60dvh] flex-col overflow-hidden md:max-h-[65dvh]"
      onSubmit={(event) => {
        event.preventDefault();
        submission.submit(answer);
      }}
    >
      <fieldset disabled={busy} className="contents">
        <div className="shrink-0 border-b border-line px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <ArrowLeft size={14} /> Edit request
          </Button>
          <h2
            id={id}
            ref={heading}
            tabIndex={-1}
            className="mt-2 text-sm font-medium leading-6 outline-none"
          >
            {question}
          </h2>
        </div>
        <div
          ref={answerContent}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        >
          {options.length > 0 && (
            <div role="radiogroup" aria-labelledby={id} className="grid gap-1">
              {[
                ...options.map((option) => ({ value: option, label: option })),
                { value: "custom", label: "Something else" },
              ].map((option) => (
                <label
                  key={option.value}
                  className="relative flex min-h-10 cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2.5 transition-colors hover:bg-elevated has-checked:border-line has-checked:bg-elevated has-focus-visible:outline-2 has-focus-visible:outline-offset-[-2px]"
                >
                  <input
                    type="radio"
                    name={id}
                    value={option.value}
                    checked={choice === option.value}
                    className="peer sr-only"
                    onChange={() => {
                      submission.cancel();
                      onChoice(option.value);
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line-strong peer-checked:border-foreground peer-checked:after:size-2 peer-checked:after:rounded-full peer-checked:after:bg-foreground"
                  />
                  <span className="min-w-0 break-words text-sm leading-5">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          )}
          {(!options.length || choice === "custom") && (
            <div className="relative mt-3">
              <label htmlFor={`${id}-answer`} className="sr-only">
                Your answer
              </label>
              <Textarea
                ref={customInput}
                id={`${id}-answer`}
                value={custom}
                maxLength={2000}
                placeholder="Type your answer…"
                className="min-h-20 shadow-none focus-visible:ring-1 focus-visible:ring-line-strong dark:bg-transparent"
                onChange={(event) => onCustom(event.target.value)}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-3">
          <span className="text-xs text-muted">
            Answer required to continue
          </span>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!answer.trim() || busy}
          >
            {busy && <LoaderCircle size={14} className="animate-spin" />}
            {busy ? "Creating…" : "Create build"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
