import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import type { ReleaseEntry } from "./release-history";

export function releaseAnchor(version: string) {
  return `release-v${version.replaceAll(".", "-")}`;
}

/** Tracks which release is at the top of the settings scroll container. */
export function useReleaseToc(releases: ReleaseEntry[], enabled: boolean) {
  const [active, setActive] = useState(() => releases[0]?.version ?? "");
  useEffect(() => {
    if (!enabled) return;
    const container = document.querySelector('[data-slot="settings-content"]');
    if (!(container instanceof HTMLElement)) return;
    const update = () => {
      const top = container.getBoundingClientRect().top + 80;
      let current = releases[0]?.version ?? "";
      for (const release of releases) {
        const element = document.getElementById(releaseAnchor(release.version));
        if (element && element.getBoundingClientRect().top <= top)
          current = release.version;
      }
      setActive(current);
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [enabled, releases]);
  return active;
}

export function ReleaseToc({
  releases,
  active,
  className,
}: {
  releases: ReleaseEntry[];
  active: string;
  className?: string;
}) {
  return (
    <nav aria-label="Releases" className={cn("grid gap-0.5", className)}>
      {releases.map((release) => (
        <a
          key={release.version}
          href={`#${releaseAnchor(release.version)}`}
          onClick={(event) => {
            event.preventDefault();
            document
              .getElementById(releaseAnchor(release.version))
              ?.scrollIntoView({
                block: "start",
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
              });
          }}
          aria-current={active === release.version ? "location" : undefined}
          className={cn(
            "block rounded px-2 py-1.5 text-metadata tabular-nums leading-5 text-muted transition-colors duration-100 hover:text-foreground focus-visible:outline-offset-0",
            active === release.version && "bg-elevated text-foreground",
          )}
        >
          v{release.version}
        </a>
      ))}
    </nav>
  );
}
