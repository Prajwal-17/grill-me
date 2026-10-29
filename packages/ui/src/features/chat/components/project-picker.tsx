import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  LoaderCircle,
  Search,
} from "lucide-react";
import { browseFolders } from "../api/review-api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";

function normalizeLocalPath(value: string) {
  const path = value.trim();
  if (!path.startsWith("file://")) return path;
  try {
    return decodeURIComponent(new URL(path).pathname);
  } catch {
    return path;
  }
}

function PathBreadcrumb({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const segments = path.split("/").filter(Boolean);
  return (
    <nav
      aria-label="Current folder"
      className="flex min-w-0 flex-1 items-center overflow-x-auto font-mono text-metadata"
    >
      <button
        type="button"
        aria-label="Root folder"
        className="shrink-0 rounded p-1 text-muted hover:bg-elevated hover:text-foreground"
        onClick={() => onNavigate("/")}
      >
        <Home size={13} />
      </button>
      {segments.map((segment, index) => {
        const segmentPath = "/" + segments.slice(0, index + 1).join("/");
        const current = index === segments.length - 1;
        return (
          <span key={segmentPath} className="flex shrink-0 items-center">
            <ChevronRight size={12} className="text-muted" />
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "rounded px-1.5 py-1 text-foreground"
                  : "rounded px-1.5 py-1 text-muted hover:bg-elevated hover:text-foreground"
              }
              onClick={() => onNavigate(segmentPath)}
            >
              {segment}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

export function ProjectPicker({
  profileId,
  open,
  onOpenChange,
  onSelect,
}: {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
}) {
  const [path, setPath] = useState("");
  const [typedPath, setTypedPath] = useState("");
  const [folderSearch, setFolderSearch] = useState("");
  const listing = useQuery({
    queryKey: ["folders", profileId, path],
    queryFn: () => browseFolders(profileId, path),
    enabled: open,
    retry: false,
  });
  const selectedPath = listing.data?.path ?? path;
  const folders =
    listing.data?.folders.filter((folder) =>
      folder.name.toLowerCase().includes(folderSearch.trim().toLowerCase()),
    ) ?? [];

  function navigate(next: string) {
    setPath(next);
    setTypedPath("");
    setFolderSearch("");
  }

  const bridge = window.desktopBridge;
  const nativePicker = useMutation({
    mutationFn: () =>
      bridge!.selectProjectsFolder(
        normalizeLocalPath(typedPath) || selectedPath,
      ),
    onSuccess: (selected) => {
      if (selected !== null) {
        navigate(selected);
        setTypedPath(selected);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-line px-5 py-4">
          <DialogTitle>Connect folder</DialogTitle>
          <DialogDescription className="sr-only">
            Browse or enter the path of a folder available to Grill Me.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = normalizeLocalPath(typedPath);
              if (next) navigate(next);
            }}
          >
            <Input
              aria-label="Folder path or file URL"
              value={typedPath}
              maxLength={4096}
              onChange={(event) => {
                nativePicker.reset();
                setTypedPath(event.target.value);
              }}
              placeholder="Path or file:// URL"
              autoComplete="off"
              spellCheck={false}
              className="h-9 min-w-0 flex-[1_1_14rem] font-mono text-metadata"
            />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {bridge && (
                <Button
                  type="button"
                  disabled={nativePicker.isPending}
                  onClick={() => nativePicker.mutate()}
                >
                  {nativePicker.isPending ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <FolderOpen size={15} />
                  )}
                  {nativePicker.isPending ? "Opening…" : "Browse…"}
                </Button>
              )}
              <Button
                type="submit"
                disabled={!typedPath.trim() || nativePicker.isPending}
              >
                Open
              </Button>
            </div>
          </form>
          {nativePicker.error && (
            <p role="alert" className="text-supporting text-destructive">
              {nativePicker.error.message}
            </p>
          )}

          <div className="flex min-w-0 items-center gap-1 rounded-md border border-line px-1.5 py-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Go back one folder"
              disabled={!listing.data?.parent || listing.isFetching}
              onClick={() => navigate(listing.data!.parent!)}
            >
              <ArrowLeft size={14} />
            </Button>
            <PathBreadcrumb path={selectedPath} onNavigate={navigate} />
          </div>

          <div className="relative">
            <Search
              aria-hidden="true"
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <Input
              aria-label="Search folders"
              value={folderSearch}
              onChange={(event) => setFolderSearch(event.target.value)}
              placeholder="Search this folder"
              autoComplete="off"
              className="h-9 pl-9"
            />
          </div>

          <div className="h-56 overflow-y-auto rounded-md border border-line p-1">
            {listing.isLoading ? (
              <LoadingRegion
                label="Loading folders…"
                layout="folders"
                className="space-y-2 p-2"
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex h-8 items-center gap-3">
                    <Skeleton className="size-4" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))}
              </LoadingRegion>
            ) : listing.error ? (
              <div
                role="alert"
                className="flex h-full flex-col items-center justify-center px-5 text-center text-ui"
              >
                <p>{listing.error.message}</p>
                <Button className="mt-3" size="sm" onClick={() => navigate("")}>
                  Go home
                </Button>
              </div>
            ) : folders.length ? (
              <div role="list" aria-label="Folders">
                {folders.map((folder) => (
                  <button
                    type="button"
                    role="listitem"
                    key={folder.path}
                    className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-ui hover:bg-elevated focus-visible:outline-2"
                    onClick={() => navigate(folder.path)}
                  >
                    <Folder
                      size={15}
                      className="shrink-0 text-[var(--grill-accent)]"
                    />
                    <span className="min-w-0 truncate">{folder.name}</span>
                    <ChevronRight
                      size={13}
                      className="ml-auto shrink-0 text-muted"
                    />
                  </button>
                ))}
              </div>
            ) : folderSearch && listing.data?.folders.length ? (
              <div className="flex h-full items-center justify-center text-ui text-muted">
                No matching folders
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-ui text-muted">
                No subfolders
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              !listing.data ||
              listing.isFetching ||
              listing.isError ||
              nativePicker.isPending ||
              listing.data.path === "/"
            }
            onClick={() => {
              onSelect(listing.data!.path);
              onOpenChange(false);
            }}
          >
            Connect folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
