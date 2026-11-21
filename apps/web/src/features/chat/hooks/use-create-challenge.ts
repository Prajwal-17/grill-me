import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { enhanceBuildPrompt } from "@/features/challenges/api/challenge-api";
import { useBuildStore } from "@/features/chat/stores/chat-store";
import { useAppStore } from "@/shared/stores/app-store";
import { useComposerModel } from "@/shared/components/ai/use-composer-model";
import { useToast } from "@/shared/components/ui/toast";
import type { MessageAttachment, Profile } from "@/shared/types/api";
import { readGenerationAttachments } from "@/features/chat/lib/attachment-utils";
import {
  answerGeneration,
  cancelGeneration,
  enqueueGeneration,
  extractGenerationAttachment,
  generationKeys,
  getGenerationJob,
  retryGeneration,
} from "@/features/generations/api/generation-api";
import { useSaveGenerationJob } from "@/features/generations/hooks/use-generation-jobs";
import type {
  GenerationJob,
  GenerationRequest,
} from "@/features/generations/types";

export function useCreateBuild(profile: Profile) {
  const store = useBuildStore();
  const composer = useComposerModel();
  const resetBuild = store.resetBuild;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const generationId = params.get("generation") ?? "";
  const jobQuery = useQuery({
    queryKey: generationKeys.detail(profile.id, generationId),
    queryFn: () => getGenerationJob(profile.id, generationId),
    enabled: Boolean(generationId),
  });
  const job = jobQuery.data;
  const source = job?.request.kind === "challenge" ? job.request.input : null;
  const clarification =
    job?.status === "needs_input" ? job.clarification : null;
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const mounted = useRef(false);
  const requestRef = useRef<{
    signature: string;
    request: GenerationRequest;
  } | null>(null);
  const saveJob = useSaveGenerationJob();
  const { show } = useToast();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resetBuild();
    };
  }, [resetBuild]);
  const clearSelection = () =>
    setParams(
      (current) => {
        current.delete("generation");
        return current;
      },
      { replace: true },
    );
  function accepted(job: GenerationJob) {
    saveJob(job);
    if (useAppStore.getState().profile?.id !== profile.id) return;
    show({
      message: "Challenge queued",
      description: "It opens on its activity as soon as it is ready.",
      scope: `generation:${profile.id}`,
    });
    if (mounted.current) {
      store.resetBuild();
      setChoice("");
      setCustom("");
      setOriginalPrompt(null);
      setAttachments([]);
      setAttachmentError(null);
      requestRef.current = null;
      // Submitting leaves the composer immediately: the generation progress
      // page shows the live run and continues into the challenge when it
      // completes. Navigate last — the composer's own parameter cleanup runs
      // through navigate too and would otherwise replace this navigation.
      if (job.kind === "challenge")
        navigate(`/generations/${encodeURIComponent(job.id)}`);
      else clearSelection();
    }
  }
  const generate = useMutation({
    mutationFn: (request: GenerationRequest) =>
      enqueueGeneration(profile.id, request),
    onSuccess: accepted,
  });
  const answerMutation = useMutation({
    mutationFn: (value: string) =>
      answerGeneration(profile.id, job!.id, clarification!.question, value),
    onSuccess: accepted,
  });
  const retry = useMutation({
    mutationFn: () => retryGeneration(profile.id, job!.id, true),
    onSuccess: accepted,
  });
  const edit = useMutation({
    mutationFn: () => cancelGeneration(profile.id, job!.id),
    onSuccess: (cancelled) => {
      saveJob(cancelled);
      if (!mounted.current || !source) return;
      store.setPrompt(source.prompt);
      store.setScope(source.scope);
      store.setDifficulty(source.difficulty);
      setAttachments(source.attachments ?? []);
      if (source.selection) composer.setSelection(source.selection);
      clearSelection();
      setChoice("");
      setCustom("");
      requestAnimationFrame(() =>
        document.getElementById("build-request")?.focus(),
      );
    },
  });
  const enhance = useMutation({
    mutationFn: (original: string) =>
      enhanceBuildPrompt(profile.id, original, composer.selection),
    onSuccess: (result, original) => {
      if (!mounted.current || useBuildStore.getState().prompt !== original)
        return;
      generate.reset();
      requestRef.current = null;
      setOriginalPrompt(original);
      store.setPrompt(result.prompt);
    },
  });
  const busy =
    generate.isPending ||
    answerMutation.isPending ||
    edit.isPending ||
    retry.isPending ||
    enhance.isPending;
  function reset() {
    if (clarification) {
      edit.mutate();
      return;
    }
    generate.reset();
    enhance.reset();
    answerMutation.reset();
    retry.reset();
    requestRef.current = null;
    setOriginalPrompt(null);
  }
  function addAttachments(files: FileList | readonly File[] | null) {
    if (!files || !files.length) return;
    setAttachmentError(null);
    readGenerationAttachments([...files], attachments, (file) =>
      extractGenerationAttachment(profile.id, file),
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
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || clarification || store.prompt.trim().length < 3) return;
    const input = {
      prompt: store.prompt.trim(),
      scope: store.scope,
      difficulty: store.difficulty,
      clarificationContext: null,
      clarificationHistory: [],
      ...(attachments.length ? { attachments } : {}),
      ...(composer.selection ? { selection: composer.selection } : {}),
    };
    const signature = JSON.stringify(input);
    const request: GenerationRequest =
      requestRef.current?.signature === signature
        ? requestRef.current.request
        : { kind: "challenge", requestId: crypto.randomUUID(), input };
    requestRef.current = { signature, request };
    generate.mutate(request);
  }
  return {
    prompt: clarification && source ? source.prompt : store.prompt,
    setPrompt: store.setPrompt,
    attachments:
      clarification && source ? (source.attachments ?? []) : attachments,
    addAttachments,
    setAttachments: (next: MessageAttachment[]) => {
      setAttachmentError(null);
      setAttachments(next);
    },
    attachmentError,
    scope: clarification && source ? source.scope : store.scope,
    setScope: store.setScope,
    difficulty: clarification && source ? source.difficulty : store.difficulty,
    setDifficulty: store.setDifficulty,
    clarification,
    choice,
    setChoice,
    custom,
    setCustom,
    clarificationHistory: source?.clarificationHistory ?? [],
    generationId,
    canFallback:
      job?.status === "failed" &&
      job.phase === "preparing" &&
      Boolean(job.error?.retryable),
    generate,
    enhance,
    originalPrompt,
    undoEnhancement: () => {
      if (originalPrompt !== null && !busy) {
        store.setPrompt(originalPrompt);
        reset();
      }
    },
    busy,
    error:
      enhance.error ??
      generate.error ??
      answerMutation.error ??
      edit.error ??
      retry.error ??
      jobQuery.error,
    reset,
    submit,
    answer: (value: string) => {
      if (clarification && value.trim() && !busy)
        answerMutation.mutate(value.trim());
    },
    skipClarification: () => {
      if (!busy) retry.mutate();
    },
    selection: composer.selection,
  };
}
