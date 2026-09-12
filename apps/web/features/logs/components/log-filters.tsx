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
    <div className="flex shrink-0 flex-col gap-2 border-b border-line p-2.5 sm:flex-row sm:items-center">
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
            className="h-8 border-line bg-canvas pl-9 text-sm shadow-none"
          />
        </div>
        <Button type="submit" size="sm">
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
      </div>
    </div>
  );
}
