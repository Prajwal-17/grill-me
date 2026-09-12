"use client";
import { Search } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
}: {
  filters: LogFilters;
  onChange: (filters: LogFilters) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
      <form
        key={filters.search}
        className="flex min-w-0 flex-1 gap-2"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const search = String(
            new FormData(event.currentTarget).get("search") ?? "",
          ).trim();
          onChange({ ...filters, search, page: 1 });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            name="search"
            defaultValue={filters.search}
            maxLength={200}
            placeholder="Search requests or models"
            aria-label="Search logs"
            className="pl-9 shadow-none"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <div className="flex gap-2">
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
            className="flex-1 shadow-none sm:w-[145px]"
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
            className="flex-1 shadow-none sm:w-[170px]"
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
      </div>
    </div>
  );
}
