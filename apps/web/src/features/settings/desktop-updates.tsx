import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import type { DesktopUpdateState } from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/shared/components/ui/alert-dialog";
import { SettingsFeedback } from "./settings-layout";
const updateKey = ["desktop-updates"];
export function useDesktopUpdates() {
  const queries = useQueryClient();
  const bridge = window.desktopBridge;
  const state = useQuery({
    queryKey: updateKey,
    queryFn: () => bridge!.getUpdateState(),
    enabled: Boolean(bridge),
    staleTime: Infinity,
    retry: false,
  });
  useEffect(
    () =>
      bridge?.onUpdateState((value) => queries.setQueryData(updateKey, value)),
    [bridge, queries],
  );
  return state;
}
export function UpdateIndicator() {
  const { data } = useDesktopUpdates();
  if (!data?.enabled || (data.authorized && !data.latestVersion)) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/settings?section=about" className="gap-1.5">
        <ArrowDownToLine size={14} />
        {!data.authorized
          ? "Connect updates"
          : data.phase === "downloaded"
            ? "Restart to update"
            : data.phase === "downloading"
              ? `Downloading ${data.progress ?? 0}%`
              : "Update available"}
      </Link>
    </Button>
  );
}
export function DesktopUpdatesSettings({
  versionLabel,
}: {
  versionLabel?: string | null;
}) {
  const state = useDesktopUpdates();
  const queries = useQueryClient();
  const bridge = window.desktopBridge;
  const [email, setEmail] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [confirm, setConfirm] = useState(false);
  const action = useMutation({
    mutationFn: (work: () => Promise<DesktopUpdateState>) => work(),
    onSuccess: (value) => {
      queries.setQueryData(updateKey, value);
      if (value.phase !== "error") setToken("");
    },
  });
  if (!bridge) return null;
  const data = state.data;
  const working =
    action.isPending ||
    data?.phase === "checking" ||
    data?.phase === "installing";
  const statusText =
    data?.phase === "error" || !data?.enabled ? undefined : data.message;
  return (
    <section aria-label="Updates" className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-supporting text-muted">
          {versionLabel && (
            <span className="font-medium tabular-nums text-foreground">
              {versionLabel}
            </span>
          )}
          {versionLabel && statusText && <span aria-hidden="true"> · </span>}
          {statusText && <span>{statusText}</span>}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={
              working ||
              !data?.authorized ||
              !data.enabled ||
              data.phase === "downloading"
            }
            onClick={() => action.mutate(() => bridge.checkForUpdates())}
          >
            {data?.phase === "checking" ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Check for updates
          </Button>
          {data?.authorized && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Update options"
                >
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={working || data.phase === "downloading"}
                  onSelect={() =>
                    action.mutate(() => bridge.forgetUpdateToken())
                  }
                >
                  Disconnect private updates
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {state.isPending && (
        <p role="status" className="mt-2 text-supporting text-muted">
          Checking update access…
        </p>
      )}
      <SettingsFeedback
        error={
          state.error ??
          action.error ??
          (data?.phase === "error" ? new Error(data.message) : null)
        }
      />
      {data && (
        <>
          {data.phase === "downloading" && (
            <div className="mt-3 space-y-2">
              <progress
                className="h-2 w-full accent-foreground"
                value={data.progress ?? 0}
                max={100}
                aria-label="Update download progress"
              />
              <div className="flex items-center justify-between text-supporting">
                <span>{data.progress ?? 0}% downloaded</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    action.mutate(() => bridge.cancelUpdateDownload())
                  }
                >
                  Cancel download
                </Button>
              </div>
            </div>
          )}
          {data.latestVersion &&
            ["available", "error"].includes(data.phase) &&
            data.progress !== 100 && (
              <Button
                className="mt-3"
                variant="primary"
                disabled={working || !data.authorized}
                onClick={() => action.mutate(() => bridge.downloadUpdate())}
              >
                <ArrowDownToLine size={15} />
                Download v{data.latestVersion}
              </Button>
            )}
          {(data.phase === "downloaded" ||
            (data.phase === "error" && data.progress === 100)) && (
            <Button
              className="mt-3"
              variant="primary"
              disabled={working}
              onClick={() => setConfirm(true)}
            >
              Install and restart to v{data.latestVersion}
            </Button>
          )}
          {data.enabled && (!data.authorized || data.phase === "error") && (
            <form
              className="mt-4 grid max-w-lg gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                action.mutate(() =>
                  bridge.configureUpdates({
                    email: email ?? data.email ?? "",
                    token: token || undefined,
                  }),
                );
              }}
            >
              <label className="grid gap-1.5 text-supporting font-medium">
                Email
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                  value={email ?? data.email ?? ""}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={working}
                />
              </label>
              <label className="grid gap-1.5 text-supporting font-medium">
                GitHub update token
                <Input
                  type="password"
                  autoComplete="new-password"
                  maxLength={8192}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  disabled={working}
                  placeholder="Read-only token for this repository"
                />
              </label>
              <p className="text-supporting text-muted">
                Use a fine-grained token with Contents: read. Leave blank when
                signed in with GitHub CLI.
              </p>
              <Button type="submit" variant="primary" disabled={working}>
                {working && <LoaderCircle size={14} className="animate-spin" />}
                Connect private updates
              </Button>
            </form>
          )}
        </>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Install update and restart?</AlertDialogTitle>
            <AlertDialogDescription>
              Grill Me will close, install the verified update, and reopen.
              Finish any active AI request first. Your saved practice and
              settings will remain.{" "}
              {bridge.platform === "linux"
                ? "Linux may ask for administrator approval."
                : "The app must be installed in a writable Applications folder."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Later</AlertDialogCancel>
            <Button
              variant="primary"
              onClick={() => {
                setConfirm(false);
                action.mutate(() => bridge.installUpdate());
              }}
            >
              Install and restart
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
