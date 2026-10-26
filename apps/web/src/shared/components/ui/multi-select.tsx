import { Check, ChevronsUpDown, X } from "lucide-react";
import { useId, useState } from "react";
import { normalizeTechnology, type Option } from "@repo/preferences";
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
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";
export function MultiSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  allowCustom = false,
}: {
  label: string;
  options: readonly (Option & { id: T })[];
  value: T[];
  onChange: (value: T[]) => void;
  disabled?: boolean;
  allowCustom?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const available: (Option & { id: T })[] = [
    ...options,
    ...value
      .filter((id) => !options.some((option) => option.id === id))
      .map((id) => ({ id, label: id, group: "Custom" })),
  ];
  const selected = available.filter((o) => value.includes(o.id));
  const groups = [...new Set(available.map((o) => o.group ?? ""))];
  const custom = normalizeTechnology(search, options);
  const canAdd =
    allowCustom &&
    custom.length > 0 &&
    custom.length <= 80 &&
    value.length < 50 &&
    !available.some(
      (option) => option.id.toLowerCase() === custom.toLowerCase(),
    );
  return (
    <div className="min-w-0">
      <span id={id} className="mb-2 block text-sm font-medium">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={id}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !value.length && "text-muted")}>
              {selected.length
                ? selected.length + " selected"
                : "Select " + label.toLowerCase()}
            </span>
            <ChevronsUpDown size={14} className="text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-60 p-0"
          align="start"
          sideOffset={6}
        >
          <Command>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={"Search " + label.toLowerCase() + "…"}
              aria-label={"Search " + label.toLowerCase()}
            />
            <CommandList className="max-h-64">
              {!canAdd && <CommandEmpty>No matching options.</CommandEmpty>}
              {canAdd && (
                <CommandGroup>
                  <CommandItem
                    value={`Add ${search}`}
                    onSelect={() => {
                      onChange([...value, custom as T]);
                      setSearch("");
                    }}
                  >
                    Add “{custom}”
                  </CommandItem>
                </CommandGroup>
              )}
              {groups.map((group) => (
                <CommandGroup key={group} heading={group || undefined}>
                  {available
                    .filter((o) => (o.group ?? "") === group)
                    .map((o) => (
                      <CommandItem
                        key={o.id}
                        value={o.label}
                        keywords={[o.id, ...(o.aliases ?? []), o.group ?? ""]}
                        onSelect={() =>
                          onChange(
                            value.includes(o.id)
                              ? value.filter((v) => v !== o.id)
                              : value.length < 50
                                ? [...value, o.id]
                                : value,
                          )
                        }
                        className="gap-2.5 py-2.5"
                      >
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded border",
                            value.includes(o.id)
                              ? "border-foreground bg-foreground text-canvas"
                              : "border-line-strong",
                          )}
                        >
                          {value.includes(o.id) && (
                            <Check size={11} className="text-canvas" />
                          )}
                        </span>
                        {o.label}
                        <span className="sr-only">
                          {value.includes(o.id) ? "Selected" : "Not selected"}
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          <div className="flex items-center justify-between border-t border-line p-2">
            <span className="px-1 text-xs text-muted">
              {value.length} selected
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((o) => (
            <span
              key={o.id}
              className="inline-flex min-w-0 items-center gap-1 rounded-md bg-canvas py-0.5 pl-2 text-xs text-foreground"
            >
              <span className="truncate">{o.label}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={"Remove " + o.label}
                className="rounded-r-md p-1.5 text-muted hover:text-foreground disabled:opacity-40"
                onClick={() => onChange(value.filter((v) => v !== o.id))}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
