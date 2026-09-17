"use client";

import type { Profile } from "@/shared/types/api";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

type AppStore = {
  profile: Profile | null;
  theme: Theme;
  sidebarCollapsed: boolean;
  hydrated: boolean;
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setHydrated: (hydrated: boolean) => void;
};

const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "development";
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

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      profile: null,
      theme: "dark",
      sidebarCollapsed: false,
      hydrated: false,
      setProfile: (profile) => set({ profile }),
      clearProfile: () => set({ profile: null }),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: APP_STORAGE_KEY,
      skipHydration: true,
      partialize: ({ profile, theme, sidebarCollapsed }) => ({
        profile,
        theme,
        sidebarCollapsed,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppStore> | undefined;
        return {
          ...current,
          profile: isProfile(saved?.profile) ? saved.profile : null,
          theme: saved?.theme === "light" ? "light" : "dark",
          sidebarCollapsed: saved?.sidebarCollapsed === true,
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
