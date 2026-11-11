import ReactMarkdown from "react-markdown";
import changelog from "../../../../../CHANGELOG.md?raw";
import { useDesktopVersion } from "@/shared/components/layout/desktop-version";
import { SettingsHeading, SettingsRow } from "./settings-layout";
import { parseReleaseHistory } from "./release-history";
import { DesktopUpdatesSettings } from "./desktop-updates";

const releases = parseReleaseHistory(changelog);

export function AboutSettings() {
  const version = useDesktopVersion();
  const versionLabel = version.data
    ? `v${version.data}`
    : version.isError
      ? "Unavailable"
      : "Loading…";
  return (
    <div>
      <SettingsHeading title="About" />
      <SettingsRow label="Version">
        <p className="pt-1.5 text-ui tabular-nums text-muted">{versionLabel}</p>
      </SettingsRow>
      <div className="mt-7">
        <DesktopUpdatesSettings />
      </div>
      <section aria-labelledby="release-history-heading">
        <h3 id="release-history-heading" className="text-ui font-semibold">
          Release history
        </h3>
        <div className="mt-3 divide-y divide-line">
          {releases.map((release) => (
            <article key={release.version} className="py-5 first:pt-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h4 className="text-ui font-semibold tabular-nums">
                  v{release.version}
                </h4>
                <span className="text-metadata text-muted">{release.date}</span>
                {version.data === release.version && (
                  <span className="text-metadata text-muted">Installed</span>
                )}
              </div>
              <div className="mt-2 space-y-2 text-supporting leading-relaxed text-foreground">
                <ReactMarkdown
                  components={{
                    h3: ({ children }) => (
                      <h5 className="pt-2 text-supporting font-semibold">
                        {children}
                      </h5>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc space-y-1 pl-5">{children}</ul>
                    ),
                  }}
                >
                  {release.notes}
                </ReactMarkdown>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
