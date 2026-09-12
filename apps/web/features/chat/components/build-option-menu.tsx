"use client";
import { ChevronUp, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

type BuildOption<T extends string> = {
  id: T;
  label: string;
  description: string;
  icon: LucideIcon;
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
  const SelectedIcon = selected?.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          data-grill-option={selected?.accent === "grill" || undefined}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2 text-sm font-normal hover:bg-elevated focus-visible:ring-2 focus-visible:ring-foreground data-[grill-option]:focus-visible:ring-[var(--grill-accent)] data-[state=open]:bg-elevated disabled:opacity-50 sm:px-2.5"
        >
          {SelectedIcon && (
            <SelectedIcon
              className="size-3.5 shrink-0 opacity-80"
              aria-hidden="true"
              focusable="false"
            />
          )}
          {selected?.label}
          <ChevronUp
            className="size-2.5 shrink-0 text-muted sm:size-3"
            aria-hidden="true"
            focusable="false"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="w-[min(260px,calc(100vw-32px))] p-1.5"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as T)}
        >
          {options.map(({ icon: Icon, ...option }) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              indicatorPosition="right"
              data-grill-option={option.accent === "grill" || undefined}
              className="items-start gap-2.5 rounded-md py-2.5 pl-3"
            >
              <Icon
                className="mt-0.5 size-4 shrink-0 opacity-80"
                aria-hidden="true"
                focusable="false"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-medium">{option.label}</span>
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
