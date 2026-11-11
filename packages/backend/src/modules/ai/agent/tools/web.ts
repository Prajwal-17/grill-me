import { lookup as resolveAddress } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { AppError } from "../../../../shared/errors/app-error";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 120_000;
const MAX_REDIRECTS = 3;
const ALLOWED_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/json",
  "application/xml",
  "text/xml",
  "text/markdown",
];

type Resolved = {
  url: URL;
  addresses: { address: string; family: 4 | 6 }[];
};

function privateAddress(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8") ||
      normalized.startsWith("64:ff9b:")
    )
      return true;
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (dotted) return privateAddress(dotted[1]!);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
    if (hex) {
      const high = Number.parseInt(hex[1]!, 16);
      const low = Number.parseInt(hex[2]!, 16);
      return privateAddress(
        `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
      );
    }
    return false;
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function blockedHostname(hostname: string) {
  const name = hostname.toLowerCase().replace(/\.$/, "");
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name.endsWith(".internal") ||
    name === "metadata.google.internal" ||
    name === "metadata"
  );
}

export async function validatePublicUrl(
  input: string | URL,
  base?: string | URL,
): Promise<Resolved> {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    throw new AppError("WEB_URL_INVALID", "Enter a valid public web URL.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new AppError(
      "WEB_URL_INVALID",
      "Only public HTTP and HTTPS pages can be opened.",
      400,
    );
  if (url.username || url.password)
    throw new AppError(
      "WEB_URL_INVALID",
      "URLs with embedded credentials are not allowed.",
      400,
    );
  if (url.port && !["80", "443"].includes(url.port))
    throw new AppError(
      "WEB_URL_BLOCKED",
      "Only standard HTTP and HTTPS ports can be opened.",
      400,
    );
  if (!url.hostname || blockedHostname(url.hostname))
    throw new AppError(
      "WEB_URL_BLOCKED",
      "Local and private network addresses cannot be opened.",
      400,
    );
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(literal);
  if (literalFamily) {
    if (privateAddress(literal))
      throw new AppError(
        "WEB_URL_BLOCKED",
        "Local and private network addresses cannot be opened.",
        400,
      );
    return {
      url,
      addresses: [
        { address: literal, family: (literalFamily === 6 ? 6 : 4) as 4 | 6 },
      ],
    };
  }
  let addresses: { address: string; family: 4 | 6 }[];
  try {
    const resolved = await resolveAddress(url.hostname, {
      all: true,
      verbatim: true,
    });
    addresses = resolved.map((entry) => ({
      address: entry.address,
      family: (entry.family === 6 ? 6 : 4) as 4 | 6,
    }));
  } catch {
    throw new AppError(
      "WEB_UNREACHABLE",
      "The page's host could not be resolved.",
      502,
      true,
    );
  }
  if (
    !addresses.length ||
    addresses.some((entry) => privateAddress(entry.address))
  )
    throw new AppError(
      "WEB_URL_BLOCKED",
      "Local and private network addresses cannot be opened.",
      400,
    );
  return {
    url,
    addresses: addresses.map((entry) => ({
      address: entry.address,
      family: (entry.family === 6 ? 6 : 4) as 4 | 6,
    })),
  };
}

function pinnedLookup(
  addresses: { address: string; family: 4 | 6 }[],
): LookupFunction {
  return ((_hostname, options, callback) => {
    const all = typeof options === "object" && options.all;
    if (all)
      (
        callback as unknown as (
          error: NodeJS.ErrnoException | null,
          addresses: { address: string; family: number }[],
        ) => void
      )(null, addresses);
    else
      callback(
        null,
        addresses[0]!.address,
        addresses[0]!.family as unknown as number,
      );
  }) as LookupFunction;
}

async function requestPublic(
  target: Resolved,
  signal: AbortSignal | undefined,
  redirects = 0,
): Promise<{ url: string; contentType: string; text: string }> {
  if (signal?.aborted)
    throw new AppError("REQUEST_CANCELLED", "The request was cancelled.", 499);
  const { url, addresses } = target;
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const response = await new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          Accept:
            "text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.1",
          "User-Agent": "GrillMe/1.0 public-page reader",
        },
        lookup: pinnedLookup(addresses),
        signal,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error("WEB_OUTPUT_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", reject);
      },
    );
    req.setTimeout(10_000, () => req.destroy(new Error("WEB_TIMEOUT")));
    req.on("error", (error) => {
      if (signal?.aborted)
        reject(
          new AppError("REQUEST_CANCELLED", "The request was cancelled.", 499),
        );
      else if (error.message === "WEB_TIMEOUT")
        reject(
          new AppError(
            "WEB_TIMEOUT",
            "The page took too long to respond.",
            504,
            true,
          ),
        );
      else if (error.message === "WEB_OUTPUT_TOO_LARGE")
        reject(
          new AppError(
            "WEB_OUTPUT_TOO_LARGE",
            "The page exceeded the public retrieval limit.",
            502,
          ),
        );
      else
        reject(
          new AppError(
            "WEB_UNREACHABLE",
            "The public page could not be reached.",
            502,
            true,
          ),
        );
    });
    req.end();
  });
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= MAX_REDIRECTS)
      throw new AppError(
        "WEB_REDIRECT_LIMIT",
        "The page redirected too many times.",
        502,
      );
    const location = response.headers.location;
    if (typeof location !== "string")
      throw new AppError(
        "WEB_REDIRECT_INVALID",
        "The redirect was invalid.",
        502,
      );
    return requestPublic(
      await validatePublicUrl(location, target.url),
      signal,
      redirects + 1,
    );
  }
  if (response.status < 200 || response.status >= 300)
    throw new AppError(
      "WEB_HTTP_ERROR",
      `The page returned HTTP ${response.status}.`,
      502,
      response.status >= 500,
    );
  const contentType = String(response.headers["content-type"] ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType))
    throw new AppError(
      "WEB_CONTENT_UNSUPPORTED",
      "That page is not readable text. Choose an HTML, text, JSON, or Markdown page.",
      400,
    );
  return {
    url: url.toString(),
    contentType,
    text: htmlToText(response.body.toString("utf8"), contentType),
  };
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)));
}

export function htmlToText(input: string, contentType = "text/html") {
  if (!contentType.includes("html")) return input.slice(0, MAX_TEXT).trim();
  return decodeEntities(
    input
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, MAX_TEXT)
    .trim();
}

export async function readPublicPage(
  url: string,
  signal?: AbortSignal,
): Promise<{ url: string; contentType: string; text: string }> {
  return requestPublic(await validatePublicUrl(url), signal);
}

export async function braveSearch(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{
  query: string;
  results: { title: string; url: string; description: string }[];
}> {
  if (!query.trim()) throw new Error("Enter a search query.");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query.slice(0, 400));
  url.searchParams.set("count", "8");
  url.searchParams.set("safesearch", "moderate");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.any([
      AbortSignal.timeout(10_000),
      ...(signal ? [signal] : []),
    ]),
    redirect: "error",
  }).catch(() => {
    throw new Error("Web search could not be reached.");
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Web search returned HTTP ${response.status}.`);
  }
  const body = (await response.json()) as {
    web?: {
      results?: { title?: unknown; url?: unknown; description?: unknown }[];
    };
  };
  return {
    query,
    results: (body.web?.results ?? []).flatMap((entry) =>
      typeof entry.title === "string" &&
      typeof entry.url === "string" &&
      typeof entry.description === "string"
        ? [
            {
              title: entry.title.slice(0, 300),
              url: entry.url.slice(0, 2048),
              description: entry.description.slice(0, 1_000),
            },
          ]
        : [],
    ),
  };
}
