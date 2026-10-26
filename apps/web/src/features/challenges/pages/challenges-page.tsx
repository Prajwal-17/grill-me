import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { AppShell } from "@/shared/components/layout/app-shell";
import { buttonStyles } from "@/shared/components/ui/button";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import {
  challengeKeys,
  getActiveChallenges,
  getSavedChallenges,
  getChallengeHistory,
} from "@/features/challenges/api/challenge-api";
import { ChallengeTable } from "@/features/challenges/components/challenge-table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";

export function ChallengesPage() {
  const profile = useProfile();
  const active = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const saved = useQuery({
    queryKey: challengeKeys.saved(profile?.id),
    queryFn: () => getSavedChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const history = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  const error = active.error ?? saved.error ?? history.error;
  return (
    <AppShell
      profile={profile}
      title="Challenges"
      contentScrollable={false}
      actions={
        <Link className={buttonStyles("primary")} to="/">
          <Plus size={16} />
          New build
        </Link>
      }
    >
      {active.isLoading || saved.isLoading || history.isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorState
          title="Could not load challenges"
          message={error.message}
          onRetry={() => {
            void active.refetch();
            void saved.refetch();
            void history.refetch();
          }}
        />
      ) : (
        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-7 md:px-8 md:py-8">
            <Tabs
              defaultValue="active"
              className="mx-auto w-full max-w-[1100px] gap-4"
            >
              <div className="overflow-x-auto">
                <TabsList
                  variant="line"
                  aria-label="Challenge status"
                  className="w-full justify-start gap-6 border-b border-line p-0 group-data-[orientation=horizontal]/tabs:h-auto"
                >
                  {[
                    {
                      value: "active",
                      label: "In progress",
                      count: active.data?.length ?? 0,
                    },
                    {
                      value: "saved",
                      label: "Saved for later",
                      count: saved.data?.length ?? 0,
                    },
                    { value: "completed", label: "Recently completed" },
                  ].map(({ value, label, count }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="h-auto flex-none rounded-none border-0 px-0 pb-3 pt-0 text-[13px] font-normal data-[state=active]:font-medium"
                    >
                      {label}
                      {count !== undefined && (
                        <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-normal text-muted">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <TabsContent value="active">
                {active.data?.length ? (
                  <ChallengeTable challenges={active.data} />
                ) : (
                  <div className="rounded-lg border border-line bg-panel px-6 py-12">
                    <h3 className="text-base font-medium">
                      No active challenges
                    </h3>
                    <Link to="/" className={buttonStyles("primary") + " mt-5"}>
                      <Plus size={15} />
                      Create a challenge
                    </Link>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="saved">
                {saved.data?.length ? (
                  <ChallengeTable challenges={saved.data} />
                ) : (
                  <div className="rounded-lg border border-line bg-panel px-6 py-12">
                    <h3 className="text-base font-medium">
                      No saved challenges
                    </h3>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="completed">
                {history.data?.length ? (
                  <>
                    <ChallengeTable challenges={history.data.slice(0, 4)} />
                    <Link
                      to="/history"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
                    >
                      View history
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <div className="rounded-lg border border-line bg-panel px-6 py-12">
                    <h3 className="text-base font-medium">
                      No completed challenges
                    </h3>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      )}
    </AppShell>
  );
}
