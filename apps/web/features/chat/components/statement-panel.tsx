"use client";
import type { Challenge } from "../../../shared/types/api";
import type { ExerciseWorkspaceState } from "../hooks/use-exercise-workspace";
import { Upload } from "lucide-react";
import { StatementReader } from "../../challenges/components/statement-reader";
import { Button } from "../../../shared/components/ui/button";
import { TabsContent } from "../../../shared/components/ui/tabs";
export function StatementPanel({
  finished,
  setTab,
  challenge,
}: Pick<ExerciseWorkspaceState, "finished" | "setTab"> & {
  challenge: Challenge;
}) {
  return (
    <TabsContent
      value="statement"
      className="min-h-0 overflow-y-auto px-5 py-5 md:px-8"
    >
      <StatementReader challenge={challenge} />
      {!finished && (
        <div className="mx-auto mt-8 max-w-[1100px] border-t border-line pt-4">
          <Button onClick={() => setTab("solution")}>
            <Upload size={15} />
            Submit your solution
          </Button>
        </div>
      )}
    </TabsContent>
  );
}
