import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ModelSelection,
  WorkspaceEditor,
  WorkspaceLaunch,
} from "@repo/backend/shared/contracts";
import {
  approveProjectCommand,
  authorizeProjectAttemptCommands,
  cancelProjectPreparation,
  challengeKeys,
  getProjectPreparation,
  rejectProjectCommand,
  resumeProjectPreparation,
  retryProjectPreparation,
  startFreshProjectPreparation,
  startProjectPreparation,
} from "@/features/challenges/api/challenge-api";

type ProjectLaunch = WorkspaceLaunch & { projectDirectory?: string };

export function useProjectPreparation(
  profileId: string,
  challengeId: string,
  options: { enabled?: boolean } = {},
) {
  const bridge = window.desktopBridge;
  const queries = useQueryClient();
  const key = challengeKeys.projectPreparation(profileId, challengeId);
  const preparation = useQuery({
    queryKey: key,
    queryFn: () => getProjectPreparation(profileId, challengeId),
    enabled: options.enabled ?? true,
    staleTime: 5_000,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" || data?.recovery.settling
        ? 1_500
        : false;
    },
    refetchIntervalInBackground: false,
  });
  const refreshActivity = () => {
    void queries.invalidateQueries({ queryKey: ["harness-threads"] });
  };
  const apply = (data: Awaited<ReturnType<typeof getProjectPreparation>>) => {
    queries.setQueryData(key, data);
    refreshActivity();
  };
  /** The harness thread is created just after the attempt row starts running. */
  const applyAfterRunStart = (
    data: Awaited<ReturnType<typeof getProjectPreparation>>,
  ) => {
    apply(data);
    window.setTimeout(refreshActivity, 1_000);
  };
  const refreshAfterError = () => {
    void queries.invalidateQueries({ queryKey: key });
    refreshActivity();
  };
  const start = useMutation({
    mutationFn: (selection?: ModelSelection) =>
      startProjectPreparation(profileId, challengeId, selection),
    onSuccess: applyAfterRunStart,
    onError: refreshAfterError,
  });
  const cancel = useMutation({
    mutationFn: () => cancelProjectPreparation(profileId, challengeId),
    onSuccess: apply,
    onError: refreshAfterError,
  });
  const retry = useMutation({
    mutationFn: () => retryProjectPreparation(profileId, challengeId),
    onSuccess: applyAfterRunStart,
    onError: refreshAfterError,
  });
  const resume = useMutation({
    mutationFn: () => resumeProjectPreparation(profileId, challengeId),
    onSuccess: applyAfterRunStart,
    onError: refreshAfterError,
  });
  const fresh = useMutation({
    mutationFn: () => startFreshProjectPreparation(profileId, challengeId),
    onSuccess: applyAfterRunStart,
    onError: refreshAfterError,
  });
  const approve = useMutation({
    mutationFn: (commandId: string) =>
      approveProjectCommand(profileId, challengeId, commandId),
    onSuccess: apply,
    onError: refreshAfterError,
  });
  const reject = useMutation({
    mutationFn: (commandId: string) =>
      rejectProjectCommand(profileId, challengeId, commandId),
    onSuccess: apply,
    onError: refreshAfterError,
  });
  const authorize = useMutation({
    mutationFn: (authorization: { install: boolean; network: boolean }) =>
      authorizeProjectAttemptCommands(profileId, challengeId, authorization),
    onSuccess: apply,
    onError: refreshAfterError,
  });
  const open = useMutation({
    mutationFn: ({
      editor,
      projectDirectory,
      workspacePath,
    }: {
      editor: WorkspaceEditor;
      projectDirectory: string;
      workspacePath: string;
    }) => {
      if (!bridge)
        throw new Error(
          "Opening project folders is available in the desktop app.",
        );
      const launch: ProjectLaunch = {
        path: workspacePath,
        editor,
        challengeId,
        profileId,
        projectDirectory,
      };
      return bridge.openWorkspaceInEditor(launch);
    },
  });
  return {
    preparation,
    start,
    cancel,
    retry,
    resume,
    fresh,
    approve,
    reject,
    authorize,
    open,
    desktop: Boolean(bridge),
  };
}
