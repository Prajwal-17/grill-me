import { Link } from "react-router";
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
    <details
      className="mt-6 border-t border-line py-4"
      aria-label="Progress by topic"
    >
      <summary className="text-ui font-medium">
        Practice progress{" "}
        <span className="ml-2 font-normal text-muted">
          {groups.size} topics
        </span>
      </summary>
      <div className="mt-4 divide-y divide-line">
        {[...groups].map(([name, items]) => {
          const recent = items.sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
          return (
            <div
              key={name}
              className="flex flex-wrap items-start justify-between gap-3 py-3"
            >
              <div>
                <p className="text-ui capitalize">{name}</p>
                <p className="mt-1 text-metadata text-muted">
                  {items.filter((i) => i.accepted).length} accepted ·{" "}
                  {
                    items.filter((i) => i.accepted && !i.assistance.hints)
                      .length
                  }{" "}
                  without hints
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-ui">
                {recent.slice(-5).map((item) => (
                  <Link
                    key={item.challengeId}
                    to={`/chat?id=${item.challengeId}`}
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
    </details>
  );
}
