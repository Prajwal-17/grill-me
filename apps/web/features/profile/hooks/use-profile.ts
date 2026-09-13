"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppStore } from "@/shared/stores/app-store";

export function useProfile() {
  const router = useRouter();
  const profile = useAppStore((state) => state.profile);
  const hydrated = useAppStore((state) => state.hydrated);
  useEffect(() => {
    if (hydrated && !profile && window.location.pathname !== "/")
      router.replace("/");
  }, [router, hydrated, profile]);

  return hydrated ? profile : undefined;
}
