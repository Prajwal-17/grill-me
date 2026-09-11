"use client";
import { AppShell } from "../../../shared/components/layout/app-shell";
import { LoadingScreen } from "../../../shared/components/ui/feedback";
import { ProfileGatePage } from "../../profile/pages/profile-gate-page";
import { useProfile } from "../../profile/hooks/use-profile";
import { GenerationHome } from "../components/create-exercise";

export function GenerationHomePage() {
  const profile = useProfile();
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return <ProfileGatePage />;
  return (
    <AppShell profile={profile}>
      <GenerationHome profile={profile} />
    </AppShell>
  );
}
