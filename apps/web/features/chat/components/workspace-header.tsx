"use client";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "../../../shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../../shared/components/ui/alert-dialog";
import type { ExerciseWorkspaceState } from "../hooks/use-exercise-workspace";
export function WorkspaceHeader({
  finished,
  busy,
  complete,
}: Pick<ExerciseWorkspaceState, "finished" | "busy" | "complete">) {
  return (
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4 md:px-7">
      <Link
        href="/exercises"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={15} />
        <span>Exercises</span>
      </Link>
      <div className="flex items-center gap-2">
        {finished ? (
          <span className="flex items-center gap-2 text-xs text-muted">
            <Check size={14} />
            Completed
          </span>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={busy} size="sm">
                <Check size={14} />
                Mark complete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Complete this exercise?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your statement, submissions, and feedback will be saved in
                  History. You won’t be able to submit more work.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep practicing</AlertDialogCancel>
                <AlertDialogAction onClick={() => complete.mutate()}>
                  Mark complete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </header>
  );
}
