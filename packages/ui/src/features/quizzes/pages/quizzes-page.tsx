import { useState } from "react";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { AppShell } from "@/shared/components/layout/app-shell";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { QuizWorkspace } from "../components/quiz-workspace";

export function QuizzesPage() {
  const profile = useProfile();
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(
    null,
  );
  if (profile === undefined) return <LoadingScreen label="Loading quizzes…" />;
  if (!profile) return null;

  return (
    <AppShell
      profile={profile}
      title="Quizzes"
      contentScrollable={false}
      actions={
        <div ref={setHeaderActions} className="flex items-center gap-2" />
      }
    >
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-col p-4 md:p-6">
        <QuizWorkspace
          key={profile.id}
          profileId={profile.id}
          headerActionsTarget={headerActions}
        />
      </main>
    </AppShell>
  );
}
