export type ReleaseEntry = {
  version: string;
  date: string;
  notes: string;
};

/** The same versioned entries also supply the GitHub release workflow. */
export function parseReleaseHistory(changelog: string): ReleaseEntry[] {
  return changelog.split(/^## /m).flatMap((section) => {
    const match = section.match(
      /^desktop-v(\d+\.\d+\.\d+) - ([^\r\n]+)\r?\n([\s\S]*)$/,
    );
    if (!match?.[1] || !match[2] || match[3] === undefined) return [];
    return [{ version: match[1], date: match[2], notes: match[3].trim() }];
  });
}
