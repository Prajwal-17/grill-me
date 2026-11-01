import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

export function useDesktopVersion() {
  const bridge = window.desktopBridge;
  return useQuery({
    queryKey: ["desktop-version"],
    queryFn: () => bridge!.getAppVersion(),
    enabled: Boolean(bridge),
    staleTime: Infinity,
  });
}

export function DesktopVersionLink() {
  const version = useDesktopVersion();
  if (!window.desktopBridge || !version.data) return null;
  return (
    <Link
      to="/settings?section=about"
      aria-label={`Grill Me version ${version.data}, view release history`}
      className="inline-flex min-h-8 items-center rounded-md px-2 text-metadata tabular-nums text-muted outline-offset-2 transition-colors hover:bg-elevated hover:text-foreground"
    >
      v{version.data}
    </Link>
  );
}
