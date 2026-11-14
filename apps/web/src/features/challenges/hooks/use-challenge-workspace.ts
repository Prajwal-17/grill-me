import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WorkspaceEditor,
  WorkspaceEditorOption,
} from "@repo/backend/shared/contracts";
import {
  challengeKeys,
  getChallengeWorkspace,
  getProjectPreparation,
  relinkChallengeWorkspace,
} from "@/features/challenges/api/challenge-api";

export function useChallengeWorkspace(profileId: string, challengeId: string) {
  const bridge = window.desktopBridge;
  const queries = useQueryClient();
  const key = challengeKeys.workspace(profileId, challengeId);
  const workspace = useQuery({
    queryKey: key,
    queryFn: () => getChallengeWorkspace(profileId, challengeId),
    staleTime: 30_000,
    retry: false,
  });
  const editors = useQuery<WorkspaceEditorOption[]>({
    queryKey: ["workspace-editors"],
    queryFn: () => bridge!.getWorkspaceEditors(),
    enabled: Boolean(bridge),
    staleTime: 300_000,
    retry: false,
  });
  const project = useQuery({
    queryKey: challengeKeys.projectPreparation(profileId, challengeId),
    queryFn: () => getProjectPreparation(profileId, challengeId),
    staleTime: 5_000,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ||
      query.state.data?.recovery.settling
        ? 1_500
        : false,
    refetchIntervalInBackground: false,
  });
  const projectDirectory = project.data?.projectDirectory ?? undefined;
  const destinationPath =
    project.data?.projectPath ?? workspace.data?.path ?? null;
  const open = useMutation({
    mutationFn: (editor: WorkspaceEditor) => {
      if (!bridge)
        throw new Error(
          "Opening workspace folders is available in the desktop app.",
        );
      if (!workspace.data)
        throw new Error("The challenge workspace is not ready yet.");
      return bridge.openWorkspaceInEditor({
        path: workspace.data.path,
        editor,
        challengeId,
        profileId,
        ...(projectDirectory ? { projectDirectory } : {}),
      });
    },
  });
  const relink = useMutation({
    mutationFn: () => relinkChallengeWorkspace(profileId, challengeId),
    onSuccess: (data) => {
      queries.setQueryData(key, data);
      void queries.invalidateQueries({ queryKey: key });
      void queries.invalidateQueries({ queryKey: ["challenges", "detail"] });
    },
  });
  const openRoot = useMutation({
    mutationFn: () => {
      if (!bridge || !workspace.data)
        throw new Error("The desktop workspace folder is not available.");
      return bridge.openWorkspaceInEditor({
        path: workspace.data.path,
        editor: "file-manager",
        challengeId,
        profileId,
      });
    },
  });
  return {
    workspace,
    editors,
    open,
    openRoot,
    relink,
    destinationPath,
    projectDirectory,
    projectLoading: project.isPending,
    desktop: Boolean(bridge),
  };
}
