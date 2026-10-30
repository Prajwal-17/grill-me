import {
  AlertTriangle,
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
import { AnimatePresence, motion } from "motion/react";
import { useInstantMotion } from "@/shared/components/ui/interaction-motion";
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
    className: "text-muted",
  },
  {
    extensions: ["json", "jsonc"],
    icon: FileJson2,
    className: "text-muted",
  },
  {
    extensions: ["sql", "db", "sqlite", "prisma"],
    icon: Database,
    className: "text-muted",
  },
  {
    extensions: ["css", "scss", "sass", "less"],
    icon: Palette,
    className: "text-muted",
  },
  {
    extensions: ["md", "mdx", "txt", "rst"],
    icon: FileText,
    className: "text-muted",
  },
  {
    extensions: ["zip", "gz", "tar", "7z"],
    icon: FileArchive,
    className: "text-muted",
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
    className: "text-brand",
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
  const instantMotion = useInstantMotion();
  const [dragging, setDragging] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const selectedProject = projects.find((project) => project.id === projectId);
  const hasSource = Boolean(projectId || uploads.length || content.trim());
  const snippetLines = content.trim() ? content.trim().split("\n").length : 0;

  return (
    <fieldset
      disabled={!active || busy}
      className="min-w-0 space-y-6 disabled:opacity-60"
    >
      <div>
        <h2 className="text-section font-semibold tracking-[-0.02em]">
          Submit implementation
        </h2>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-ui font-medium">Project folder</p>
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
                      : selectedProject?.name || "No folder selected"}
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
                      value="no folder selected"
                      onSelect={() => {
                        onProjectChange("");
                        setProjectMenuOpen(false);
                      }}
                    >
                      <Files />
                      <span>No folder selected</span>
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
                          <span className="block truncate font-mono text-metadata text-muted">
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
        <p className="-mt-4 break-all font-mono text-metadata text-muted">
          {selectedProject.root}
        </p>
      )}
      {projectsError && (
        <p className="text-supporting text-destructive">
          Could not load connected projects.
        </p>
      )}

      <div className="@container/submission">
        <div className="grid min-w-0 gap-6 @min-[720px]/submission:grid-cols-2">
          <section className="min-w-0" aria-labelledby="submission-files-title">
            <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
              <h3 id="submission-files-title" className="text-ui font-medium">
                Source files
              </h3>
              {!!uploads.length && (
                <div className="flex items-center gap-2">
                  <span className="text-metadata tabular-nums text-muted">
                    {uploads.length}
                  </span>
                  <Button size="sm" variant="ghost" onClick={onClearUploads}>
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div
              className={cn(
                "flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
                dragging
                  ? "border-foreground bg-elevated"
                  : "border-control-border bg-surface",
              )}
              onDragOver={(event) => {
                event.preventDefault();
                if (active && !busy) setDragging(true);
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                )
                  setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!active || busy) return;
                const files = Array.from(event.dataTransfer.files);
                if (files.length) onUpload(files);
              }}
            >
              <UploadCloud size={24} className="shrink-0 text-muted" />
              <p className="text-ui">Drop source files here</p>
              <label className="relative inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-control-border bg-surface px-3 text-supporting font-medium hover:bg-elevated focus-within:ring-2">
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

            <ul className="mt-3 max-h-60 divide-y divide-line overflow-y-auto empty:hidden">
              <AnimatePresence initial={false} custom={instantMotion}>
                {uploads.map((file) => {
                  const parts = file.filename.split("/");
                  const name = parts.pop() ?? file.filename;
                  const directory = parts.join("/");
                  return (
                    <motion.li
                      initial={instantMotion ? false : { opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit="exit"
                      variants={{
                        exit: (immediate: boolean) => ({
                          opacity: 0,
                          x: immediate ? 0 : 4,
                          transition: { duration: immediate ? 0 : 0.1 },
                        }),
                      }}
                      key={file.id}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <FileTypeIcon filename={file.filename} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-metadata">
                          {name}
                        </span>
                        {directory && (
                          <span className="mt-0.5 block truncate font-mono text-metadata text-muted">
                            {directory}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        aria-label={"Remove " + file.filename}
                        onClick={() => onRemoveUpload(file.id)}
                        className="pressable shrink-0 rounded p-1.5 text-muted hover:bg-elevated hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </section>

          <section className="min-w-0" aria-labelledby="submission-code-title">
            <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
              <h3 id="submission-code-title" className="text-ui font-medium">
                Code snippet
              </h3>
              {snippetLines > 0 && (
                <span className="text-metadata tabular-nums text-muted">
                  {snippetLines} {snippetLines === 1 ? "line" : "lines"}
                </span>
              )}
            </div>
            <Textarea
              aria-label="Implementation code"
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              placeholder="Paste your implementation here…"
              rows={12}
              className="min-h-72 resize-y bg-surface font-mono text-code"
            />
          </section>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {reviewIssue && (
            <AlertTriangle size={14} className="shrink-0 text-warning" />
          )}
          <p
            role="status"
            className={cn(
              "min-w-0 text-metadata",
              reviewIssue ? "text-warning" : "text-muted",
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
                    ? [
                        projectId &&
                          (selectedProject?.name || "Project folder"),
                        uploads.length > 0 &&
                          `${uploads.length} ${uploads.length === 1 ? "file" : "files"}`,
                        snippetLines > 0 &&
                          `${snippetLines} ${snippetLines === 1 ? "line" : "lines"} of code`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : null)}
          </p>
          {(reviewIssue || reviewStatusError) && (
            <button
              type="button"
              className="shrink-0 text-metadata underline underline-offset-2"
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
