"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Check, MessageSquare } from "lucide-react";
import type { Challenge, Profile } from "../../../shared/types/api";
import { challengeKeys } from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import { formatDate } from "../../challenges/lib/challenge-formatters";
import { getMessages } from "../../chat/api/message-api";
import { ChatMessage } from "../../chat/components/chat-message";
import { Button, buttonStyles } from "../../../shared/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../../shared/components/ui/tabs";
export function HistoryDetail({
  profile,
  selected,
}: {
  profile: Profile;
  selected: Challenge;
}) {
  const messages = useQuery({
    queryKey: challengeKeys.messages(selected?.id),
    queryFn: () => getMessages(profile.id, selected.id),
    enabled: Boolean(true),
  });
  const discussion = messages.data?.filter((m) => m.mode !== "generate") ?? [];
  return (
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
  );
}
