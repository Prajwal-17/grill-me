import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { AppShell } from "@/shared/components/layout/app-shell";
import { Button, buttonStyles } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import {
  challengeKeys,
  getActiveChallenges,
  getArchivedChallenges,
  getChallengeHistory,
} from "@/features/challenges/api/challenge-api";
import {
  ChallengeTable,
  ChallengeTableSkeleton,
} from "@/features/challenges/components/challenge-table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";

function CollectionSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        size="sm"
        className="h-9 w-full min-w-0 bg-surface text-ui shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ChallengesPage() {
  const profile = useProfile();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("newest");
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get("status");
  const status =
    requestedStatus === "archived" || requestedStatus === "completed"
      ? requestedStatus
      : "active";
  const active = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const archived = useQuery({
    queryKey: challengeKeys.archived(profile?.id),
    queryFn: () => getArchivedChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const history = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  const collections = [
    {
      value: "active",
      label: "In progress",
      data: active.data ?? [],
      loading: active.isLoading,
      error: active.data ? null : active.error,
      retry: () => void active.refetch(),
      empty: "No active challenges",
    },
    {
      value: "completed",
      label: "Completed",
      data: history.data ?? [],
      loading: history.isLoading,
      error: history.data ? null : history.error,
      retry: () => void history.refetch(),
      empty: "No completed challenges",
    },
    {
      value: "archived",
      label: "Archived",
      data: archived.data ?? [],
      loading: archived.isLoading,
      error: archived.data ? null : archived.error,
      retry: () => void archived.refetch(),
      empty: "No archived challenges",
    },
  ];
  const query = search.trim().toLowerCase();
  const hasFilters = Boolean(query || difficulty !== "all" || scope !== "all");
  return (
    <AppShell profile={profile} title="Challenges" contentScrollable={false}>
      <main className="h-full min-h-0 overflow-y-auto overscroll-contain p-4 md:p-5">
        <Tabs
          value={status}
          onValueChange={(value) =>
            setParams((current) => {
              current.set("status", value);
              return current;
            })
          }
          className="mx-auto w-full max-w-[1440px] gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 overflow-x-auto">
              <TabsList
                variant="line"
                aria-label="Challenge status"
                className="w-full justify-start gap-5 border-b border-line p-0 group-data-[orientation=horizontal]/tabs:h-auto"
              >
                {collections.map(({ value, label, data, loading }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="h-9 flex-none rounded-none border-0 px-0 text-ui font-normal data-[state=active]:font-medium"
                  >
                    {label}
                    <span className="text-metadata font-normal text-muted tabular-nums">
                      {loading ? "–" : data.length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <Link className={buttonStyles("primary")} to="/">
              <Plus size={15} />
              New build
            </Link>
          </div>
          <div
            role="search"
            aria-label="Challenge filters"
            className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(180px,1fr)_150px_145px_160px]"
          >
            <div className="relative col-span-2 lg:col-span-1">
              <Search
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              />
              <Input
                type="search"
                aria-label="Search challenges"
                placeholder="Search challenges…"
                value={search}
                maxLength={200}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 bg-surface pl-9 text-ui shadow-none"
              />
            </div>
            <CollectionSelect
              label="Challenge difficulty"
              value={difficulty}
              onChange={setDifficulty}
              options={[
                ["all", "Any difficulty"],
                ["easy", "Easy"],
                ["medium", "Medium"],
                ["hard", "Hard"],
                ["grill", "Grill"],
              ]}
            />
            <CollectionSelect
              label="Challenge type"
              value={scope}
              onChange={setScope}
              options={[
                ["all", "Any type"],
                ["focused", "Focused"],
                ["feature", "Feature"],
                ["system", "System"],
              ]}
            />
            <div className="col-span-2 lg:col-span-1">
              <CollectionSelect
                label="Sort challenges"
                value={sort}
                onChange={setSort}
                options={[
                  ["newest", "Newest first"],
                  ["oldest", "Oldest first"],
                  ["name", "Name A–Z"],
                  ["difficulty", "Difficulty ↑"],
                  ["duration", "Shortest first"],
                ]}
              />
            </div>
          </div>
          {collections.map(({ value, data, empty, loading, error, retry }) => {
            const filtered = data.filter(
              (item) =>
                (!query ||
                  `${item.title} ${item.topic ?? ""} #${item.number}`
                    .toLowerCase()
                    .includes(query)) &&
                (scope === "all" || item.scope === scope) &&
                (difficulty === "all" || item.difficulty === difficulty),
            );
            filtered.sort((a, b) => {
              const newest =
                b.createdAt.localeCompare(a.createdAt) || b.number - a.number;
              if (sort === "oldest") return -newest;
              if (sort === "name")
                return (
                  a.title.localeCompare(b.title, undefined, {
                    numeric: true,
                    sensitivity: "base",
                  }) || newest
                );
              if (sort === "duration")
                return (
                  a.durationEstimate.minMinutes -
                    b.durationEstimate.minMinutes || newest
                );
              if (sort === "difficulty") {
                const ranks = { easy: 0, medium: 1, hard: 2, grill: 3 };
                return ranks[a.difficulty] - ranks[b.difficulty] || newest;
              }
              return newest;
            });
            return (
              <TabsContent key={value} value={value} className="space-y-3">
                {loading ? (
                  <ChallengeTableSkeleton />
                ) : error ? (
                  <ErrorState
                    title="Could not load challenges"
                    message={error.message}
                    onRetry={retry}
                  />
                ) : filtered.length ? (
                  <ChallengeTable challenges={filtered} />
                ) : (
                  <div className="rounded-lg border border-line px-4 py-12 text-center">
                    <h2 className="text-ui font-medium">
                      {hasFilters ? "No challenges found" : empty}
                    </h2>
                    {hasFilters ? (
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setSearch("");
                          setScope("all");
                          setDifficulty("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      value === "active" && (
                        <Link
                          to="/"
                          className={buttonStyles("primary") + " mt-4"}
                        >
                          <Plus size={14} />
                          Create a challenge
                        </Link>
                      )
                    )}
                  </div>
                )}
                {!loading && !error && (
                  <div className="flex items-center justify-between gap-3 text-metadata text-muted">
                    <p role="status" aria-live="polite">
                      {filtered.length}{" "}
                      {filtered.length === 1 ? "challenge" : "challenges"}
                      {hasFilters && ` of ${loading ? "–" : data.length}`}
                    </p>
                    {value === "completed" && (
                      <Link
                        to="/history"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        View history
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </main>
    </AppShell>
  );
}
