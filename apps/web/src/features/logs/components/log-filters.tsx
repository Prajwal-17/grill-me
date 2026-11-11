import type { ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";
import { SearchField } from "@/shared/components/ui/search-field";
import { CollectionToolbar } from "@/shared/components/layout/collection-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  OPERATION_LABELS,
  STATUS_LABELS,
} from "@/features/logs/lib/log-formatters";
import type { LogFilters } from "@/features/logs/types";
export function LogFilterBar({
  filters,
  onChange,
  action,
}: {
  filters: LogFilters;
  action?: ReactNode;
  onChange: (filters: LogFilters) => void;
}) {
  return (
    <CollectionToolbar className="flex-col items-stretch sm:flex-row sm:items-center">
      <form
        key={filters.search}
        className="flex min-w-0 flex-1 gap-1.5 sm:max-w-[440px]"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const search = String(
            new FormData(event.currentTarget).get("search") ?? "",
          ).trim();
          onChange({ ...filters, search, page: 1 });
        }}
      >
        <SearchField
          name="search"
          defaultValue={filters.search}
          maxLength={200}
          placeholder="Search requests or models"
          aria-label="Search logs"
          className="min-w-0 flex-1"
        />
        <Button type="submit" className="md:h-9">
          Search
        </Button>
      </form>
      <div className="flex gap-1.5 sm:ml-auto">
        <Select
          value={filters.status}
          onValueChange={(status) =>
            onChange({
              ...filters,
              status: status as LogFilters["status"],
              page: 1,
            })
          }
        >
          <SelectTrigger
            aria-label="Filter by status"
            size="sm"
            className="h-8 flex-1 border-line shadow-none sm:w-[132px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.operation}
          onValueChange={(operation) =>
            onChange({
              ...filters,
              operation: operation as LogFilters["operation"],
              page: 1,
            })
          }
        >
          <SelectTrigger
            aria-label="Filter by operation"
            size="sm"
            className="h-8 flex-1 border-line shadow-none sm:w-[154px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">All operations</SelectItem>
            {Object.entries(OPERATION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {action}
      </div>
    </CollectionToolbar>
  );
}
