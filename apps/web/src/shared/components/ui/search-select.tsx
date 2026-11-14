import { useId, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";

export type SearchSelectOption = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  keywords?: string[];
};

export function SearchSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder,
  emptyMessage = "No matches.",
  disabled = false,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.id === value);
  const searchLabel = searchPlaceholder ?? `Search ${label.toLowerCase()}…`;

  function select(next: string) {
    onChange(next);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={triggerId}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className={cn(
            "flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-surface px-3 py-2 text-left text-base shadow-none transition-[border-color,box-shadow] duration-150 outline-none hover:border-input-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:text-ui",
          )}
        >
          {selected?.icon && (
            <span className="shrink-0 text-muted [&_svg]:size-4">
              {selected.icon}
            </span>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !selected && "text-muted-foreground",
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-muted"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="flex max-h-(--radix-popover-content-available-height) w-[min(92vw,26rem)] flex-col overflow-hidden p-0"
      >
        <Command className="min-h-0">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={searchLabel}
            aria-label={searchLabel}
            autoFocus
          />
          <CommandList className="min-h-0 flex-1 overscroll-contain">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const active = option.id === value;
                return (
                  <CommandItem
                    key={option.id}
                    value={option.label}
                    keywords={[
                      option.id,
                      option.description ?? "",
                      ...(option.keywords ?? []),
                    ]}
                    onSelect={() => select(option.id)}
                    className="items-start gap-2.5 py-2"
                  >
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                      {active && <Check size={14} aria-hidden="true" />}
                    </span>
                    {option.icon && (
                      <span className="mt-0.5 shrink-0 text-muted [&_svg]:size-4">
                        {option.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="block truncate text-metadata text-muted">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
