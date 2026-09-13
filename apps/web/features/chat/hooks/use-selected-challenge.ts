"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Challenge, Profile } from "@/shared/types/api";
import {
  challengeKeys,
  getActiveChallenges,
  getChallenge,
} from "@/features/challenges/api/challenge-api";
export function useSelectedChallenge({
  profile,
  challengeId,
  createNew,
}: {
  profile: Profile | null | undefined;
  challengeId?: string;
  createNew: boolean;
}) {
  const [completedChallenge, setCompletedChallenge] =
    useState<Challenge | null>(null);
  const active = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile && !challengeId && !createNew),
  });
  const detail = useQuery({
    queryKey: challengeKeys.detail(profile?.id, challengeId),
    queryFn: () => getChallenge(profile!.id, challengeId!),
    enabled: Boolean(profile && challengeId && !createNew),
  });
  const challenge = createNew
    ? undefined
    : challengeId
      ? detail.data
      : (completedChallenge ?? active.data?.[0]);
  const loading =
    !createNew && (challengeId ? detail.isLoading : active.isLoading);

  return {
    challenge,
    loading,
    error: detail.error ?? active.error,
    retry: () => void (challengeId ? detail.refetch() : active.refetch()),
    setCompletedChallenge,
  };
}
