import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChallengeReview } from "@/shared/types/api";
import {
  challengeKeys,
  createChallengeReview,
  getChallengeReviews,
} from "@/features/challenges/api/challenge-api";

export function useChallengeReviews(
  profileId: string,
  challengeId: string,
  options: { enabled?: boolean } = {},
) {
  const queries = useQueryClient();
  const key = challengeKeys.reviews(profileId, challengeId);
  const reviews = useQuery({
    queryKey: key,
    queryFn: () => getChallengeReviews(profileId, challengeId),
    enabled: options.enabled ?? true,
    staleTime: 10_000,
    retry: false,
  });
  const create = useMutation({
    mutationFn: () => createChallengeReview(profileId, challengeId),
    onSuccess: (review) => {
      queries.setQueryData(key, (current: ChallengeReview[] | undefined) =>
        [review, ...(current ?? [])].slice(0, 20),
      );
      // The review is also a durable harness run, so refresh the Runs tab.
      void queries.invalidateQueries({ queryKey: ["harness-threads"] });
    },
    onError: () => {
      void queries.invalidateQueries({ queryKey: key });
    },
  });
  return { reviews, create };
}
