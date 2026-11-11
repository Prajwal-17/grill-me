import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";
import { Check, ChevronUp, Cpu, Sparkles } from "lucide-react";
import type { ModelSelection } from "@repo/backend/shared/contracts";
import { cn } from "@/shared/lib/cn";
import { useComposerModel } from "./use-composer-model";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const effortLabels: Record<string, string> = {
  none: "No reasoning",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Maximum",
  ultra: "Ultra",
};

type TriggerProps = {
  icon: typeof Cpu;
  value: string;
  disabled?: boolean;
  ariaLabel: string;
  openIndicator?: boolean;
} & ComponentPropsWithoutRef<"button">;

const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(function Trigger(
  {
    icon: Icon,
    value,
    disabled,
    ariaLabel,
    openIndicator,
    className,
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      disabled={disabled}
      aria-label={`${ariaLabel}: ${value}`}
      className={cn(
        "inline-flex h-9 max-w-[15rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2 text-ui font-normal hover:bg-elevated focus-visible:ring-2 focus-visible:ring-foreground data-[state=open]:bg-elevated disabled:opacity-50 sm:px-2.5",
        className,
      )}
    >
      <Icon
        className="size-3.5 shrink-0 opacity-80"
        aria-hidden="true"
        focusable="false"
      />
      <span className="min-w-0 truncate">{value}</span>
      {openIndicator && (
        <ChevronUp
          className="size-2.5 shrink-0 text-muted sm:size-3"
          aria-hidden="true"
          focusable="false"
        />
      )}
    </button>
  );
});

export function ModelPicker({
  disabled,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) {
  const state = useComposerModel();
  const [open, setOpen] = useState(false);
  if (!state.connections.length) return null;
  const reasoningOptions = [
    { id: "default", label: "Provider default" },
    ...state.reasoningEfforts.map((effort) => ({
      id: effort,
      label: effortLabels[effort] ?? effort,
    })),
  ];
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Trigger
            icon={Cpu}
            value={state.model?.name ?? "Select model"}
            disabled={disabled}
            ariaLabel="Model"
            openIndicator
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-[min(24rem,calc(100vw-32px))] p-0"
        >
          <Command>
            <CommandInput
              placeholder="Search models…"
              aria-label="Search models"
            />
            <CommandList className="max-h-72">
              <CommandEmpty>No matching models.</CommandEmpty>
              {state.connections.map((connection) => (
                <CommandGroup key={connection.id} heading={connection.name}>
                  {connection.models.map((model) => {
                    const active =
                      connection.id === state.selection?.providerId &&
                      model.id === state.selection?.model;
                    return (
                      <CommandItem
                        key={connection.id + ":" + model.id}
                        value={
                          connection.name + " " + model.name + " " + model.id
                        }
                        onSelect={() => {
                          state.setSelection({
                            providerId: connection.id,
                            model: model.id,
                            reasoningEffort: model.capabilities?.reasoning
                              ? (model.defaultReasoningEffort ?? null)
                              : undefined,
                          });
                          setOpen(false);
                        }}
                        className="items-start gap-2.5 py-2"
                      >
                        <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                          {active && <Check size={14} aria-hidden="true" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {model.name}
                          </span>
                          <span className="block truncate font-mono text-metadata text-muted">
                            {model.id}
                          </span>
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {state.model?.capabilities?.reasoning &&
        state.reasoningEfforts.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Trigger
                icon={Sparkles}
                value={
                  state.reasoning
                    ? (effortLabels[state.reasoning] ?? state.reasoning)
                    : "Provider default"
                }
                disabled={disabled}
                ariaLabel="Reasoning effort"
                openIndicator
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              collisionPadding={16}
              className="w-[min(15rem,calc(100vw-32px))] p-1.5"
            >
              {reasoningOptions.map((option) => {
                const active = (state.reasoning ?? "default") === option.id;
                return (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={() =>
                      state.setSelection({
                        providerId: state.selection!.providerId,
                        model: state.selection!.model,
                        reasoningEffort:
                          option.id === "default"
                            ? null
                            : (option.id as ModelSelection["reasoningEffort"]),
                      })
                    }
                    className="items-center gap-2.5"
                  >
                    <span className="grid size-4 shrink-0 place-items-center">
                      {active && <Check size={14} aria-hidden="true" />}
                    </span>
                    <span>{option.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
    </div>
  );
}
