"use client";

import {
  ArrowRight,
  AlertTriangle,
  Braces,
  Check,
  ChevronsUpDown,
  Database,
  File,
  FileArchive,
  FileCode2,
  FileCog,
  FileImage,
  FileJson2,
  FileText,
  Files,
  Folder,
  LoaderCircle,
  Palette,
  Paperclip,
  UploadCloud,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { ConnectedProject } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/cn";

type UploadedFile = { id: string; filename: string };

const fileKinds: {
  extensions: string[];
  icon: LucideIcon;
  className: string;
}[] = [
  {
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"],
    icon: FileImage,
    className: "text-purple-500",
  },
  {
    extensions: ["json", "jsonc"],
    icon: FileJson2,
    className: "text-amber-500",
  },
  {
    extensions: ["sql", "db", "sqlite", "prisma"],
    icon: Database,
    className: "text-sky-500",
  },
  {
    extensions: ["css", "scss", "sass", "less"],
    icon: Palette,
    className: "text-pink-500",
  },
  {
    extensions: ["md", "mdx", "txt", "rst"],
    icon: FileText,
    className: "text-muted",
  },
  {
    extensions: ["zip", "gz", "tar", "7z"],
    icon: FileArchive,
    className: "text-orange-500",
  },
  {
    extensions: ["yaml", "yml", "toml", "ini", "env", "lock"],
    icon: FileCog,
    className: "text-muted",
  },
  {
    extensions: [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "kt",
      "c",
      "cpp",
      "h",
      "html",
      "vue",
      "svelte",
      "sh",
    ],
    icon: FileCode2,
    className: "text-[var(--grill-accent)]",
  },
];

function FileTypeIcon({ filename }: { filename: string }) {
  const extension = (filename.split(".").pop() ?? "").toLowerCase();
  const kind = fileKinds.find((item) => item.extensions.includes(extension));
  const Icon = kind?.icon ?? File;
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-elevated/70"
      title={extension ? extension.toUpperCase() + " file" : "File"}
    >
      <Icon size={16} className={kind?.className ?? "text-muted"} />
    </span>
  );
}

export function SubmissionComposer({
  active,
  busy,
  running,
  projects,
  projectsLoading,
  projectsError,
  projectId,
  uploads,
  content,
  uploadProgress,
  uploadNotice,
  onProjectChange,
  onConnectFolder,
  onUpload,
  onRemoveUpload,
  onClearUploads,
  onContentChange,
  onSubmit,
  onViewReview,
  reviewIssue,
  reviewStatusLoading,
  reviewStatusError,
  onRetryReviewStatus,
}: {
  active: boolean;
  busy: boolean;
  running: boolean;
  projects: ConnectedProject[];
  projectsLoading: boolean;
  projectsError: boolean;
  projectId: string;
  uploads: UploadedFile[];
  content: string;
  uploadProgress: string;
  uploadNotice: string;
  onProjectChange: (projectId: string) => void;
  onConnectFolder: () => void;
  onUpload: (files: File[]) => void;
  onRemoveUpload: (id: string) => void;
  onClearUploads: () => void;
  onContentChange: (content: string) => void;
  onSubmit: () => void;
  onViewReview: () => void;
  reviewIssue: string | null;
  reviewStatusLoading: boolean;
  reviewStatusError: boolean;
  onRetryReviewStatus: () => void;
}) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const selectedProject = projects.find((project) => project.id === projectId);
  const hasSource = Boolean(projectId || uploads.length || content.trim());
  const snippetLines = content.trim() ? content.trim().split("\n").length : 0;

  return (
    <fieldset
      disabled={!active || busy}
      className="overflow-hidden rounded-lg border border-line bg-surface disabled:opacity-60"
    >
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-xs font-medium">Project</label>
          <Popover open={projectMenuOpen} onOpenChange={setProjectMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-label="Connected project"
                aria-expanded={projectMenuOpen}
                disabled={projectsLoading}
                className="h-9 w-full min-w-0 justify-between px-3 font-normal"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {selectedProject ? (
                    <Folder size={15} className="shrink-0" />
                  ) : (
                    <Files size={15} className="shrink-0" />
                  )}
                  <span className="truncate">
                    {projectsLoading
                      ? "Loading projects…"
                      : selectedProject?.name || "Attached files only"}
                  </span>
                </span>
                <ChevronsUpDown size={14} className="shrink-0 text-muted" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[var(--radix-popover-trigger-width)] p-0"
            >
              <Command>
                <CommandInput placeholder="Search folders…" />
                <CommandList>
                  <CommandEmpty>No connected folders found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="attached files only"
                      onSelect={() => {
                        onProjectChange("");
                        setProjectMenuOpen(false);
                      }}
                    >
                      <Files />
                      <span>Attached files only</span>
                      <Check
                        className={cn(
                          "ml-auto",
                          projectId ? "opacity-0" : "opacity-100",
                        )}
                      />
                    </CommandItem>
                    {projects.map((project) => (
                      <CommandItem
                        key={project.id}
                        value={project.name + " " + project.root}
                        onSelect={() => {
                          onProjectChange(project.id);
                          setProjectMenuOpen(false);
                        }}
                      >
                        <Folder />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{project.name}</span>
                          <span className="block truncate font-mono text-[10px] text-muted">
                            {project.root}
                          </span>
                        </span>
                        <Check
                          className={cn(
                            "ml-auto",
                            project.id === projectId
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={onConnectFolder}>
          <Folder size={15} />
          Connect folder
        </Button>
      </div>

      {selectedProject && (
        <p className="truncate border-b border-line px-4 py-2 font-mono text-[11px] text-muted">
          {selectedProject.root}
        </p>
      )}
      {projectsError && (
        <p className="border-b border-line px-4 py-2 text-xs text-destructive">
          Could not load connected projects.
        </p>
      )}

      <div className="border-b border-line">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-xs font-medium">Files</h3>
          {!!uploads.length && (
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted">
                {uploads.length}
              </span>
              <Button size="sm" variant="ghost" onClick={onClearUploads}>
                Clear
              </Button>
            </div>
          )}
        </div>

        <div
          className="mx-4 mb-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-4 sm:flex-row sm:text-left"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer.files);
            if (files.length) onUpload(files);
          }}
        >
          <UploadCloud size={18} className="shrink-0 text-muted" />
          <p className="flex-1 text-sm">Drop files here</p>
          <label className="relative inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium hover:bg-elevated focus-within:ring-2">
            <Paperclip size={14} />
            Choose files
            <input
              aria-label="Attach source files"
              type="file"
              multiple
              disabled={!active || busy}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) onUpload(files);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        {uploads.length > 0 && (
          <ul className="max-h-60 divide-y divide-line overflow-y-auto border-t border-line">
            {uploads.map((file) => {
              const parts = file.filename.split("/");
              const name = parts.pop() ?? file.filename;
              const directory = parts.join("/");
              return (
                <li
                  key={file.id}
                  className="group flex items-center gap-3 px-4 py-2.5"
                >
                  <FileTypeIcon filename={file.filename} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">
                      {name}
                    </span>
                    {directory && (
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                        {directory}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={"Remove " + file.filename}
                    onClick={() => onRemoveUpload(file.id)}
                    className="shrink-0 rounded p-1.5 text-muted hover:bg-elevated hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <details className="group border-b border-line">
        <summary className="flex list-none items-center gap-2.5 px-4 py-3 text-sm hover:bg-elevated/30">
          <Braces size={15} className="text-muted" />
          <span>Paste code</span>
          {snippetLines > 0 && (
            <span className="ml-auto text-xs tabular-nums text-muted">
              {snippetLines} lines
            </span>
          )}
          <ArrowRight
            size={13}
            className={
              "text-muted transition-transform group-open:rotate-90 " +
              (snippetLines ? "" : "ml-auto")
            }
          />
        </summary>
        <div className="border-t border-line p-4">
          <Textarea
            aria-label="Implementation code"
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder="Paste code…"
            rows={9}
            className="min-h-48 resize-y font-mono text-xs leading-5"
          />
        </div>
      </details>

      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {reviewIssue && (
            <AlertTriangle size={14} className="shrink-0 text-warning" />
          )}
          <p
            role="status"
            className={cn(
              "min-w-0 text-xs",
              reviewIssue ? "text-warning" : "truncate text-muted",
            )}
          >
            {uploadProgress ||
              uploadNotice ||
              reviewIssue ||
              (reviewStatusLoading
                ? "Checking review service…"
                : reviewStatusError
                  ? "Could not check review service."
                  : hasSource
                    ? "Ready for review"
                    : "Add a project, file, or code")}
          </p>
          {(reviewIssue || reviewStatusError) && (
            <button
              type="button"
              className="shrink-0 text-xs underline underline-offset-2"
              onClick={onRetryReviewStatus}
            >
              Retry
            </button>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {running && (
            <Button size="sm" variant="ghost" onClick={onViewReview}>
              View review
            </Button>
          )}
          <Button
            variant="primary"
            disabled={
              !active || busy || running || !hasSource || Boolean(reviewIssue)
            }
            onClick={onSubmit}
          >
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            Start review
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
