"use client";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  History,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  challengeKeys,
  getChallengeHistory,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import {
  formatDate,
  formatChallengeType,
} from "../../challenges/lib/challenge-formatters";
import { getMessages } from "../../chat/api/message-api";
import { ChatMessage } from "../../chat/components/chat-message";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppShell } from "../../../shared/components/app-header";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { Button, buttonStyles } from "../../../shared/components/ui/button";
import { Input } from "../../../shared/components/ui/input";
import { ChoiceSelect } from "../../../shared/components/ui/choice-select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../../shared/components/ui/tabs";

export function HistoryPage() {
  const profile = useProfile();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("all");
  const history = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  const selected = history.data?.find((c) => c.id === selectedId);
  const messages = useQuery({
    queryKey: challengeKeys.messages(selected?.id),
    queryFn: () => getMessages(profile!.id, selected!.id),
    enabled: Boolean(profile && selected),
  });
  const discussion = messages.data?.filter((m) => m.mode !== "generate") ?? [];
  const filtered = (history.data ?? []).filter(
    (c) =>
      (format === "all" || c.type === format) &&
      [c.title, formatChallengeType(c.type)]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  return (
    <AppShell profile={profile}>
      {history.isLoading ? (
        <LoadingScreen label="Loading history…" />
      ) : history.error ? (
        <ErrorState
          title="Could not load history"
          message={history.error.message}
          onRetry={() => void history.refetch()}
        />
      ) : selectedId ? (
        selected ? (
          <main className="workspace flex min-h-0 flex-col">
            <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-5 md:px-8">
              <Link href="/history" className={buttonStyles("ghost", "sm")}>
                <ArrowLeft size={15} />
                History
              </Link>
              <span className="flex items-center gap-2 text-xs text-muted">
                <Check size={14} />
                Completed {formatDate(selected.completedAt)}
              </span>
            </header>
            <Tabs
              key={selected.id}
              defaultValue="brief"
              className="min-h-0 flex-1 gap-0"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-line px-5 md:px-8">
                <TabsList variant="line" className="h-12">
                  <TabsTrigger value="brief" className="px-4">
                    Brief
                  </TabsTrigger>
                  <TabsTrigger value="discussion" className="px-4">
                    Discussion
                    {!messages.isLoading && discussion.length > 0 && (
                      <span className="ml-1 text-xs text-muted">
                        {discussion.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
                {selected.hint && (
                  <span className="text-xs text-muted">Hint used</span>
                )}
              </div>
              <TabsContent
                value="brief"
                className="min-h-0 overflow-y-auto p-5 md:p-10"
              >
                <ChallengeCard challenge={selected} />
              </TabsContent>
              <TabsContent
                value="discussion"
                className="min-h-0 overflow-y-auto px-5 py-7 md:px-10"
              >
                <div className="mx-auto max-w-[68ch]">
                  <h1 className="mb-7 text-xl font-semibold tracking-tight">
                    {selected.title}
                  </h1>
                  {messages.isLoading ? (
                    <p role="status" className="text-sm text-muted">
                      Loading discussion…
                    </p>
                  ) : messages.error ? (
                    <div role="alert">
                      <p className="text-sm">{messages.error.message}</p>
                      <Button
                        className="mt-3"
                        onClick={() => void messages.refetch()}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : discussion.length ? (
                    discussion.map((m) => <ChatMessage key={m.id} {...m} />)
                  ) : (
                    <div className="rounded-xl border border-dashed border-line p-8">
                      <MessageSquare size={20} className="mb-3 text-muted" />
                      <p className="text-sm text-muted">
                        No discussion was saved for this exercise.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </main>
        ) : (
          <main className="page">
            <h1 className="page-title">Exercise not found</h1>
            <p className="mt-3 text-sm text-muted">
              This exercise is not in your completed history.
            </p>
            <Link
              href="/history"
              className={buttonStyles("secondary") + " mt-5"}
            >
              <ArrowLeft size={15} />
              Back to history
            </Link>
          </main>
        )
      ) : (
        <main className="page max-w-[1100px]">
          <header className="mb-8 flex items-end justify-between">
            <h1 className="page-title">History</h1>
            <span className="text-xs text-muted">
              {history.data?.length ?? 0} completed
            </span>
          </header>
          {history.data?.length ? (
            <>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-3 text-muted"
                  />
                  <Input
                    aria-label="Search history"
                    placeholder="Search exercises…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 pl-9 pr-9"
                  />
                  {search && (
                    <button
                      aria-label="Clear search"
                      className="absolute right-2 top-2 rounded p-1 text-muted hover:text-foreground"
                      onClick={() => setSearch("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                <ChoiceSelect
                  label="Filter history by format"
                  value={format}
                  onChange={setFormat}
                  options={[
                    { id: "all", label: "All formats" },
                    { id: "exercise", label: "Coding exercise" },
                    { id: "question", label: "Tricky question" },
                    { id: "architecture", label: "Architecture" },
                    { id: "mini-project", label: "Mini-project" },
                  ]}
                  className="h-10 w-full bg-surface sm:w-48"
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="hidden grid-cols-[minmax(0,1fr)_150px_130px_24px] gap-4 border-b border-line bg-canvas px-5 py-3 text-xs text-muted md:grid">
                  <span>Exercise</span>
                  <span>Format</span>
                  <span>Completed</span>
                  <span />
                </div>
                {filtered.length ? (
                  filtered.map((c) => (
                    <Link
                      key={c.id}
                      href={"/history?id=" + encodeURIComponent(c.id)}
                      className="archive-row group grid grid-cols-[minmax(0,1fr)_20px] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_150px_130px_24px] md:px-5"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="hidden size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface sm:grid">
                          <Check size={14} className="text-muted" />
                        </span>
                        <span className="truncate text-sm font-medium">
                          {c.title}
                        </span>
                      </span>
                      <span className="col-start-1 row-start-2 text-xs text-muted md:col-auto md:row-auto">
                        {formatChallengeType(c.type)}
                        <span className="ml-3 md:hidden">
                          {formatDate(c.completedAt)}
                        </span>
                      </span>
                      <span className="hidden text-xs text-muted md:block">
                        {formatDate(c.completedAt)}
                      </span>
                      <ArrowUpRight
                        size={16}
                        className="col-start-2 row-start-1 text-muted group-hover:text-foreground md:col-auto md:row-auto"
                      />
                    </Link>
                  ))
                ) : (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm text-muted">
                      No exercises match your search.
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-3"
                      onClick={() => {
                        setSearch("");
                        setFormat("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-line p-8 md:py-14">
              <History size={22} className="mb-4 text-muted" />
              <h2 className="text-base font-medium">
                No completed exercises yet
              </h2>
              <p className="mt-2 text-sm text-muted">
                Mark an exercise complete to keep its brief and discussion here.
              </p>
              <Link
                href="/exercises"
                className={buttonStyles("secondary") + " mt-5"}
              >
                Back to exercises
              </Link>
            </div>
          )}
        </main>
      )}
    </AppShell>
  );
}
