import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Circle, Pause } from "lucide-react";
import { Link } from "react-router";
import {
  challengeKeys,
  getActiveChallenges,
} from "@/features/challenges/api/challenge-api";
import { buildMetadata } from "@/features/challenges/lib/challenge-formatters";
import { Button } from "@/shared/components/ui/button";

export function RecentBuilds({ profileId }: { profileId: string }) {
  const builds = useQuery({
    queryKey: challengeKeys.active(profileId),
    queryFn: () => getActiveChallenges(profileId),
  });
  if (builds.isLoading)
    return (
      <div
        className="mt-10 h-24 animate-pulse rounded-lg bg-panel"
        role="status"
        aria-label="Loading recent builds"
      />
    );
  if (builds.error)
    return (
      <div className="mt-8 flex items-center justify-between gap-3 text-metadata text-muted">
        <span>Could not load recent builds.</span>
        <Button size="sm" variant="ghost" onClick={() => builds.refetch()}>
          Retry
        </Button>
      </div>
    );
  if (!builds.data?.length) return null;
  return (
    <section className="mt-10" aria-labelledby="recent-builds-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="recent-builds-heading" className="text-ui font-medium">
          Continue building
        </h2>
        <Link
          to="/challenges"
          className="flex items-center gap-1 text-metadata text-muted hover:text-foreground"
        >
          All challenges <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-line border-y border-line">
        {builds.data.slice(0, 4).map((build) => {
          const Icon = build.status === "paused" ? Pause : Circle;
          return (
            <Link
              key={build.id}
              to={`/chat?id=${encodeURIComponent(build.id)}`}
              className="group flex items-center gap-3 px-2 py-3.5 hover:bg-panel"
            >
              <Icon
                size={14}
                className="shrink-0 text-muted"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium">
                  {build.title}
                </span>
                <span className="mt-1 block truncate text-metadata text-muted">
                  #{build.number} ·{" "}
                  {buildMetadata(build)
                    .map((item) => item.value)
                    .join(" · ")}
                </span>
              </div>
              <ArrowRight
                size={14}
                className="shrink-0 text-muted group-hover:text-brand"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
