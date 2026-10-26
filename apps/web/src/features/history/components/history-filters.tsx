import { SearchField } from "@/shared/components/ui/search-field";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { CollectionToolbar } from "@/shared/components/layout/collection-toolbar";
import type { BuildScope } from "@/shared/types/api";

export type HistoryScope = BuildScope | "all";
export type HistorySort = "newest" | "oldest" | "title";

export function HistoryFilters({
  search,
  setSearch,
  scope,
  setScope,
  sort,
  setSort,
}: {
  search: string;
  setSearch: (value: string) => void;
  scope: HistoryScope;
  setScope: (value: HistoryScope) => void;
  sort: HistorySort;
  setSort: (value: HistorySort) => void;
}) {
  return (
    <CollectionToolbar>
      <SearchField
        aria-label="Search history"
        placeholder="Search builds…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onClear={() => setSearch("")}
        className="w-full sm:max-w-xs"
      />
      <ChoiceSelect
        label="Filter history by scope"
        value={scope}
        onChange={(value) => setScope(value as HistoryScope)}
        options={[
          { id: "all", label: "All scopes" },
          { id: "focused", label: "Focused" },
          { id: "feature", label: "Feature" },
          { id: "system", label: "System" },
        ]}
        className="flex-1 bg-surface sm:w-36 sm:flex-none"
      />
      <ChoiceSelect
        label="Sort history"
        value={sort}
        onChange={(value) => setSort(value as HistorySort)}
        options={[
          { id: "newest", label: "Newest first" },
          { id: "oldest", label: "Oldest first" },
          { id: "title", label: "Title A–Z" },
        ]}
        className="flex-1 bg-surface sm:ml-auto sm:w-36 sm:flex-none"
      />
    </CollectionToolbar>
  );
}
