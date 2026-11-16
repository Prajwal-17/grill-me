import ReactMarkdown from "react-markdown";
import { List } from "lucide-react";
import changelog from "../../../../../CHANGELOG.md?raw";
import { useDesktopVersion } from "@/shared/components/layout/desktop-version";
import { SettingsHeading } from "./settings-layout";
import { parseReleaseHistory } from "./release-history";
import { ReleaseToc, releaseAnchor, useReleaseToc } from "./release-toc";
import { DesktopUpdatesSettings } from "./desktop-updates";

const releases = parseReleaseHistory(changelog);

export function AboutSettings({ active = true }: { active?: boolean }) {
  const version = useDesktopVersion();
  const activeRelease = useReleaseToc(releases, active);
  const versionLabel = version.data
    ? `v${version.data}`
    : version.isError
      ? "Version unavailable"
      : null;
  return (
    <div>
      <SettingsHeading title="About" />
      <DesktopUpdatesSettings versionLabel={versionLabel} />
      <section aria-labelledby="release-history-heading" className="mt-6">
        <h3 id="release-history-heading" className="sr-only">
          Release history
        </h3>
        <div className="grid min-w-0 gap-6 @min-[600px]:grid-cols-[minmax(0,1fr)_7rem] @min-[600px]:gap-8">
          <div className="min-w-0">
            <div className="@min-[600px]:hidden">
              <details>
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-metadata text-muted">
                  <List size={14} />
                  Releases
                </summary>
                <ReleaseToc
                  releases={releases}
                  active={activeRelease}
                  className="my-3 border-l border-line pl-2"
                />
              </details>
            </div>
            <div className="divide-y divide-line">
              {releases.map((release) => (
                <article
                  key={release.version}
                  id={releaseAnchor(release.version)}
                  className="scroll-mt-6 py-6 first:pt-2"
                >
                  <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h4 className="text-ui font-semibold tabular-nums">
                      v{release.version}
                    </h4>
                    <span className="text-metadata text-muted">
                      {release.date}
                    </span>
                    {version.data === release.version && (
                      <span className="text-metadata text-muted">
                        Installed
                      </span>
                    )}
                  </header>
                  <div className="mt-2 space-y-2 text-supporting leading-relaxed text-foreground">
                    <ReactMarkdown
                      components={{
                        h3: ({ children }) => (
                          <h5 className="pt-2 text-supporting font-semibold">
                            {children}
                          </h5>
                        ),
                        h4: ({ children }) => (
                          <h6 className="pt-1 text-supporting font-medium">
                            {children}
                          </h6>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc space-y-1 pl-5 marker:text-muted">
                            {children}
                          </ul>
                        ),
                      }}
                    >
                      {release.notes}
                    </ReactMarkdown>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <aside className="sticky top-0 hidden max-h-[calc(100dvh-9rem)] self-start overflow-y-auto @min-[600px]:block">
            <ReleaseToc releases={releases} active={activeRelease} />
          </aside>
        </div>
      </section>
    </div>
  );
}
