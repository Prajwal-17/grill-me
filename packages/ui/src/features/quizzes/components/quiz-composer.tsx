import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, ListChecks, LoaderCircle, WandSparkles } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import { BuildOptionMenu } from "@/features/chat/components/build-option-menu";
import { DIFFICULTIES } from "@/features/chat/components/creation-options";
import { shouldSubmitOnEnter } from "@/features/chat/lib/composer-keyboard";
import { enqueueGeneration } from "@/features/generations/api/generation-api";
import { useSaveGenerationJob } from "@/features/generations/hooks/use-generation-jobs";
import { useAppStore } from "@/shared/stores/app-store";
import {
  useComposerModel,
  ModelPicker,
} from "@/shared/components/ai/model-picker";
import { useToast } from "@/shared/components/ui/toast";
import { enhanceQuizPrompt } from "../api/quiz-api";
import type {
  GenerateStandaloneQuizRequest,
  QuestionCount,
  QuizDifficulty,
} from "../types";

const COUNTS = [5, 10, 15].map((count) => ({
  id: String(count),
  label: `${count} questions`,
  icon: ListChecks,
}));

export function QuizComposer({ profileId }: { profileId: string }) {
  const composer = useComposerModel();
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [questionCount, setQuestionCount] = useState<QuestionCount>(10);
  const [original, setOriginal] = useState<string | null>(null);
  const request = useRef<{
    signature: string;
    input: GenerateStandaloneQuizRequest;
  } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const saveJob = useSaveGenerationJob();
  const { show } = useToast();
  const generation = useMutation({
    mutationFn: () => {
      const settings = {
        prompt: prompt.trim(),
        difficulty,
        questionCount,
        selection: composer.selection,
      };
      const signature = JSON.stringify(settings);
      if (request.current?.signature !== signature)
        request.current = {
          signature,
          input: { ...settings, requestId: crypto.randomUUID() },
        };
      return enqueueGeneration(profileId, {
        kind: "quiz",
        input: request.current.input,
      });
    },
    onSuccess: (job) => {
      saveJob(job);
      request.current = null;
      if (useAppStore.getState().profile?.id !== profileId) return;
      setPrompt("");
      setOriginal(null);
      show({
        message: "Quiz queued",
        description: "You can keep working while it generates.",
        scope: `generation:${profileId}`,
      });
      textarea.current?.focus();
    },
  });
  const enhance = useMutation({
    mutationFn: () =>
      enhanceQuizPrompt(profileId, prompt.trim(), composer.selection),
    onSuccess: (result) => {
      setOriginal(prompt);
      setPrompt(result.prompt);
      requestAnimationFrame(() => textarea.current?.focus());
    },
  });
  const busy = generation.isPending || enhance.isPending;
  const error = generation.error || enhance.error;
  function submit() {
    if (!busy && prompt.trim()) generation.mutate();
  }
  return (
    <section aria-label="Create a quiz">
      {error && (
        <p
          role="alert"
          id="quiz-create-error"
          className="mb-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-ui text-destructive"
        >
          {error.message}
        </p>
      )}
      <PromptSurface
        data-grill={difficulty === "grill" || undefined}
        data-working={busy || undefined}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <PromptTextarea
            ref={textarea}
            aria-label="Describe what you want to practice"
            placeholder="What would you like to test your knowledge of?"
            value={prompt}
            maxLength={4000}
            minHeight={180}
            disabled={busy}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "quiz-create-error" : undefined}
            onChange={(event) => {
              setPrompt(event.target.value);
              setOriginal(null);
              generation.reset();
              enhance.reset();
            }}
            onKeyDown={(event) => {
              if (shouldSubmitOnEnter(event)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-3 pb-3 pt-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <BuildOptionMenu
                label="Question count"
                value={String(questionCount)}
                options={COUNTS}
                disabled={busy}
                onChange={(value) =>
                  setQuestionCount(Number(value) as QuestionCount)
                }
              />
              <BuildOptionMenu
                label="Quiz difficulty"
                value={difficulty}
                options={DIFFICULTIES}
                disabled={busy}
                onChange={setDifficulty}
              />
              <ModelPicker disabled={busy} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || !prompt.trim()}
                onClick={() => enhance.mutate()}
                aria-label="Enhance quiz prompt"
              >
                {enhance.isPending ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <WandSparkles size={14} />
                )}
                Enhance
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !prompt.trim()}
              >
                {busy ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} />
                )}{" "}
                {generation.isPending ? "Queueing…" : "Create quiz"}
              </Button>
            </div>
          </div>
        </form>
      </PromptSurface>
      {original !== null && (
        <div className="mt-2 flex items-center gap-2 text-metadata text-muted">
          <span role="status">Prompt enhanced</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setPrompt(original);
              setOriginal(null);
              textarea.current?.focus();
            }}
          >
            Undo
          </Button>
        </div>
      )}
      {prompt.length > 3600 && (
        <p className="mt-2 text-right text-metadata text-muted">
          {prompt.length}/4000
        </p>
      )}
    </section>
  );
}
