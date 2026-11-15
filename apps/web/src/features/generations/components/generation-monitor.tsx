import { localClient, localTransport } from "@/shared/lib/local-client";
import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/shared/stores/app-store";
import { env } from "@/shared/config/env";
import { useToast } from "@/shared/components/ui/toast";
import { challengeKeys } from "@/features/challenges/api/challenge-api";
import {
  acknowledgeGeneration,
  retryGeneration,
  generationKeys,
} from "../api/generation-api";
import {
  useGenerationJobs,
  useSaveGenerationJob,
} from "../hooks/use-generation-jobs";
import { generationHref, generationNoun } from "../types";

export function GenerationMonitor() {
  const profile = useAppStore((state) =>
    state.hydrated ? state.profile : null,
  );
  const jobs = useGenerationJobs(profile?.id, true);
  const { show, dismissScope } = useToast();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const save = useSaveGenerationJob();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const bridge = window.desktopBridge;
      if (bridge && event.key === "F11") {
        event.preventDefault();
        void bridge.toggleFullscreen();
        return;
      }
      if (
        bridge &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        ["+", "=", "-", "0"].includes(event.key)
      ) {
        event.preventDefault();
        void bridge
          .zoom(event.key === "0" ? "reset" : event.key === "-" ? "out" : "in")
          .then((state) => queries.setQueryData(["desktop-window"], state));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        navigate("/settings");
      }
    };
    document.addEventListener("keydown", key);
    const offOpen = window.desktopBridge?.onOpenSettings(() =>
      navigate("/settings"),
    );
    const offWindow = window.desktopBridge?.onWindowState(() => {
      void queries.invalidateQueries({ queryKey: ["desktop-window"] });
    });
    const off = localTransport
      ? localClient().onChange((tables) => {
          void queries.invalidateQueries({
            predicate: (q) => {
              const key = String(q.queryKey[0]);
              if (key === "desktop-window") return false;
              if (!tables || tables.includes("*")) return true;
              const affected: Record<string, string[]> = {
                settings: ["local-settings"],
                profiles: ["profile"],
                profile_preferences: ["profile"],
                generation_jobs: ["generation-jobs", "generation-job"],
                challenges: ["challenges", "progress"],
                messages: ["messages", "challenges"],
                quizzes: ["quizzes", "quiz", "challenges"],
                quiz_attempts: [
                  "quizzes",
                  "quiz",
                  "quiz-attempt",
                  "quiz-attempts",
                  "progress",
                ],
                project_preparations: ["project-preparation"],
                project_command_requests: ["project-preparation"],
                harness_threads: ["harness-threads", "harness-thread"],
                harness_turns: ["harness-threads", "harness-thread"],
                harness_items: ["harness-threads", "harness-thread"],
                harness_attachments: ["harness-threads", "harness-thread"],
              };
              return tables.some((table) => affected[table]?.includes(key));
            },
          });
        })
      : undefined;
    return () => {
      document.removeEventListener("keydown", key);
      offOpen?.();
      offWindow?.();
      off?.();
    };
  }, [navigate, queries]);
  const seen = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const notificationScope = profile ? `generation:${profile.id}` : null;
  useEffect(() => {
    if (!notificationScope) return;
    return () => dismissScope(notificationScope);
  }, [notificationScope, dismissScope]);
  useEffect(() => {
    if (!profile || useAppStore.getState().profile?.id !== profile.id) return;
    const storageKey = `grill-me.generations.notifications.${env.appEnv}.${profile.id}`;
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (!Array.isArray(saved)) saved = [];
    } catch {
      /* Storage can be unavailable; the database still tracks notifications. */
    }
    let refresh = false;
    for (const job of jobs.data ?? []) {
      if (job.profileId !== profile.id) continue;
      queries.setQueryData(generationKeys.detail(profile.id, job.id), job);
      if (job.status === "completed" && !completed.current.has(job.id)) {
        completed.current.add(job.id);
        refresh = true;
      }
      if (
        job.notifiedAt ||
        !["completed", "failed", "needs_input"].includes(job.status)
      )
        continue;
      const key = `${job.id}:${job.status}:${job.updatedAt}`;
      if (seen.current.has(key) || saved.includes(key)) {
        void acknowledgeGeneration(job.profileId, job).catch(() => {});
        continue;
      }
      seen.current.add(key);
      saved.push(key);
      const noun = generationNoun(job);
      const scope = `generation:${profile.id}`;
      const stillOwned = () =>
        useAppStore.getState().profile?.id === job.profileId;
      const action =
        job.status === "failed"
          ? job.error?.retryable
            ? {
                label: "Retry",
                onClick: () => {
                  if (!stillOwned()) return;
                  void retryGeneration(job.profileId, job.id)
                    .then(save)
                    .catch((error: Error) => {
                      if (stillOwned())
                        show({
                          message: error.message,
                          variant: "error",
                          scope,
                        });
                    });
                },
              }
            : undefined
          : {
              label: job.status === "needs_input" ? "Answer" : `Open ${noun}`,
              onClick: () => {
                if (stillOwned()) navigate(generationHref(job));
              },
            };
      show({
        id: key,
        scope,
        variant:
          job.status === "completed"
            ? "success"
            : job.status === "failed"
              ? "error"
              : "info",
        message:
          job.status === "completed"
            ? `${noun === "quiz" ? "Quiz" : "Challenge"} #${job.resultNumber} is ready`
            : job.status === "needs_input"
              ? "Your challenge needs an answer"
              : `${noun === "quiz" ? "Quiz" : "Challenge"} generation failed`,
        description:
          job.status === "failed"
            ? job.error?.message
            : job.status === "needs_input"
              ? job.clarification?.question
              : (job.resultTitle ?? undefined),
        action,
      });
      void acknowledgeGeneration(job.profileId, job).catch(() => {
        /* The local receipt prevents duplicate toasts while acknowledgment reconnects. */
      });
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved.slice(-100)));
    } catch {
      /* Notifications also work without local storage. */
    }
    if (refresh) {
      void queries.invalidateQueries({
        queryKey: challengeKeys.active(profile.id),
      });
      void queries.invalidateQueries({
        queryKey: challengeKeys.archived(profile.id),
      });
      void queries.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "quizzes" && query.queryKey[1] === profile.id,
      });
    }
  }, [jobs.data, profile, show, navigate, queries, save]);
  return <Outlet />;
}
