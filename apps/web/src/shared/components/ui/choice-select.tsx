import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
export function ChoiceSelect({
  value,
  onChange,
  options,
  label,
  disabled,
  placeholder = "Not set",
  className,
  id,
  "aria-describedby": describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { id: string; label: string }[];
  label: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <Select
      value={value || "__empty"}
      onValueChange={(v) => onChange(v === "__empty" ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-describedby={describedBy}
        aria-label={label}
        className={className ?? "w-full bg-surface shadow-none"}
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
