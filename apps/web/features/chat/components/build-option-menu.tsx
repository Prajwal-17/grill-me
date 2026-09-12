"use client";
import { ChevronUp, Flame } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../shared/components/ui/dropdown-menu";

type BuildOption<T extends string> = {
  id: T;
  label: string;
  description: string;
  accent?: "grill";
};

export function BuildOptionMenu<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly BuildOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          data-grill-option={selected?.accent === "grill" || undefined}
          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-line px-2.5 text-sm font-normal outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-foreground data-[state=open]:bg-elevated disabled:opacity-50"
        >
          {selected?.accent === "grill" && (
            <Flame size={14} aria-hidden="true" />
          )}
          {selected?.label}
          <ChevronUp size={12} className="shrink-0 text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(260px,calc(100vw-32px))] p-1.5"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as T)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              data-grill-option={option.accent === "grill" || undefined}
              className="items-start rounded-md py-2.5 pl-8"
            >
              <span className="grid gap-0.5">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {option.label}
                  {option.accent === "grill" && (
                    <Flame size={14} aria-hidden="true" />
                  )}
                </span>
                <span className="text-xs leading-4 text-muted">
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
