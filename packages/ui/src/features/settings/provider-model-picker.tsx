import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ProviderModel } from "@repo/contracts";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/cn";

type ModelGroup = {
  id: string;
  name: string;
  models: ProviderModel[];
};

/**
 * OpenCode exposes models from several upstream accounts (`anthropic/...`,
 * `openai/...`). Keep those catalogs together so a long list stays readable,
 * the same way T3 Code groups models by provider.
 */
export function groupProviderModels(models: ProviderModel[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const model of models) {
    const id = model.providerId || "__models";
    const group = groups.get(id) ?? {
      id,
      name: model.providerName || model.providerId || "",
      models: [],
    };
    group.models.push(model);
    groups.set(id, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      models: [...group.models].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (!a.name) return 1;
      if (!b.name) return -1;
      return a.name.localeCompare(b.name);
    });
}

export function ProviderModelPicker({
  providerName,
  value,
  models,
  disabled,
  onChange,
}: {
  providerName: string;
  value: string;
  models: ProviderModel[];
  disabled: boolean;
  onChange: (model: string) => void;
}) {
  const groups = useMemo(() => groupProviderModels(models), [models]);
  const [open, setOpen] = useState(false);
  const choose = (model: string) => {
    onChange(model);
    setOpen(false);
  };
  const selected =
    value === "auto" ? models[0] : models.find((model) => model.id === value);
  const unavailable = value !== "auto" && models.length > 0 && !selected;
  const label =
    value === "auto" ? "Provider default" : (selected?.name ?? value);
  const providerLabel =
    value === "auto" ? "Default" : (selected?.providerName ?? null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={`Model for ${providerName}`}
          aria-invalid={unavailable || undefined}
          disabled={disabled}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 py-2 text-left text-base shadow-none transition-[border-color,box-shadow] duration-150 outline-none hover:border-input-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:text-ui",
            unavailable && "border-destructive/60",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {providerLabel && (
            <span className="max-w-28 shrink-0 truncate text-metadata text-muted">
              {providerLabel}
            </span>
          )}
          <ChevronsUpDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-muted"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,26rem)] p-0">
        <Command>
          <CommandInput placeholder="Search models…" autoFocus />
          <CommandList className="max-h-80">
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup heading="Default">
              <CommandItem
                value="auto provider default first available"
                onSelect={() => choose("auto")}
              >
                <Check
                  size={14}
                  className={cn(value !== "auto" && "opacity-0")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block">Provider default</span>
                  <span className="block text-metadata text-muted">
                    {models[0]
                      ? `First available · ${models[0].name}`
                      : "Uses the first available model"}
                  </span>
                </span>
              </CommandItem>
            </CommandGroup>
            {unavailable && (
              <CommandGroup heading="Saved">
                <CommandItem
                  value={`${value} saved unavailable`}
                  onSelect={() => choose(value)}
                >
                  <Check size={14} />
                  <span className="min-w-0 flex-1 truncate">
                    {value} (unavailable)
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((group) => (
              <CommandGroup
                key={group.id}
                heading={group.name || undefined}
                className="[&_[cmdk-group-heading]]:capitalize"
              >
                {group.models.map((model) => {
                  const isSelected = value === model.id;
                  return (
                    <CommandItem
                      key={model.id}
                      value={`${group.name} ${model.name} ${model.id}`}
                      onSelect={() => choose(model.id)}
                    >
                      <Check
                        size={14}
                        className={cn(!isSelected && "opacity-0")}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {model.name}
                      </span>
                      {group.name && (
                        <span className="shrink-0 text-metadata text-muted">
                          {group.name}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
          <p className="border-t border-line px-3 py-2 text-metadata text-muted">
            {models.length} {models.length === 1 ? "model" : "models"}
            {groups.length > 1 ? ` across ${groups.length} providers` : ""}
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
