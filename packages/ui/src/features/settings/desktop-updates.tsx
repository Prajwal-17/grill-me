import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, LoaderCircle, RefreshCw } from "lucide-react";
import type { DesktopUpdateState } from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
export function DesktopUpdatesSettings() {
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
  return (
    <section aria-labelledby="updates-heading" className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 id="updates-heading" className="text-ui font-semibold">
          Updates
        </h3>
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
          <RefreshCw size={14} />
          Check for updates
        </Button>
      </div>
      {state.isPending && (
        <p role="status" className="text-supporting text-muted">
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
          {data.phase !== "error" && (
            <p role="status" className="mb-3 text-supporting text-muted">
              {data.message}
            </p>
          )}
          {data.authorized && (
            <div className="mb-4 flex flex-wrap items-center gap-3 text-supporting">
              <span>
                {data.authSource === "owner-cli"
                  ? "Owner · GitHub CLI"
                  : data.authSource === "session-token"
                    ? "Token connected for this session"
                    : "Token saved securely"}
                {data.email ? ` · ${data.email}` : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={working || data.phase === "downloading"}
                onClick={() => action.mutate(() => bridge.forgetUpdateToken())}
              >
                Disconnect updates
              </Button>
            </div>
          )}
          {data.phase === "downloading" && (
            <div className="mb-4 space-y-2">
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
