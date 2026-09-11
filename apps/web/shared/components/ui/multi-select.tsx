"use client";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Option } from "@repo/preferences";
export function MultiSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (Option & { id: T })[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (details.current && !details.current.contains(event.target as Node))
        details.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const filtered = options.filter((option) =>
    [option.label, option.group, ...(option.aliases ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const groups = [...new Set(filtered.map((option) => option.group ?? ""))];
  const selected = options.filter((option) => value.includes(option.id));
  return (
    <div className="min-w-0">
      <span id={id} className="mb-2 block text-sm font-medium">
        {label}
      </span>
      <details
        ref={details}
        className="relative"
        onToggle={() => {
          if (details.current?.open) search.current?.focus();
          else setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            if (details.current) {
              details.current.open = false;
              details.current.querySelector("summary")?.focus();
            }
          }
        }}
      >
        <summary
          aria-labelledby={id}
          className="field flex list-none items-center justify-between gap-2 font-normal marker:hidden [&::-webkit-details-marker]:hidden"
        >
          <span className={selected.length ? "truncate" : "text-muted"}>
            {selected.length ? selected.length + " selected" : "Select…"}
          </span>
          <ChevronDown size={14} className="shrink-0 text-muted" />
        </summary>
        <div className="absolute top-full z-30 mt-1 w-full min-w-56 overflow-hidden rounded-md border border-line-strong bg-surface shadow-md">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={15} className="text-muted" />
            <input
              ref={search}
              aria-label={"Search " + label.toLowerCase()}
              className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
              placeholder="Search…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {groups.map((group) => (
              <fieldset key={group} className="mb-1">
                {group && (
                  <legend className="px-2 py-2 text-xs text-muted">
                    {group}
                  </legend>
                )}
                {filtered
                  .filter((option) => (option.group ?? "") === group)
                  .map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-elevated"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={value.includes(option.id)}
                        onChange={() =>
                          onChange(
                            value.includes(option.id)
                              ? value.filter((item) => item !== option.id)
                              : [...value, option.id],
                          )
                        }
                      />
                      {option.label}
                    </label>
                  ))}
              </fieldset>
            ))}
            {!filtered.length && (
              <p className="px-2 py-3 text-sm text-muted">
                No matching options
              </p>
            )}
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 border-t border-line p-2.5 text-xs hover:bg-elevated"
            onClick={() => {
              if (details.current) {
                details.current.open = false;
                details.current.querySelector("summary")?.focus();
              }
            }}
          >
            <Check size={13} />
            Done
          </button>
        </div>
      </details>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <span
              key={option.id}
              className="inline-flex max-w-full items-center gap-1 rounded border border-line bg-surface py-0.5 pl-2 pr-1 text-xs"
            >
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                aria-label={"Remove " + option.label}
                className="rounded p-1 text-muted hover:bg-elevated hover:text-foreground"
                onClick={() =>
                  onChange(value.filter((item) => item !== option.id))
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
