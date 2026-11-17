import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

export function HistoryPicker({
  label,
  value,
  entries,
  onSelect,
}: {
  label: string;
  value: string;
  entries: { id: string; label: string; detail: ReactNode }[];
  onSelect: (id: string) => void;
}) {
  const selected = entries.find((entry) => entry.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${label}: ${selected?.label ?? "Choose"}`}
        >
          {selected?.label ?? "Choose"}
          <ChevronDown size={14} className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))]"
      >
        <DropdownMenuRadioGroup
          aria-label={label}
          value={value}
          onValueChange={onSelect}
        >
          {entries.map((entry, index) => (
            <DropdownMenuRadioItem
              key={entry.id}
              value={entry.id}
              textValue={entry.label}
              indicatorPosition="right"
              className="min-h-11 flex-col items-start gap-0.5 py-2"
            >
              <span className="flex w-full items-center gap-2 font-medium">
                {entry.label}
                {index === 0 && (
                  <span className="text-metadata font-normal text-muted">
                    Latest
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-metadata text-muted">
                {entry.detail}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
