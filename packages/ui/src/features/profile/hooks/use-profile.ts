import { useNavigate } from "react-router";
import { useEffect } from "react";
import { useAppStore } from "@/shared/stores/app-store";

export function useProfile() {
  const navigate = useNavigate();
  const profile = useAppStore((state) => state.profile);
  const hydrated = useAppStore((state) => state.hydrated);
  useEffect(() => {
    if (hydrated && !profile && window.location.pathname !== "/")
      navigate("/", { replace: true });
  }, [navigate, hydrated, profile]);

  return hydrated ? profile : undefined;
}
