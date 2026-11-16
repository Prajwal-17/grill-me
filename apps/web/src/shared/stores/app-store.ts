import { env } from "@/shared/config/env";

import {
  workspaceEditorSchema,
  type WorkspaceEditor,
} from "@repo/backend/shared/contracts";
import type { ModelSelection, Profile } from "@/shared/types/api";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

type AppStore = {
  profile: Profile | null;
  theme: Theme;
  sidebarCollapsed: boolean;
  hydrated: boolean;
  composerModel: ModelSelection | null;
  preferredWorkspaceEditor: WorkspaceEditor | null;
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setHydrated: (hydrated: boolean) => void;
  setComposerModel: (selection: ModelSelection | null) => void;
  setPreferredWorkspaceEditor: (editor: WorkspaceEditor) => void;
};

const APP_ENV = env.appEnv;
export const APP_STORAGE_KEY = `grill-me.app.${APP_ENV}`;

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<Profile>;
  return (
    typeof profile.id === "string" &&
    typeof profile.email === "string" &&
    typeof profile.createdAt === "string"
  );
}

const reasoningValues = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);

function isModelSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<ModelSelection>;
  return (
    typeof selection.providerId === "string" &&
    typeof selection.model === "string" &&
    selection.model.length > 0 &&
    (selection.reasoningEffort === undefined ||
      selection.reasoningEffort === null ||
      reasoningValues.has(selection.reasoningEffort))
  );
}

function isWorkspaceEditor(value: unknown): value is WorkspaceEditor {
  return workspaceEditorSchema.safeParse(value).success;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      profile: null,
      theme: "dark",
      sidebarCollapsed: false,
      hydrated: false,
      composerModel: null,
      preferredWorkspaceEditor: null,
      setProfile: (profile) => set({ profile }),
      clearProfile: () => set({ profile: null }),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setHydrated: (hydrated) => set({ hydrated }),
      setComposerModel: (composerModel) => set({ composerModel }),
      setPreferredWorkspaceEditor: (preferredWorkspaceEditor) =>
        set({ preferredWorkspaceEditor }),
    }),
    {
      name: APP_STORAGE_KEY,
      skipHydration: true,
      partialize: ({
        profile,
        theme,
        sidebarCollapsed,
        composerModel,
        preferredWorkspaceEditor,
      }) => ({
        profile,
        theme,
        sidebarCollapsed,
        composerModel,
        preferredWorkspaceEditor,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppStore> | undefined;
        return {
          ...current,
          profile: isProfile(saved?.profile) ? saved.profile : null,
          theme: saved?.theme === "light" ? "light" : "dark",
          sidebarCollapsed: saved?.sidebarCollapsed === true,
          composerModel: isModelSelection(saved?.composerModel)
            ? saved.composerModel
            : null,
          preferredWorkspaceEditor: isWorkspaceEditor(
            saved?.preferredWorkspaceEditor,
          )
            ? saved.preferredWorkspaceEditor
            : null,
        };
      },
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);

export function useSidebar() {
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggle = useAppStore((state) => state.toggleSidebar);
  return { collapsed, toggle };
}
