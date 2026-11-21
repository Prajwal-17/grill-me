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
  editable = false,
  commitOnChange = false,
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
  /** Editable text field that also offers the options as a dropdown. */
  editable?: boolean;
  /** Editable mode: commit typed text on every keystroke instead of on blur. */
  commitOnChange?: boolean;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [text, setText] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (!open) setText(value);
  }
  const selected = options.find((option) => option.id === value);
  const searchLabel = searchPlaceholder ?? `Search ${label.toLowerCase()}…`;

  function select(next: string) {
    onChange(next);
    setOpen(false);
    setSearch("");
    setText(next);
  }

  if (editable) {
    const needle = text.trim().toLowerCase();
    const filtered = needle
      ? options.filter(
          (option) =>
            option.id.toLowerCase().includes(needle) ||
            option.label.toLowerCase().includes(needle) ||
            (option.keywords ?? []).some((keyword) =>
              keyword.toLowerCase().includes(needle),
            ),
        )
      : options;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative w-full">
          <input
            id={triggerId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            disabled={disabled}
            value={text}
            spellCheck={false}
            maxLength={160}
            onChange={(event) => {
              setText(event.target.value);
              if (commitOnChange) onChange(event.target.value);
              setOpen(true);
            }}
            onBlur={() => {
              if (!commitOnChange && text !== value) onChange(text);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="h-11 w-full min-w-0 rounded-md border border-input bg-surface py-2 pr-9 pl-3 text-base shadow-none transition-[border-color,box-shadow] duration-150 outline-none hover:border-input-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:text-ui"
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Browse ${label.toLowerCase()}`}
              title={`Browse ${label.toLowerCase()}`}
              className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-md text-muted transition-colors hover:text-foreground focus-visible:outline-none disabled:opacity-50"
            >
              <ChevronsUpDown size={14} aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="flex max-h-(--radix-popover-content-available-height) w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden p-1"
        >
          <div className="min-h-0 overflow-y-auto">
            {filtered.length ? (
              filtered.map((option) => {
                const active = option.id === text;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(option.id)}
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-ui outline-none select-none hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
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
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-3 text-center text-metadata text-muted">
                {emptyMessage}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
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
