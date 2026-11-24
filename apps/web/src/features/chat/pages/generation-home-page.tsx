import { CompactShell } from "@/shared/components/layout/compact-shell";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { ProfileGatePage } from "@/features/profile/pages/profile-gate-page";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { GenerationHome } from "@/features/chat/components/create-challenge";

export function GenerationHomePage() {
  const profile = useProfile();
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return <ProfileGatePage />;
  return (
    <CompactShell profile={profile}>
      <GenerationHome profile={profile} />
    </CompactShell>
  );
}
