import type { ComponentProps } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { cn } from "@/shared/lib/cn";

export function SearchField({
  className,
  onClear,
  ...props
}: ComponentProps<typeof Input> & { onClear?: () => void }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <Input
        type="search"
        {...props}
        className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {onClear && props.value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          onClick={onClear}
          className="absolute right-0.5 top-1/2 -translate-y-1/2"
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
