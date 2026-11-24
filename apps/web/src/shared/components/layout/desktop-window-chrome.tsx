import { createPortal } from "react-dom";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Square, Copy, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { useToast } from "@/shared/components/ui/toast";

/** Caption controls stay available during profile selection, loading and errors. */
export function DesktopWindowChrome() {
  const bridge = window.desktopBridge;
  const queries = useQueryClient();
  const { show } = useToast();
  const state = useQuery({
    queryKey: ["desktop-window"],
    queryFn: () => bridge!.getWindowState(),
    enabled: Boolean(bridge),
    staleTime: Infinity,
  });
  useEffect(
    () =>
      bridge?.onWindowState((value) =>
        queries.setQueryData(["desktop-window"], value),
      ),
    [bridge, queries],
  );
  const zoom = state.data?.zoom ?? 1;
  useEffect(() => {
    if (!bridge) return;
    document.documentElement.dataset.desktopPlatform = bridge.platform;
    document.documentElement.style.setProperty(
      "--desktop-page-zoom",
      String(zoom),
    );
    return () => {
      document.documentElement.style.removeProperty("--desktop-page-zoom");
    };
  }, [bridge, zoom]);
  if (!bridge || bridge.platform === "darwin") return null;
  const perform = (action: Promise<unknown>) => {
    void action.catch(() =>
      show({
        message: "Could not update the window. Try again.",
        variant: "error",
      }),
    );
  };
  const maximized = state.data?.maximized ?? false;
  const MaximizeIcon = maximized ? Copy : Square;
  return createPortal(
    <>
      <div
        className="desktop-window-drag-region"
        aria-hidden="true"
        onDoubleClick={() => perform(bridge.toggleMaximize())}
      />
      <div
        className="desktop-window-controls"
        style={{ zoom: 1 / zoom }}
        role="group"
        aria-live="off"
        aria-label="Window controls"
        data-focused={state.data?.focused ?? true}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="desktop-caption-button"
              aria-label="Minimize window"
              onClick={() => perform(bridge.minimizeWindow())}
            >
              <Minus size={11} strokeWidth={1.6} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Minimize
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="desktop-caption-button"
              aria-label={maximized ? "Restore window" : "Maximize window"}
              onClick={() => perform(bridge.toggleMaximize())}
            >
              <MaximizeIcon size={maximized ? 11 : 10} strokeWidth={1.6} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {maximized ? "Restore" : "Maximize"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="desktop-caption-button desktop-caption-close"
              aria-label="Close window"
              onClick={() => perform(bridge.closeWindow())}
            >
              <X size={11} strokeWidth={1.6} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Close
          </TooltipContent>
        </Tooltip>
      </div>
    </>,
    document.body,
  );
}
