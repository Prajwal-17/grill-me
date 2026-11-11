import { Link } from "react-router";
import { ArrowUpRight, Check, Square } from "lucide-react";
import type { Challenge } from "@/shared/types/api";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";
import { ChallengeMetadata } from "@/features/challenges/components/challenge-metadata";
import { TableCell, TableRow } from "@/shared/components/ui/table";

export function HistoryRow({ challenge: c }: { challenge: Challenge }) {
  const Icon = c.status === "stopped" ? Square : Check;
  return (
    <TableRow className="group">
      <TableCell className="w-full max-w-0 whitespace-normal sm:w-auto">
        <Link
          to={"/chat?id=" + encodeURIComponent(c.id)}
          className="flex min-w-0 items-start gap-3 rounded-sm py-1"
        >
          <Icon
            size={15}
            className="mt-0.5 shrink-0 text-muted"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span
              title={c.title}
              className="block truncate text-ui font-medium group-hover:text-brand"
            >
              <span className="mr-2 font-normal tabular-nums text-muted">
                #{c.number}
              </span>
              {c.title}
            </span>
            <span className="mt-1 block text-metadata text-muted md:hidden">
              {c.status === "stopped" ? "Stopped" : formatDate(c.completedAt)}
            </span>
          </span>
        </Link>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <ChallengeMetadata challenge={c} compact />
      </TableCell>
      <TableCell className="hidden text-metadata tabular-nums text-muted sm:table-cell">
        {c.status === "stopped" ? "Stopped" : formatDate(c.completedAt)}
      </TableCell>
      <TableCell className="w-10">
        <ArrowUpRight size={14} className="text-muted" aria-hidden="true" />
      </TableCell>
    </TableRow>
  );
}
