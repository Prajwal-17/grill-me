import { Search, X } from "lucide-react";
import { Input } from "../../../shared/components/ui/input";
import { ChoiceSelect } from "../../../shared/components/ui/choice-select";
export function HistoryFilters({
  search,
  setSearch,
  format,
  setFormat,
}: {
  search: string;
  setSearch: (value: string) => void;
  format: string;
  setFormat: (value: string) => void;
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
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
        label="Filter history by format"
        value={format}
        onChange={setFormat}
        options={[
          { id: "all", label: "All formats" },
          { id: "exercise", label: "Coding exercise" },
          { id: "question", label: "Tricky question" },
          { id: "architecture", label: "Architecture" },
          { id: "mini-project", label: "Mini-project" },
        ]}
        className="h-10 w-full bg-surface sm:w-48"
      />
    </div>
  );
}
