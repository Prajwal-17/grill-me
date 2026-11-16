import { useRef, useState, type CSSProperties, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { File as CodeFile } from "@pierre/diffs/react";
import { getFiletypeFromFileName, preloadHighlighter } from "@pierre/diffs";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  FileCode2,
  FileQuestion,
  FolderOpen,
  LoaderCircle,
  Lock,
  Maximize2,
  Minimize2,
  PanelRight,
  Search,
  X,
} from "lucide-react";
import type { ProjectFileContent, ProjectFilesView } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { Input } from "@/shared/components/ui/input";
import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";
import { useAppStore } from "@/shared/stores/app-store";
import { cn } from "@/shared/lib/cn";
import {
  challengeKeys,
  getProjectFile,
  getProjectFiles,
} from "@/features/challenges/api/challenge-api";

type CustomProperties = CSSProperties & Record<`--${string}`, string | number>;

const treeStyles: CustomProperties = {
  height: "100%",
  width: "100%",
  "--trees-bg-override": "var(--surface)",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted)",
  "--trees-border-color-override": "transparent",
  "--trees-selected-bg-override": "var(--elevated)",
  "--trees-selected-focused-border-color-override": "var(--line-strong)",
  "--trees-font-family-override": "var(--font-plex-mono)",
  "--trees-font-size-override": "0.8125rem",
  "--trees-border-radius-override": "5px",
  "--trees-focus-ring-width-override": "1px",
  "--trees-scrollbar-gutter-override": "0px",
};

// The tree renders in a shadow root, so its scrollbar chrome cannot be reached
// from the app stylesheet.
const treeUnsafeCSS = `
  [data-file-tree-virtualized-scroll="true"] {
    scrollbar-width: none;
    scrollbar-gutter: auto;
  }
  [data-file-tree-virtualized-scroll="true"]::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
`;

// The code surface owns its horizontal scroller inside the same shadow root.
const codeUnsafeCSS = `
  [data-code] {
    scrollbar-width: none;
    scrollbar-gutter: auto;
  }
  [data-code]::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
`;

const codeStyles: CustomProperties = {
  display: "block",
  minHeight: "100%",
  "--diffs-font-family": "var(--font-plex-mono)",
  "--diffs-font-size": "0.8125rem",
  "--diffs-line-height": "1.375rem",
  "--diffs-gap-inline": "10px",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileUnavailable({ file }: { file: ProjectFileContent }) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center">
      <FileQuestion size={22} className="text-muted" aria-hidden="true" />
      <p className="mt-3 text-ui font-medium">
        {file.tooLarge ? "File is too large to preview" : "Preview unavailable"}
      </p>
      <p className="mt-1 max-w-xs text-metadata leading-5 text-muted">
        {file.tooLarge
          ? "Files over 2 MB are not rendered in the viewer."
          : "This binary file cannot be shown as text."}
      </p>
    </div>
  );
}

function ProjectFilesBrowser({
  profileId,
  challengeId,
  data,
  treeOpen,
  onTreeOpenChange,
  closeTreeOnSelect,
  expanded,
}: {
  profileId: string;
  challengeId: string;
  data: ProjectFilesView;
  treeOpen: boolean;
  onTreeOpenChange: (open: boolean) => void;
  closeTreeOnSelect: boolean;
  expanded: boolean;
}) {
  const [selectedPath, setSelectedPath] = useState(data.files[0]?.path ?? "");
  const [search, setSearch] = useState("");
  const codePane = useRef<HTMLDivElement>(null);
  const theme = useAppStore((state) => state.theme);
  const selected =
    data.files.find((file) => file.path === selectedPath)?.path ??
    data.files[0]?.path ??
    "";
  const { model } = useFileTree({
    paths: data.files.map((file) => file.path),
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: 1,
    initialSelectedPaths: selected ? [selected] : [],
    icons: { set: "complete", colored: true },
    fileTreeSearchMode: "hide-non-matches",
    unsafeCSS: treeUnsafeCSS,
    onSearchChange: (value) => setSearch(value ?? ""),
    onSelectionChange: (selection) => {
      const path = selection.at(-1);
      if (path && data.files.some((file) => file.path === path)) {
        setSelectedPath(path);
        if (closeTreeOnSelect) onTreeOpenChange(false);
      }
    },
  });
  const file = useQuery({
    queryKey: challengeKeys.projectFile(profileId, challengeId, selected),
    queryFn: async () => {
      const source = await getProjectFile(profileId, challengeId, selected);
      // Initialize before mounting: a cold highlighter can leave the custom
      // element empty until the viewer remounts.
      if (source.content != null) {
        await preloadHighlighter({
          themes: ["github-dark", "github-light"],
          langs: [getFiletypeFromFileName(source.path)],
        });
      }
      return source;
    },
    enabled: Boolean(selected),
    staleTime: Infinity,
  });
  const selectedFile = data.files.find((file) => file.path === selected);
  const select = (path: string) => {
    model.focusPath(path);
    model.scrollToPath(path);
    setSelectedPath(path);
    if (closeTreeOnSelect) onTreeOpenChange(false);
  };

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-canvas/35">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-3">
          {selected ? (
            <p
              className="min-w-0 truncate font-mono text-metadata"
              title={selected}
              aria-label={`File path: ${selected}`}
            >
              {selected.split("/").map((segment, index, segments) => (
                <span key={`${index}-${segment}`}>
                  {index > 0 && (
                    <span aria-hidden="true" className="px-0.5 text-dim">
                      /
                    </span>
                  )}
                  <span
                    className={
                      index === segments.length - 1
                        ? "text-foreground"
                        : "text-muted"
                    }
                  >
                    {segment}
                  </span>
                </span>
              ))}
            </p>
          ) : (
            <span className="text-metadata text-muted">Select a file</span>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            {selectedFile && (
              <span className="font-mono text-metadata text-muted tabular-nums">
                {formatBytes(selectedFile.bytes)}
              </span>
            )}
            {file.data?.content != null && (
              <CopyButton
                text={file.data.content}
                label="Copy"
                ariaLabel="Copy file contents"
              />
            )}
          </div>
        </div>
        <div
          ref={codePane}
          tabIndex={0}
          role="region"
          aria-label={selected ? `File contents: ${selected}` : "File contents"}
          className="scrollbar-quiet min-h-0 flex-1 overflow-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            const scroller = codePane.current
              ?.querySelector("diffs-container")
              ?.shadowRoot?.querySelector<HTMLElement>("[data-code]");
            if (!scroller || scroller.scrollWidth <= scroller.clientWidth)
              return;
            event.preventDefault();
            scroller.scrollBy({
              left:
                (event.key === "ArrowRight" ? 1 : -1) *
                Math.max(48, scroller.clientWidth * 0.2),
              behavior: "smooth",
            });
          }}
        >
          {!selected ? (
            <div className="flex h-full min-h-56 flex-col items-center justify-center text-muted">
              <FileCode2 size={20} aria-hidden="true" />
              <p className="mt-2 text-metadata">Select a file to preview</p>
            </div>
          ) : file.isPending ? (
            <LoadingRegion
              label="Loading project file"
              layout="code"
              className="min-h-56 space-y-3 p-4"
            >
              {[80, 60, 90, 45, 70, 55, 85, 35].map((width, index) => (
                <div key={index} className="flex gap-4">
                  <Skeleton className="h-3 w-4 shrink-0" />
                  <Skeleton className="h-3" style={{ width: `${width}%` }} />
                </div>
              ))}
            </LoadingRegion>
          ) : file.error ? (
            <div
              role="alert"
              className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center"
            >
              <FileQuestion
                size={22}
                className="text-destructive"
                aria-hidden="true"
              />
              <p className="mt-3 text-ui font-medium">
                Could not load this file
              </p>
              <p className="mt-1 max-w-sm break-words text-metadata text-muted">
                {file.error.message}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                disabled={file.isFetching}
                onClick={() => void file.refetch()}
              >
                {file.isFetching && (
                  <LoaderCircle
                    size={13}
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                Retry
              </Button>
            </div>
          ) : file.data?.content != null ? (
            <CodeFile
              key={file.data.path}
              file={{
                name: file.data.path,
                contents: file.data.content,
                cacheKey: `${challengeId}:${file.data.path}`,
              }}
              options={{
                disableFileHeader: true,
                overflow: "scroll",
                theme: { dark: "github-dark", light: "github-light" },
                themeType: theme,
                unsafeCSS: codeUnsafeCSS,
              }}
              style={codeStyles}
            />
          ) : file.data ? (
            <FileUnavailable file={file.data} />
          ) : null}
        </div>
      </div>

      <aside
        id="project-file-tree"
        className={cn(
          "absolute inset-0 z-10 flex shrink-0 flex-col border-l border-line bg-surface sm:static",
          expanded ? "sm:w-[260px]" : "sm:w-[220px]",
          treeOpen ? "" : "hidden",
        )}
        aria-label="Project file tree"
      >
        <div className="relative shrink-0 border-b border-line p-2">
          <Search
            aria-hidden="true"
            size={13}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
          />
          <Input
            value={search}
            onChange={(event) => model.setSearch(event.target.value || null)}
            placeholder="Search files"
            aria-label="Search project files"
            className="h-8 border-transparent bg-elevated/60 pr-2 pl-8 font-mono text-metadata shadow-none focus-visible:border-line-strong focus-visible:ring-0 md:h-8"
          />
        </div>
        <div className="min-h-0 flex-1 p-1.5">
          <FileTree
            model={model}
            aria-label="Project file tree"
            style={treeStyles}
            onClick={(event) => {
              // Reopening the selected file does not emit a selection change,
              // so handle row activation as well.
              const rowClicked = event.nativeEvent
                .composedPath()
                .some(
                  (target) =>
                    target instanceof Element &&
                    target.getAttribute("role") === "treeitem",
                );
              const path = model.getSelectedPaths().at(-1);
              if (path && rowClicked) select(path);
            }}
            onKeyDown={(event) => {
              const path = model.getSelectedPaths().at(-1);
              if (event.key === "Enter" && path) select(path);
            }}
          />
        </div>
      </aside>
    </div>
  );
}

export function ProjectFilesPanel({
  profileId,
  challengeId,
  onClose,
  defaultTreeOpen = true,
  expanded,
  onToggleExpanded,
  expandButtonRef,
}: {
  profileId: string;
  challengeId: string;
  onClose: () => void;
  defaultTreeOpen?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  expandButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const [treeOpen, setTreeOpen] = useState(defaultTreeOpen);
  const files = useQuery({
    queryKey: challengeKeys.projectFiles(profileId, challengeId),
    queryFn: () => getProjectFiles(profileId, challengeId),
    staleTime: 5_000,
  });
  return (
    <section
      aria-label={expanded ? "Project files, expanded" : "Project files"}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-surface"
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          onToggleExpanded();
        }
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <FileCode2 size={15} className="text-muted" aria-hidden="true" />
        <h2 className="text-ui font-semibold">Files</h2>
        {files.data && (
          <span className="text-metadata tabular-nums text-muted">
            {files.data.files.length}
            {files.data.truncated ? "+" : ""}
          </span>
        )}
        <span
          className="flex items-center gap-1 text-metadata text-muted"
          title="Read-only project files"
        >
          <Lock size={12} aria-hidden="true" />
          <span className="hidden sm:inline">Read-only</span>
          <span className="sr-only sm:hidden">Read-only</span>
        </span>
        {files.data && (
          <span
            className="hidden min-w-0 truncate border-l border-line pl-2 font-mono text-metadata text-muted lg:inline"
            title={files.data.projectDirectory}
          >
            {files.data.projectDirectory}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {Boolean(files.data?.files.length) && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={treeOpen ? "Hide file tree" : "Show file tree"}
              aria-pressed={treeOpen}
              aria-controls="project-file-tree"
              title={treeOpen ? "Hide file tree" : "Show file tree"}
              onClick={() => setTreeOpen((open) => !open)}
            >
              <PanelRight size={14} />
            </Button>
          )}
          <Button
            ref={expandButtonRef}
            size="icon-sm"
            variant="ghost"
            aria-label={
              expanded ? "Restore files panel" : "Expand files to full window"
            }
            aria-pressed={expanded}
            title={
              expanded
                ? "Restore files panel (Esc)"
                : "Expand files to full window"
            }
            onClick={onToggleExpanded}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close files"
            title="Close files"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
      </header>
      {files.isPending ? (
        <LoadingRegion
          label="Loading project files"
          className="flex min-h-0 flex-1 flex-col gap-3 p-4"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-48" />
        </LoadingRegion>
      ) : files.error ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <FileQuestion size={22} className="text-muted" aria-hidden="true" />
          <p role="alert" className="mt-3 text-ui font-medium">
            Project files unavailable
          </p>
          <p className="mt-1 max-w-sm break-words text-metadata text-muted">
            {files.error.message}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            disabled={files.isFetching}
            onClick={() => void files.refetch()}
          >
            {files.isFetching && (
              <LoaderCircle
                size={13}
                className="animate-spin motion-reduce:animate-none"
              />
            )}
            Retry
          </Button>
        </div>
      ) : !files.data?.files.length ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <FolderOpen size={22} className="text-muted" aria-hidden="true" />
          <p className="mt-3 text-ui font-medium">No project files yet</p>
          <p className="mt-1 max-w-sm text-metadata leading-5 text-muted">
            Prepare the project from Activity, then open Files again to browse
            its source.
          </p>
        </div>
      ) : (
        <ProjectFilesBrowser
          profileId={profileId}
          challengeId={challengeId}
          data={files.data}
          treeOpen={treeOpen}
          onTreeOpenChange={setTreeOpen}
          closeTreeOnSelect={!defaultTreeOpen}
          expanded={expanded}
        />
      )}
    </section>
  );
}
