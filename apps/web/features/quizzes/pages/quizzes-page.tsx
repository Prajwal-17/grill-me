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
    <AppShell profile={profile} title="Quizzes">
      <main className="mx-auto w-full max-w-[1180px] px-5 py-6 md:px-10 md:py-8">
        <QuizWorkspace key={profile.id} profileId={profile.id} />
      </main>
    </AppShell>
  );
}
