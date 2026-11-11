import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Kbd } from "@/shared/components/ui/kbd";
import { useAppStore, type Theme } from "@/shared/stores/app-store";
import type { DesktopState } from "@repo/backend/shared/contracts";
import {
  SettingsFeedback,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
export function AppearanceSettings() {
  const bridge = window.desktopBridge;
  const queries = useQueryClient();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const state = useQuery({
    queryKey: ["desktop-window"],
    queryFn: () => bridge!.getWindowState(),
    enabled: Boolean(bridge),
    staleTime: Infinity,
  });
  const native = useMutation({
    mutationFn: (action: () => Promise<DesktopState>) => action(),
    onSuccess: (value) => {
      queries.setQueryData(["desktop-window"], value);
    },
  });
  return (
    <>
      <SettingsHeading title="Appearance" />
      <SettingsFeedback
        error={native.error ?? state.error}
        onRetry={
          native.error || state.error
            ? () => {
                native.reset();
                void state.refetch();
              }
            : undefined
        }
      />
      <SettingsRow label="Theme" htmlFor="appearance-theme">
        <ChoiceSelect
          id="appearance-theme"
          label="Theme"
          value={theme}
          onChange={(value) => setTheme(value as Theme)}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
        />
      </SettingsRow>
      {bridge && state.data && (
        <SettingsRow label="Application zoom">
          <div>
            <div className="flex max-w-56 items-center gap-1">
              <div className="flex flex-1 items-center justify-between rounded-lg border border-input bg-canvas p-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom out"
                  disabled={native.isPending || state.data.zoom <= 0.5}
                  onClick={() => native.mutate(() => bridge.zoom("out"))}
                >
                  <Minus size={15} />
                </Button>
                <output
                  aria-label="Application zoom"
                  className="min-w-12 text-center text-ui tabular-nums"
                >
                  {Math.round(state.data.zoom * 100)}%
                </output>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom in"
                  disabled={native.isPending || state.data.zoom >= 2}
                  onClick={() => native.mutate(() => bridge.zoom("in"))}
                >
                  <Plus size={15} />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Reset zoom"
                title="Reset zoom (Ctrl 0)"
                disabled={native.isPending || state.data.zoom === 1}
                onClick={() => native.mutate(() => bridge.zoom("reset"))}
              >
                <RotateCcw size={14} />
              </Button>
            </div>
            <p className="mt-1.5 text-supporting text-muted">
              <Kbd>Ctrl +</Kbd> / <Kbd>Ctrl −</Kbd> to adjust
            </p>
          </div>
        </SettingsRow>
      )}
    </>
  );
}
