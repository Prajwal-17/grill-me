"use client";
import type { ReactNode } from "react";
import type { Challenge } from "@/shared/types/api";
import type { ExerciseWorkspaceState } from "@/features/chat/hooks/use-exercise-workspace";
import { ExerciseReport } from "@/features/chat/components/exercise-report";
import { TabsContent } from "@/shared/components/ui/tabs";
export function ReportsPanel({
  saved,
  setTab,
  challenge,
  messageFeedback,
}: Pick<ExerciseWorkspaceState, "saved" | "setTab"> & {
  challenge: Challenge;
  messageFeedback: ReactNode;
}) {
  return (
    <TabsContent
      value="reports"
      className="min-h-0 overflow-y-auto px-5 py-8 md:px-10 md:py-10"
    >
      {messageFeedback ? (
        <div className="mx-auto max-w-[76ch]">{messageFeedback}</div>
      ) : (
        <ExerciseReport
          challenge={challenge}
          messages={saved}
          onReview={() => setTab("review")}
        />
      )}
    </TabsContent>
  );
}
