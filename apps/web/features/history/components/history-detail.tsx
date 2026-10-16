"use client";
import type { Challenge, Profile } from "@/shared/types/api";
import { PracticeWorkspace } from "@/features/chat/components/practice-workspace";
export function HistoryDetail({
  profile,
  selected,
}: {
  profile: Profile;
  selected: Challenge;
}) {
  return (
    <PracticeWorkspace
      profile={profile}
      challenge={selected}
      backTo={{ label: "History", href: "/history" }}
    />
  );
}
