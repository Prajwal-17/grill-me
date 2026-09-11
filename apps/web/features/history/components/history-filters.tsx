import { Search, X } from "lucide-react";
import { Input } from "../../../shared/components/ui/input";
import { ChoiceSelect } from "../../../shared/components/ui/choice-select";

export function HistoryFilters({
  search,
  setSearch,
  scope,
  setScope,
}: {
  search: string;
  setSearch: (value: string) => void;
  scope: string;
  setScope: (value: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-3 text-muted"
        />
        <Input
          aria-label="Search history"
          placeholder="Search builds…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-10 pl-9 pr-9"
        />
        {search && (
          <button
            aria-label="Clear search"
            className="absolute right-2 top-2 rounded p-1 text-muted hover:text-foreground"
            onClick={() => setSearch("")}
          >
            <X size={15} />
          </button>
        )}
      </div>
      <ChoiceSelect
        label="Filter history by scope"
        value={scope}
        onChange={setScope}
        options={[
          { id: "all", label: "All scopes" },
          { id: "focused", label: "Focused" },
          { id: "feature", label: "Feature" },
          { id: "system", label: "System" },
          { id: "legacy", label: "Older builds" },
        ]}
        className="h-10 w-full bg-surface sm:w-48"
      />
    </div>
  );
}
