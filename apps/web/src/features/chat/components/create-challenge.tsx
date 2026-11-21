import {
  AlertCircle,
  ArrowUp,
  Component as ComponentIcon,
  LoaderCircle,
  Network,
  Paperclip,
  Target,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import type { BuildDifficulty, BuildScope, Profile } from "@/shared/types/api";
import { ClarificationCard } from "@/shared/components/ai/clarification-card";
import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import { AttachmentChips } from "@/features/chat/components/attachment-chips";
import { ATTACHMENT_ACCEPT } from "@/features/chat/lib/attachment-utils";
import { DIFFICULTIES } from "./creation-options";
import { shouldSubmitOnEnter } from "@/features/chat/lib/composer-keyboard";
import { useCreateBuild } from "@/features/chat/hooks/use-create-challenge";
import { BuildOptionMenu } from "@/features/chat/components/build-option-menu";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/tabs";
import { QuizComposer } from "@/features/quizzes/components/quiz-composer";
import { BookOpen, ListChecks } from "lucide-react";
import { ModelPicker } from "@/shared/components/ai/model-picker";
const SCOPES = [
  {
    id: "focused",
    label: "Focused",
    icon: Target,
  },
  {
    id: "feature",
    label: "Feature",
    icon: ComponentIcon,
  },
  {
    id: "system",
    label: "System",
    icon: Network,
  },
] as const;

export function GenerationHome({ profile }: { profile: Profile }) {
  const [mode, setMode] = useState("challenge");
  return (
    <main className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-8">
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center py-12 md:pb-24">
        <Tabs value={mode} onValueChange={setMode} className="gap-4">
          <TabsList aria-label="Create practice" className="h-9 self-start">
            <TabsTrigger value="challenge" className="px-3">
              <BookOpen size={15} />
              Challenge
            </TabsTrigger>
            <TabsTrigger value="quiz" className="px-3">
              <ListChecks size={15} />
              Quiz
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="challenge"
            forceMount
            hidden={mode !== "challenge"}
          >
            <ChallengeComposer profile={profile} />
          </TabsContent>
          <TabsContent value="quiz" forceMount hidden={mode !== "quiz"}>
            <QuizComposer profileId={profile.id} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function ChallengeComposer({ profile }: { profile: Profile }) {
  const {
    prompt,
    setPrompt,
    scope,
    setScope,
    difficulty,
    setDifficulty,
    clarification,
    choice,
    setChoice,
    custom,
    setCustom,
    clarificationHistory,
    canFallback,
    generate,
    enhance,
    originalPrompt,
    undoEnhancement,
    busy,
    error,
    reset,
    submit,
    answer,
    skipClarification,
    attachments,
    addAttachments,
    setAttachments,
    attachmentError,
  } = useCreateBuild(profile);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (enhance.isSuccess && !busy)
      textarea.current?.focus({ preventScroll: true });
  }, [enhance.isSuccess, busy]);

  return (
    <section aria-label="Create a challenge" className="flex min-w-0 flex-col">
      {error && (
        <p
          role="alert"
          id="generation-error"
          className="flex items-start gap-2 text-ui leading-6 mb-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-destructive"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          {error.message}
        </p>
      )}
      {canFallback && !generate.error && (
        <Button className="mb-3" disabled={busy} onClick={skipClarification}>
          Create without clarification
        </Button>
      )}
      {clarificationHistory.length > 0 && (
        <details className="mb-4 text-ui">
          <summary className="cursor-pointer text-muted">
            Clarification history ({clarificationHistory.length})
          </summary>
          <ol className="mt-3 grid gap-3">
            {clarificationHistory.map((item, index) => (
              <li key={index}>
                <p className="font-medium">{item.question}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted">
                  {item.answer}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <PromptSurface
        className="flex min-h-0 flex-col"
        data-grill={difficulty === "grill" || undefined}
        data-working={busy || undefined}
      >
        {clarification?.question ? (
          <ClarificationCard
            key={clarification.question}
            question={clarification.question}
            options={clarification.options}
            choice={choice}
            custom={custom}
            busy={busy}
            onChoice={setChoice}
            onCustom={setCustom}
            onAnswer={answer}
            onEdit={() => {
              reset();
              requestAnimationFrame(() =>
                textarea.current?.focus({ preventScroll: true }),
              );
            }}
          />
        ) : (
          <form onSubmit={submit}>
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
                id="build-request"
                aria-label="Describe what you want to build"
                disabled={busy}
                value={prompt}
                maxLength={4000}
                onAttachFiles={(files) => addAttachments(files)}
                placeholder="Describe a topic or something you want to build… Paste files or images to attach them."
                minHeight={104}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "generation-error" : undefined}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  reset();
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
              <div className="flex min-w-0 items-center gap-1">
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
                  label="Build scope"
                  value={scope}
                  options={SCOPES}
                  disabled={busy}
                  onChange={(value: BuildScope) => {
                    setScope(value);
                    reset();
                  }}
                />
                <BuildOptionMenu
                  label="Build difficulty"
                  value={difficulty}
                  options={DIFFICULTIES}
                  disabled={busy}
                  onChange={(value: BuildDifficulty) => {
                    setDifficulty(value);
                    reset();
                  }}
                />
                <ModelPicker disabled={busy} />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy || !prompt.trim()}
                  aria-label={
                    enhance.isPending ? "Enhancing prompt" : "Enhance prompt"
                  }
                  title={enhance.isPending ? "Enhancing…" : "Enhance"}
                  onClick={() => enhance.mutate(prompt)}
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
                  aria-label={
                    generate.isPending
                      ? "Queueing challenge"
                      : "Create challenge"
                  }
                  title={
                    generate.isPending
                      ? "Queueing challenge"
                      : "Create challenge"
                  }
                  disabled={
                    busy ||
                    Boolean(clarification?.question) ||
                    prompt.trim().length < 3
                  }
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
        )}
      </PromptSurface>
      {attachmentError && (
        <p role="alert" className="mt-2 text-metadata text-destructive">
          {attachmentError}
        </p>
      )}
      {originalPrompt !== null && (
        <div className="mt-2 flex items-center gap-2 text-metadata text-muted">
          <span role="status">Prompt enhanced</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              undoEnhancement();
              textarea.current?.focus({ preventScroll: true });
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
