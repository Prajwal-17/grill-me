"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, ArrowUp, LoaderCircle } from "lucide-react";
import { browseFolders } from "../api/review-api";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
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
  const [typedPath, setTypedPath] = useState<string | null>(null);
  const navigate = (next: string) => {
    setPath(next);
    setTypedPath(null);
  };
  const listing = useQuery({
    queryKey: ["folders", profileId, path],
    queryFn: () => browseFolders(profileId, path),
    enabled: open,
    retry: false,
  });
  const inputPath = typedPath ?? listing.data?.path ?? path;
  const pathChanged = inputPath.trim() !== listing.data?.path;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect a folder</DialogTitle>
          <DialogDescription>
            Enter a path or browse folders available to Grill Me. Files are read
            when you submit for review.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = inputPath.trim();
            if (!next) return;
            if (next === path) {
              setTypedPath(null);
              void listing.refetch();
            } else navigate(next);
          }}
        >
          <label htmlFor="project-folder-path" className="text-sm font-medium">
            Folder path
          </label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Parent folder"
              disabled={!listing.data?.parent || listing.isFetching}
              onClick={() => navigate(listing.data!.parent!)}
            >
              <ArrowUp size={16} />
            </Button>
            <input
              id="project-folder-path"
              value={inputPath}
              onChange={(e) => setTypedPath(e.target.value)}
              placeholder="/absolute/path/to/project"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!inputPath.trim() || listing.isFetching}
            >
              Open
            </Button>
          </div>
          {pathChanged && typedPath !== null && (
            <p className="text-xs text-muted">
              Press Enter or Open to browse this path before selecting it.
            </p>
          )}
        </form>
        <div className="h-64 overflow-y-auto rounded border border-line p-1">
          {listing.isLoading ? (
            <p className="p-4 text-sm text-muted">
              <LoaderCircle size={16} className="mr-2 inline animate-spin" />
              Loading folders…
            </p>
          ) : listing.error ? (
            <div className="p-4 text-sm" role="alert">
              <p>{listing.error.message}</p>
              <Button className="mt-3" size="sm" onClick={() => navigate("")}>
                Back to home
              </Button>
            </div>
          ) : listing.data?.folders.length ? (
            listing.data.folders.map((folder) => (
              <button
                key={folder.path}
                className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-elevated focus-visible:outline-2"
                onClick={() => navigate(folder.path)}
              >
                <Folder size={16} className="shrink-0 text-muted" />
                <span className="break-all">{folder.name}</span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-muted">
              No subfolders. You can select this folder.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                !listing.data ||
                listing.isFetching ||
                pathChanged ||
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
