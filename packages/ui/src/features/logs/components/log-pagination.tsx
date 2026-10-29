import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonStyles } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";
import { logHref } from "@/features/logs/lib/log-formatters";
import type { LogFilters, LogPage } from "@/features/logs/types";

export function LogPagination({
  data,
  filters,
}: {
  data: LogPage;
  filters: LogFilters;
}) {
  const pages = [
    ...new Set([1, data.page - 1, data.page, data.page + 1, data.totalPages]),
  ]
    .filter((page) => page > 0 && page <= data.totalPages)
    .sort((a, b) => a - b);
  const navClass = buttonStyles("ghost", "icon-sm");
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
      <p className="text-metadata tabular-nums text-muted">
        {data.total === 0
          ? "0 requests"
          : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total.toLocaleString()} requests`}
      </p>
      <nav aria-label="Log pages" className="flex items-center gap-1">
        {data.page > 1 ? (
          <Link
            to={logHref({ ...filters, page: data.page - 1 })}
            aria-label="Previous page"
            className={navClass}
          >
            <ChevronLeft size={16} />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            aria-label="Previous page"
            className={cn(navClass, "opacity-30")}
          >
            <ChevronLeft size={16} />
          </span>
        )}
        {pages.map((page, index) => (
          <span key={page} className="inline-flex items-center gap-1">
            {index > 0 && page - pages[index - 1]! > 1 && (
              <span className="px-1 text-muted" aria-hidden="true">
                …
              </span>
            )}
            <Link
              to={logHref({ ...filters, page })}
              aria-label={`Page ${page}`}
              aria-current={page === data.page ? "page" : undefined}
              className={cn(
                buttonStyles(
                  page === data.page ? "secondary" : "ghost",
                  "icon-sm",
                ),
                "tabular-nums",
              )}
            >
              {page}
            </Link>
          </span>
        ))}
        {data.page < data.totalPages ? (
          <Link
            to={logHref({ ...filters, page: data.page + 1 })}
            aria-label="Next page"
            className={navClass}
          >
            <ChevronRight size={16} />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            aria-label="Next page"
            className={cn(navClass, "opacity-30")}
          >
            <ChevronRight size={16} />
          </span>
        )}
      </nav>
    </footer>
  );
}
