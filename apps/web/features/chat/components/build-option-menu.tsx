"use client";
import { ChevronUp } from "lucide-react";
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
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-50"
        >
          {selected?.label}
          <ChevronUp size={14} className="text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(320px,calc(100vw-32px))] p-1.5"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as T)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              className="items-start rounded-md py-2.5 pl-8"
            >
              <span className="grid gap-0.5">
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
