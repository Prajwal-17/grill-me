"use client";

import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { File as CodeFile } from "@pierre/diffs/react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  Braces,
  FileCode2,
  FileQuestion,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Search,
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
import { useAppStore } from "@/shared/stores/app-store";

type CustomProperties = CSSProperties & Record<`--${string}`, string | number>;

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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
  onSelect,
  expanded,
  onExpandedChange,
}: {
  attempt: PracticeSubmission;
  profileId: string;
  selectedPath: string;
  onSelect: (path: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
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
    queryFn: () => getSubmissionFile(profileId, attempt.id, selectedPath),
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
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto"
          aria-label={expanded ? "Restore file viewer" : "Expand file viewer"}
          title={expanded ? "Restore" : "Full screen"}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-canvas/35">
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

        <aside className="flex w-[230px] shrink-0 flex-col border-l border-line bg-surface sm:w-[260px]">
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
              aria-label="Search submission files"
              className="h-8 border-transparent bg-elevated/60 pr-2 pl-8 font-mono text-xs shadow-none focus-visible:border-line-strong focus-visible:ring-0 md:h-8"
            />
          </div>
          <div className="min-h-0 flex-1 p-1.5">
            <FileTree
              model={model}
              aria-label="Submission file tree"
              style={treeStyles}
            />
          </div>
        </aside>
      </div>
    </section>
  );
}

export function SubmissionFiles({
  attempt,
  profileId,
}: {
  attempt: PracticeSubmission;
  profileId: string;
}) {
  const [selectedPath, setSelectedPath] = useState(
    attempt.manifest[0]?.path ?? "",
  );
  const [expanded, setExpanded] = useState(false);
  const surface = (fullScreen: boolean) => (
    <SubmissionFilesSurface
      attempt={attempt}
      profileId={profileId}
      selectedPath={selectedPath}
      onSelect={setSelectedPath}
      expanded={fullScreen}
      onExpandedChange={setExpanded}
    />
  );

  return (
    <>
      {!expanded && (
        <aside className="h-[600px] min-h-0 w-full shrink-0 overflow-hidden border-t border-line xl:h-auto xl:w-[58%] xl:min-w-[560px] xl:max-w-[900px] xl:border-t-0 xl:border-l">
          {surface(false)}
        </aside>
      )}
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
