"use client";

import { useProfile } from "@/features/profile/hooks/use-profile";
import { AppShell } from "@/shared/components/layout/app-shell";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { QuizWorkspace } from "../components/quiz-workspace";

export function QuizzesPage() {
  const profile = useProfile();
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;

  return (
    <AppShell profile={profile}>
      <main className="px-5 py-6 md:px-10 md:py-8">
        <header className="mx-auto mb-8 w-full max-w-[820px] space-y-2">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Quizzes</h1>
          <p className="text-sm text-muted">
            Practice any topic with a quiz. Choose your difficulty, save your
            progress, and review explanations when you finish.
          </p>
        </header>
        <QuizWorkspace key={profile.id} profileId={profile.id} />
      </main>
    </AppShell>
  );
}
