import { useProfile } from "@/features/profile/hooks/use-profile";
import { CompactShell } from "@/shared/components/layout/compact-shell";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { QuizWorkspace } from "../components/quiz-workspace";

export function QuizzesPage() {
  const profile = useProfile();
  if (profile === undefined) return <LoadingScreen label="Loading quizzes…" />;
  if (!profile) return null;

  return (
    <CompactShell profile={profile}>
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-col px-4 py-4 sm:px-8 md:py-6">
        <QuizWorkspace key={profile.id} profileId={profile.id} />
      </main>
    </CompactShell>
  );
}
