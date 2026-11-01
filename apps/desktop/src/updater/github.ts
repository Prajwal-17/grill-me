import { z } from "zod";
export const UPDATE_REPO = "Prajwal-17/grill-me";
export const UPDATE_OWNER = "Prajwal-17";
const api = `https://api.github.com/repos/${UPDATE_REPO}`;
export const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      size: z.number().int().nonnegative(),
      state: z.string(),
    }),
  ),
});
export type UpdateRelease = z.infer<typeof releaseSchema>;
export class UpdateError extends Error {
  constructor(
    message: string,
    readonly auth = false,
  ) {
    super(message);
  }
}
export function githubError(status: number): UpdateError {
  if (status === 401)
    return new UpdateError(
      "The GitHub token expired or was revoked. Enter a new token in Settings → About.",
      true,
    );
  if (status === 403)
    return new UpdateError(
      "GitHub denied access or its rate limit was reached. Check token permissions, then retry later.",
    );
  if (status === 404)
    return new UpdateError(
      "Cannot access the private release. Use a token with Contents: read access to Prajwal-17/grill-me.",
      true,
    );
  return new UpdateError(
    `GitHub could not complete the update request (HTTP ${status}). Retry later.`,
  );
}
export function newerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) =>
    /^(?:desktop-v)?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const a = parse(candidate),
    b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}
export class GitHubUpdates {
  constructor(private fetcher: typeof fetch = fetch) {}
  async request(
    path: string,
    token: string,
    signal?: AbortSignal,
    binary = false,
  ): Promise<Response> {
    let url = new URL(path.startsWith("https://") ? path : `${api}${path}`);
    if (url.origin !== "https://api.github.com")
      throw new UpdateError("Unexpected GitHub API address.");
    const combined = AbortSignal.any([
      AbortSignal.timeout(binary ? 30 * 60 * 1000 : 15000),
      ...(signal ? [signal] : []),
    ]);
    for (let redirects = 0; redirects < 5; redirects++) {
      // Authorization is sent only to GitHub's API, never a signed asset CDN URL.
      const trusted = url.origin === "https://api.github.com";
      const response = await this.fetcher(url, {
        headers: {
          ...(trusted
            ? {
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28",
              }
            : {}),
          Accept: binary
            ? "application/octet-stream"
            : "application/vnd.github+json",
          "User-Agent": "Grill-Me-Desktop-Updater",
        },
        signal: combined,
        redirect: "manual",
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!binary || !location)
          throw new UpdateError("GitHub returned an unexpected redirect.");
        const next = new URL(location, url);
        if (
          next.protocol !== "https:" ||
          next.username ||
          next.password ||
          ![
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
            "github.com",
          ].includes(next.hostname)
        )
          throw new UpdateError("GitHub returned an untrusted asset address.");
        url = next;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw githubError(response.status);
      }
      return response;
    }
    throw new UpdateError("Too many redirects while downloading the update.");
  }
  async validate(token: string, ownerOnly = false) {
    const response = await this.request("https://api.github.com/user", token);
    const user = z
      .object({ login: z.string(), email: z.string().nullable().optional() })
      .parse(await response.json());
    if (ownerOnly && user.login.toLowerCase() !== UPDATE_OWNER.toLowerCase())
      throw new UpdateError(
        "Sign into the repository owner's account using gh auth login, or enter a read-only update token.",
        true,
      );
    const repo = await this.request("", token);
    await repo.body?.cancel();
    return user;
  }
  async latest(token: string): Promise<UpdateRelease | null> {
    const response = await this.request("/releases?per_page=100", token);
    const releases = z.array(releaseSchema).parse(await response.json());
    return (
      releases
        .filter(
          (r) =>
            !r.draft &&
            !r.prerelease &&
            /^desktop-v\d+\.\d+\.\d+$/.test(r.tag_name),
        )
        .sort((a, b) =>
          newerVersion(a.tag_name, b.tag_name)
            ? -1
            : newerVersion(b.tag_name, a.tag_name)
              ? 1
              : 0,
        )[0] ?? null
    );
  }
  asset(id: number, token: string, signal?: AbortSignal) {
    return this.request(`/releases/assets/${id}`, token, signal, true);
  }
}
