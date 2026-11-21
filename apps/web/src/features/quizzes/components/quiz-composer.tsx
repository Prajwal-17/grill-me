import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowUp,
  ListChecks,
  LoaderCircle,
  Paperclip,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import { BuildOptionMenu } from "@/features/chat/components/build-option-menu";
import { AttachmentChips } from "@/features/chat/components/attachment-chips";
import { DIFFICULTIES } from "@/features/chat/components/creation-options";
import { shouldSubmitOnEnter } from "@/features/chat/lib/composer-keyboard";
import {
  ATTACHMENT_ACCEPT,
  readGenerationAttachments,
} from "@/features/chat/lib/attachment-utils";
import {
  enqueueGeneration,
  extractGenerationAttachment,
} from "@/features/generations/api/generation-api";
import { useSaveGenerationJob } from "@/features/generations/hooks/use-generation-jobs";
import { useAppStore } from "@/shared/stores/app-store";
import { ModelPicker } from "@/shared/components/ai/model-picker";
import { useComposerModel } from "@/shared/components/ai/use-composer-model";
import { useToast } from "@/shared/components/ui/toast";
import { enhanceQuizPrompt } from "../api/quiz-api";
import type {
  GenerateStandaloneQuizRequest,
  QuestionCount,
  QuizDifficulty,
} from "../types";
import type { MessageAttachment } from "@/shared/types/api";

const COUNTS = [3, 5, 10, 15].map((count) => ({
  id: String(count),
  label: `${count} questions`,
  icon: ListChecks,
}));

export function QuizComposer({ profileId }: { profileId: string }) {
  const composer = useComposerModel();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [questionCount, setQuestionCount] = useState<QuestionCount>(10);
  const [original, setOriginal] = useState<string | null>(null);
  const request = useRef<{
    signature: string;
    input: GenerateStandaloneQuizRequest;
  } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const saveJob = useSaveGenerationJob();
  const { show } = useToast();
  const generation = useMutation({
    mutationFn: () => {
      const settings = {
        prompt: prompt.trim(),
        difficulty,
        questionCount,
        ...(attachments.length ? { attachments } : {}),
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
      setAttachments([]);
      setAttachmentError(null);
      // Watch the generation live; the page continues into the quiz.
      navigate(`/generations/${encodeURIComponent(job.id)}`);
      show({
        message: "Quiz queued",
        description: "It opens as soon as it is ready.",
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
  function addAttachments(files: FileList | readonly File[] | null) {
    if (!files || !files.length) return;
    setAttachmentError(null);
    readGenerationAttachments([...files], attachments, (file) =>
      extractGenerationAttachment(profileId, file),
    )
      .then((next) => {
        setAttachments(next);
        setAttachmentError(null);
      })
      .catch((error: unknown) => {
        setAttachmentError(
          error instanceof Error
            ? error.message
            : "Attachments failed to read.",
        );
      });
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
          <div className="relative">
            <input
              ref={fileInput}
              type="file"
              multiple
              tabIndex={-1}
              className="hidden"
              accept={ATTACHMENT_ACCEPT}
              aria-hidden="true"
              onChange={(event) => {
                addAttachments(event.target.files);
                event.target.value = "";
              }}
            />
            <PromptTextarea
              ref={textarea}
              aria-label="Describe what you want to practice"
              placeholder="What would you like to test your knowledge of? Paste files or images to attach them."
              value={prompt}
              maxLength={4000}
              minHeight={104}
              disabled={busy}
              onAttachFiles={(files) => addAttachments(files)}
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
          </div>
          <AttachmentChips
            attachments={attachments}
            disabled={busy}
            onAttachmentsChange={setAttachments}
          />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-2.5 pb-2.5 pt-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label="Attach files"
                title="Attach files"
                className="text-foreground/80 hover:bg-elevated hover:text-foreground"
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={16} />
              </Button>
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
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy || !prompt.trim()}
                onClick={() => enhance.mutate()}
                aria-label={
                  enhance.isPending ? "Enhancing prompt" : "Enhance prompt"
                }
                title={enhance.isPending ? "Enhancing…" : "Enhance"}
                className="text-foreground/80 hover:bg-elevated hover:text-foreground"
              >
                {enhance.isPending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <WandSparkles size={16} />
                )}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !prompt.trim()}
                aria-label={
                  generation.isPending ? "Queueing quiz" : "Create quiz"
                }
                title={generation.isPending ? "Queueing quiz" : "Create quiz"}
                className="size-8 shrink-0 rounded-full p-0 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.16)] hover:scale-[1.06]"
              >
                {busy ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <ArrowUp size={15} />
                )}
              </Button>
            </div>
          </div>
        </form>
      </PromptSurface>
      {attachmentError && (
        <p role="alert" className="mt-2 text-metadata text-destructive">
          {attachmentError}
        </p>
      )}
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
