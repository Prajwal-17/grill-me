import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import type { Challenge } from "@/shared/types/api";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";
import { ChallengeMetadata } from "@/features/challenges/components/challenge-metadata";

export function HistoryRow({ challenge: c }: { challenge: Challenge }) {
  return (
    <Link
      href={"/history?id=" + encodeURIComponent(c.id)}
      className="transition-colors hover:bg-canvas group grid grid-cols-[minmax(0,1fr)_20px] items-center gap-x-4 gap-y-2 border-b border-line px-4 py-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)_130px_24px] md:px-5"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="hidden size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface sm:grid">
          <Check size={14} className="text-muted" />
        </span>
        <span className="truncate text-sm font-medium">{c.title}</span>
      </span>
      <div className="col-start-1 row-start-2 md:col-auto md:row-auto">
        <ChallengeMetadata challenge={c} compact />
        <span className="mt-1 block text-xs text-muted md:hidden">
          {formatDate(c.completedAt)}
        </span>
      </div>
      <span className="hidden text-xs text-muted md:block">
        {formatDate(c.completedAt)}
      </span>
      <ArrowUpRight
        size={16}
        className="col-start-2 row-start-1 text-muted group-hover:text-foreground md:col-auto md:row-auto"
      />
    </Link>
  );
}
