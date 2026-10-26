import { useProfile } from "@/features/profile/hooks/use-profile";
import { AppShell } from "@/shared/components/layout/app-shell";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { QuizWorkspace } from "../components/quiz-workspace";

export function QuizzesPage() {
  const profile = useProfile();
  if (profile === undefined) return <LoadingScreen label="Loading quizzes…" />;
  if (!profile) return null;

  return (
    <AppShell profile={profile} title="Quizzes" contentScrollable={false}>
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-col px-5 py-7 md:px-8 md:py-8">
        <QuizWorkspace key={profile.id} profileId={profile.id} />
      </main>
    </AppShell>
  );
}
