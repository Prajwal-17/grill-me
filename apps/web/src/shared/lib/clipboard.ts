type BrowserClipboard = {
  writeText(text: string): Promise<void>;
};

type DesktopClipboard = {
  writeClipboardText(input: { text: string }): Promise<void>;
};

export type ClipboardEnvironment = {
  browser?: BrowserClipboard | null;
  desktop?: DesktopClipboard | null;
};

function currentEnvironment(): ClipboardEnvironment {
  return {
    browser:
      typeof navigator === "undefined" ? null : (navigator.clipboard ?? null),
    desktop:
      typeof window === "undefined" ? null : (window.desktopBridge ?? null),
  };
}

/**
 * Writes text with the browser clipboard first. The sandboxed desktop renderer
 * denies browser clipboard permissions, so fall back to the narrow preload
 * bridge, which writes from Electron's main process.
 */
export async function writeClipboardText(
  text: string,
  environment: ClipboardEnvironment = currentEnvironment(),
): Promise<void> {
  if (environment.browser) {
    try {
      await environment.browser.writeText(text);
      return;
    } catch {
      // The desktop app denies browser clipboard writes; try the bridge.
    }
  }
  if (
    environment.desktop &&
    typeof environment.desktop.writeClipboardText === "function"
  ) {
    await environment.desktop.writeClipboardText({ text });
    return;
  }
  throw new Error("Clipboard unavailable.");
}
