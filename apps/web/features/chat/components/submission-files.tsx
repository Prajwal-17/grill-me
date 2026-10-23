"use client";

import { useState, type CSSProperties, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { File as CodeFile } from "@pierre/diffs/react";
import { getFiletypeFromFileName, preloadHighlighter } from "@pierre/diffs";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  Braces,
  ChevronDown,
  FileCode2,
  FileQuestion,
  Info,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MousePointer2,
  PanelRight,
  ChevronRight,
  Search,
  SquareCode,
  SquareTerminal,
  X,
} from "lucide-react";
import type { PracticeSubmission } from "@/shared/types/api";
import { getSubmissionFile } from "@/features/chat/api/review-api";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/components/ui/context-menu";
import { useAppStore } from "@/shared/stores/app-store";
import { cn } from "@/shared/lib/cn";
import { Sheet, SheetContent, SheetTitle } from "@/shared/components/ui/sheet";
import { useWideWorkspace } from "../hooks/use-wide-workspace";

type CustomProperties = CSSProperties & Record<`--${string}`, string | number>;

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function editorUrl(protocol: "cursor" | "vscode" | "zed", path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${protocol}://file${encodedPath}`;
}

function fileName(path: string) {
  return path.split("/").at(-1) ?? path;
}

function FileTabs({
  paths,
  selectedPath,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
}: {
  paths: string[];
  selectedPath: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseRight: (path: string) => void;
  onCloseAll: () => void;
}) {
  if (!paths.length) return null;

  return (
    <div
      role="tablist"
      aria-label="Open submission files"
      className="flex h-9 shrink-0 overflow-x-auto border-b border-line bg-surface"
    >
      {paths.map((path, index) => {
        const active = path === selectedPath;
        return (
          <ContextMenu key={path}>
            <ContextMenuTrigger asChild>
              <div
                role="tab"
                tabIndex={active ? 0 : -1}
                aria-selected={active}
                title={path}
                onClick={() => onSelect(path)}
                onAuxClick={(event) => {
                  if (event.button === 1) onClose(path);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(path);
                  }
                }}
                className={cn(
                  "group relative flex h-full max-w-48 shrink-0 cursor-default items-center gap-1.5 border-r border-line px-3 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                  active
                    ? "bg-canvas/50 text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[var(--grill-accent)]"
                    : "text-muted hover:bg-elevated/50 hover:text-foreground",
                )}
              >
                <FileCode2 size={12} className="shrink-0" />
                <span className="truncate">{fileName(path)}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Close ${fileName(path)}`}
                  className={cn(
                    "ml-1 rounded-sm p-0.5 hover:bg-elevated hover:text-foreground",
                    active
                      ? "text-muted"
                      : "text-transparent group-hover:text-muted",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(path);
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onClose(path)}>
                Close
              </ContextMenuItem>
              <ContextMenuItem
                disabled={paths.length === 1}
                onSelect={() => onCloseOthers(path)}
              >
                Close others
              </ContextMenuItem>
              <ContextMenuItem
                disabled={index === paths.length - 1}
                onSelect={() => onCloseRight(path)}
              >
                Close to the right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={onCloseAll}>Close all</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}

function SourcePath({ path }: { path: string }) {
  const segments = path.split("/");
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden font-mono text-[11px]">
      {segments.map((segment, index) => (
        <span key={segments.slice(0, index + 1).join("/")} className="contents">
          {index > 0 && <span className="text-muted/60">/</span>}
          <span
            className={
              index === segments.length - 1
                ? "truncate text-foreground"
                : "shrink-0 text-muted"
            }
          >
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}

function FileUnavailable({
  binary,
  tooLarge,
}: {
  binary: boolean;
  tooLarge: boolean;
}) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center">
      <FileQuestion size={22} className="text-muted" />
      <p className="mt-3 text-sm font-medium">
        {tooLarge ? "File is too large to preview" : "Preview unavailable"}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
        {tooLarge
          ? "Files over 2 MB stay in the submission but are not rendered here."
          : binary
            ? "This binary file is included in the submission."
            : "This file could not be displayed."}
      </p>
    </div>
  );
}

function SubmissionFilesSurface({
  attempt,
  profileId,
  selectedPath,
  openPaths,
  onSelect,
  onCloseFile,
  onCloseOtherFiles,
  onCloseFilesToRight,
  onCloseAllFiles,
  expanded,
  onExpandedChange,
  treeOpen,
  onTreeOpenChange,
  projectPath,
  submissionCount,
  onClose,
}: {
  attempt: PracticeSubmission;
  profileId: string;
  selectedPath: string;
  openPaths: string[];
  onSelect: (path: string) => void;
  onCloseFile: (path: string) => void;
  onCloseOtherFiles: (path: string) => void;
  onCloseFilesToRight: (path: string) => void;
  onCloseAllFiles: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  treeOpen: boolean;
  onTreeOpenChange: (open: boolean) => void;
  projectPath: string | null;
  submissionCount: number;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const theme = useAppStore((state) => state.theme);
  const paths = attempt.manifest.map((file) => file.path);
  const { model } = useFileTree({
    paths,
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: 2,
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    icons: { set: "complete", colored: true },
    fileTreeSearchMode: "hide-non-matches",
    onSearchChange: (value) => setSearch(value ?? ""),
    onSelectionChange: (selection) => {
      const path = selection.at(-1);
      if (path && attempt.manifest.some((file) => file.path === path))
        onSelect(path);
    },
  });
  const selectedFile = attempt.manifest.find(
    (file) => file.path === selectedPath,
  );
  const file = useQuery({
    queryKey: ["submission-file", profileId, attempt.id, selectedPath],
    queryFn: async () => {
      const source = await getSubmissionFile(
        profileId,
        attempt.id,
        selectedPath,
      );
      // Initialize before mounting: a cold highlighter can leave the custom
      // element empty until the viewer is remounted.
      if (source.content != null) {
        await preloadHighlighter({
          themes: ["github-dark", "github-light"],
          langs: [getFiletypeFromFileName(source.path)],
        });
      }
      return source;
    },
    enabled: Boolean(selectedPath),
    staleTime: Infinity,
  });
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
    "--trees-font-size-override": "12px",
    "--trees-border-radius-override": "5px",
    "--trees-focus-ring-width-override": "1px",
  };
  const codeStyles: CustomProperties = {
    display: "block",
    minHeight: "100%",
    "--diffs-font-family": "var(--font-plex-mono)",
    "--diffs-font-size": "12px",
    "--diffs-line-height": "20px",
    "--diffs-gap-inline": "10px",
  };

  return (
    <section
      aria-label="Submission files"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-surface"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <FileCode2 size={15} className="text-muted" />
        {expanded ? (
          <DialogTitle className="text-sm leading-none font-semibold">
            Submission files
          </DialogTitle>
        ) : (
          <h2 className="text-sm font-semibold">Submission files</h2>
        )}
        <span className="text-xs tabular-nums text-muted">
          {attempt.manifest.length}
        </span>
        {submissionCount > 1 && (
          <span
            className="hidden min-w-0 items-center gap-1 truncate border-l border-line pl-2 text-[11px] text-muted sm:flex"
            title="The file viewer shows the complete saved snapshot for the selected submission."
          >
            <Info size={12} />
            Submission {attempt.sequence} · full snapshot
          </span>
        )}
        {projectPath && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-8 gap-1.5 px-2.5"
                title={`Open ${projectPath}`}
              >
                <SquareCode size={14} />
                Open
                <ChevronDown size={12} className="text-muted" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <a href={editorUrl("cursor", projectPath)}>
                  <MousePointer2 />
                  Cursor
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={editorUrl("vscode", projectPath)}>
                  <SquareCode />
                  VS Code
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={editorUrl("zed", projectPath)}>
                  <SquareTerminal />
                  Zed
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          className={projectPath ? undefined : "ml-auto"}
          aria-label={treeOpen ? "Hide file tree" : "Show file tree"}
          aria-pressed={treeOpen}
          title={treeOpen ? "Hide file tree" : "Show file tree"}
          onClick={() => onTreeOpenChange(!treeOpen)}
        >
          <PanelRight size={14} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={expanded ? "Restore file viewer" : "Expand file viewer"}
          title={expanded ? "Restore" : "Full screen"}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </Button>
        {!expanded && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Collapse submission files"
            title="Collapse files"
            onClick={onClose}
          >
            <ChevronRight size={15} />
          </Button>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-canvas/35">
          <FileTabs
            paths={openPaths}
            selectedPath={selectedPath}
            onSelect={(path) => {
              model.focusPath(path);
              model.scrollToPath(path);
              onSelect(path);
            }}
            onClose={onCloseFile}
            onCloseOthers={onCloseOtherFiles}
            onCloseRight={onCloseFilesToRight}
            onCloseAll={onCloseAllFiles}
          />
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-3">
            {selectedPath ? (
              <SourcePath path={selectedPath} />
            ) : (
              <span className="text-xs text-muted">Select a file</span>
            )}
            {selectedFile && (
              <span className="shrink-0 font-mono text-[10px] text-muted">
                {formatBytes(selectedFile.bytes)}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {file.isLoading ? (
              <div
                role="status"
                className="flex h-full min-h-56 items-center justify-center gap-2 text-xs text-muted"
              >
                <LoaderCircle size={14} className="animate-spin" />
                Loading file…
              </div>
            ) : file.error ? (
              <div
                role="alert"
                className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center"
              >
                <FileQuestion size={22} className="text-destructive" />
                <p className="mt-3 text-sm font-medium">
                  Could not load this file
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => file.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : file.data?.content != null ? (
              <CodeFile
                key={file.data.path}
                file={{
                  name: file.data.path,
                  contents: file.data.content,
                  cacheKey: attempt.id + ":" + file.data.path,
                }}
                options={{
                  disableFileHeader: true,
                  overflow: "scroll",
                  theme: {
                    dark: "github-dark",
                    light: "github-light",
                  },
                  themeType: theme,
                }}
                style={codeStyles}
              />
            ) : file.data ? (
              <FileUnavailable
                binary={file.data.binary}
                tooLarge={file.data.tooLarge}
              />
            ) : (
              <div className="flex h-full min-h-56 flex-col items-center justify-center text-muted">
                <Braces size={20} />
                <p className="mt-2 text-xs">Select a file to preview</p>
              </div>
            )}
          </div>
        </div>

        {treeOpen && (
          <aside className="absolute inset-0 z-10 flex shrink-0 flex-col border-l border-line bg-surface sm:static sm:w-[260px]">
            <div className="relative shrink-0 border-b border-line p-2">
              <Search
                aria-hidden="true"
                size={13}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
              />
              <Input
                value={search}
                onChange={(event) =>
                  model.setSearch(event.target.value || null)
                }
                placeholder="Search files"
                aria-label="Search submission files"
                className="h-8 border-transparent bg-elevated/60 pr-2 pl-8 font-mono text-xs shadow-none focus-visible:border-line-strong focus-visible:ring-0 md:h-8"
              />
            </div>
            <div className="min-h-0 flex-1 p-1.5">
              <FileTree
                model={model}
                aria-label="Submission file tree"
                style={treeStyles}
                onClick={(event) => {
                  // Reopening the selected file does not emit a selection
                  // change, so handle row activation as well.
                  const rowClicked = event.nativeEvent
                    .composedPath()
                    .some(
                      (target) =>
                        target instanceof Element &&
                        target.getAttribute("role") === "treeitem",
                    );
                  const path = model.getSelectedPaths().at(-1);
                  if (
                    rowClicked &&
                    path &&
                    attempt.manifest.some((file) => file.path === path)
                  )
                    onSelect(path);
                }}
                onKeyDown={(event) => {
                  const path = model.getSelectedPaths().at(-1);
                  if (
                    event.key === "Enter" &&
                    path &&
                    attempt.manifest.some((file) => file.path === path)
                  )
                    onSelect(path);
                }}
              />
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

export function SubmissionFiles({
  attempt,
  profileId,
  projectPath,
  submissionCount,
  onClose,
  returnFocusRef,
}: {
  attempt: PracticeSubmission;
  profileId: string;
  projectPath: string | null;
  submissionCount: number;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const wide = useWideWorkspace();
  const [selectedPath, setSelectedPath] = useState(
    attempt.manifest[0]?.path ?? "",
  );
  const [openPaths, setOpenPaths] = useState<string[]>(
    attempt.manifest[0]?.path ? [attempt.manifest[0].path] : [],
  );
  const [expanded, setExpanded] = useState(false);
  const [treePreference, setTreePreference] = useState<boolean | null>(null);
  const treeOpen = treePreference ?? wide;
  const openFile = (path: string) => {
    setOpenPaths((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setSelectedPath(path);
    if (!wide) setTreePreference(false);
  };
  const closeFile = (path: string) => {
    const index = openPaths.indexOf(path);
    const remaining = openPaths.filter((item) => item !== path);
    setOpenPaths(remaining);
    if (selectedPath === path)
      setSelectedPath(remaining[Math.min(index, remaining.length - 1)] ?? "");
  };
  const closeOtherFiles = (path: string) => {
    setOpenPaths([path]);
    setSelectedPath(path);
  };
  const closeFilesToRight = (path: string) => {
    const index = openPaths.indexOf(path);
    const remaining = openPaths.slice(0, index + 1);
    setOpenPaths(remaining);
    if (!remaining.includes(selectedPath)) setSelectedPath(path);
  };
  const closeAllFiles = () => {
    setOpenPaths([]);
    setSelectedPath("");
  };
  const surface = (fullScreen: boolean) => (
    <SubmissionFilesSurface
      attempt={attempt}
      profileId={profileId}
      selectedPath={selectedPath}
      openPaths={openPaths}
      onSelect={openFile}
      onCloseFile={closeFile}
      onCloseOtherFiles={closeOtherFiles}
      onCloseFilesToRight={closeFilesToRight}
      onCloseAllFiles={closeAllFiles}
      expanded={fullScreen}
      onExpandedChange={setExpanded}
      treeOpen={treeOpen}
      onTreeOpenChange={setTreePreference}
      projectPath={projectPath}
      submissionCount={submissionCount}
      onClose={onClose}
    />
  );

  return (
    <>
      {!expanded && wide && (
        <aside
          className="min-h-0 w-[58%] min-w-[560px] max-w-[920px] shrink-0 overflow-hidden border-l border-line"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
        >
          {surface(false)}
        </aside>
      )}
      <Sheet
        open={!expanded && !wide}
        onOpenChange={(open) => !open && onClose()}
      >
        <SheetContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="w-full gap-0 p-0 sm:max-w-[760px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!expanded) returnFocusRef.current?.focus();
          }}
        >
          <SheetTitle className="sr-only">Submission files</SheetTitle>
          {surface(false)}
        </SheetContent>
      </Sheet>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="inset-0 top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-surface p-0 shadow-none duration-150 sm:max-w-none"
        >
          {surface(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}
