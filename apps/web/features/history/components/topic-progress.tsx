"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getProgress } from "@/features/chat/api/review-api";
import type { TopicProgress } from "@/shared/types/api";
export function TopicProgressView({ profileId }: { profileId: string }) {
  const progress = useQuery({
    queryKey: ["progress", profileId],
    queryFn: () => getProgress(profileId),
  });
  if (!progress.data?.length) return null;
  const groups = new Map<string, TopicProgress[]>();
  for (const item of progress.data) {
    const key = `${item.topic} · ${item.scope} · ${item.difficulty}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <section
      className="mb-8 border-b border-line pb-6"
      aria-label="Progress by topic"
    >
      <h2 className="mb-4 text-base font-semibold">Practice progress</h2>
      <div className="space-y-4">
        {[...groups].map(([name, items]) => {
          const recent = items.sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
          return (
            <div
              key={name}
              className="flex flex-wrap items-start justify-between gap-2"
            >
              <div>
                <p className="text-sm capitalize">{name}</p>
                <p className="mt-1 text-xs text-muted">
                  {items.filter((i) => i.accepted).length} accepted ·{" "}
                  {
                    items.filter((i) => i.accepted && !i.assistance.hints)
                      .length
                  }{" "}
                  without hints
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {recent.slice(-5).map((item) => (
                  <Link
                    key={item.challengeId}
                    href={`/chat?id=${item.challengeId}`}
                    title={`#${item.number} ${item.title}`}
                    className="underline decoration-line underline-offset-4 tabular-nums"
                  >
                    #{item.number}{" "}
                    {item.score === null ? "—" : `${item.score}/10`}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">
        Latest review per challenge. Scores compare practice within the same
        topic, mode, and difficulty.
      </p>
    </section>
  );
}
