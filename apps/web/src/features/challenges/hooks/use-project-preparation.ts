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
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 1_500 : false,
    refetchIntervalInBackground: false,
  });
  const apply = (data: Awaited<ReturnType<typeof getProjectPreparation>>) => {
    queries.setQueryData(key, data);
  };
  const start = useMutation({
    mutationFn: (selection?: ModelSelection) =>
      startProjectPreparation(profileId, challengeId, selection),
    onSuccess: apply,
  });
  const cancel = useMutation({
    mutationFn: () => cancelProjectPreparation(profileId, challengeId),
    onSuccess: apply,
  });
  const refreshAfterError = () => {
    void queries.invalidateQueries({ queryKey: key });
  };
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
    approve,
    reject,
    authorize,
    open,
    desktop: Boolean(bridge),
  };
}
