"use client";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
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
} from "@/shared/components/ui/alert-dialog";
import type { ChallengeWorkspaceState } from "@/features/chat/hooks/use-challenge-workspace";
export function WorkspaceHeader({
  finished,
  busy,
  complete,
}: Pick<ChallengeWorkspaceState, "finished" | "busy" | "complete">) {
  return (
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4 md:px-7">
      <Link
        href="/challenges"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={15} />
        <span>Challenges</span>
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
                Complete this build
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Complete this build?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your statement, submissions, and feedback will be saved in
                  History. You won’t be able to submit more work.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep building</AlertDialogCancel>
                <AlertDialogAction onClick={() => complete.mutate()}>
                  Complete this build
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </header>
  );
}
