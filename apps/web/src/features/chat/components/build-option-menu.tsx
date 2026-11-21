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
          aria-label={`${label}: ${selected?.label ?? value}`}
          data-grill-option={selected?.accent === "grill" || undefined}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-ui font-medium text-foreground/80 hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground data-[grill-option]:focus-visible:ring-[var(--grill-accent)] data-[state=open]:bg-elevated data-[state=open]:text-foreground disabled:opacity-50 sm:px-2.5"
        >
          {SelectedIcon && (
            <SelectedIcon
              className="size-4 shrink-0 text-muted"
              aria-hidden="true"
              focusable="false"
            />
          )}
          {selected?.label}
          <ChevronUp
            className="mr-[-3px] size-3 shrink-0 text-muted sm:size-3.5"
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
        className="w-[min(200px,calc(100vw-32px))] p-1.5"
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
              className="items-center gap-2.5 rounded-md py-2.5 pl-3"
            >
              <Icon
                className="size-4 shrink-0 opacity-80"
                aria-hidden="true"
                focusable="false"
              />
              <span className="font-medium">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
