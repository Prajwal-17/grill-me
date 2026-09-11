"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
export function ChoiceSelect({
  value,
  onChange,
  options,
  label,
  disabled,
  placeholder = "Not set",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { id: string; label: string }[];
  label: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select
      value={value || "__empty"}
      onValueChange={(v) => onChange(v === "__empty" ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={label}
        className={className ?? "w-full bg-surface shadow-xs"}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={5}>
        {options.map((o) => (
          <SelectItem key={o.id || "__empty"} value={o.id || "__empty"}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
