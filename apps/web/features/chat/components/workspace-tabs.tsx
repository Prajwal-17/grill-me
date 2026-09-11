"use client";
import {
  FileText,
  Upload,
  Lightbulb,
  ClipboardCheck,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { TabsList, TabsTrigger } from "../../../shared/components/ui/tabs";
import type { ExerciseWorkspaceState } from "../hooks/use-exercise-workspace";
export function WorkspaceTabs({
  reviews,
  send,
}: Pick<ExerciseWorkspaceState, "reviews" | "send">) {
  return (
    <div className="shrink-0 overflow-x-auto overflow-y-hidden border-b border-line px-3 md:px-7">
      <TabsList
        variant="line"
        aria-label="Exercise workspace"
        className="min-h-10 min-w-full justify-start gap-0 p-0 md:min-w-0"
      >
        {[
          { id: "statement", label: "Statement", icon: FileText },
          { id: "solution", label: "Solution", icon: Upload },
          { id: "hints", label: "Hints", icon: Lightbulb },
          { id: "review", label: "Review", icon: ClipboardCheck },
          { id: "reports", label: "Reports", icon: BarChart3 },
          { id: "chat", label: "Chat", icon: MessageSquare },
        ].map(({ id, label, icon: Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="min-h-10 flex-none px-3 text-xs sm:px-4 sm:text-sm"
          >
            <Icon size={15} className="hidden sm:block" />
            {label}
            {id === "review" && reviews.length > 0 && (
              <span className="ml-1 text-xs text-muted">{reviews.length}</span>
            )}
            {id === "review" &&
              send.isPending &&
              send.variables?.mode === "review" && (
                <span
                  className="ml-1 size-1.5 animate-pulse rounded-full bg-current"
                  aria-label="Review in progress"
                />
              )}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
