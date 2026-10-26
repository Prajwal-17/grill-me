import { z } from "zod";

const appEnvSchema = z.enum(["development", "production", "test"]);
const webEnvSchema = z.object({
  VITE_APP_ENV: appEnvSchema,
  VITE_API_URL: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }, "VITE_API_URL must not include credentials, a query, or a fragment"),
});

/** Shared by Vite and the browser; never reads backend environment variables. */
export function parseWebEnv(values: Record<string, unknown>, mode: string) {
  const appEnv = appEnvSchema.parse(values.VITE_APP_ENV ?? mode);
  const parsed = webEnvSchema.parse({
    VITE_APP_ENV: appEnv,
    VITE_API_URL:
      values.VITE_API_URL ??
      (appEnv === "production"
        ? "http://localhost:17017"
        : "http://localhost:8027"),
  });
  return {
    appEnv: parsed.VITE_APP_ENV,
    apiUrl: parsed.VITE_API_URL.replace(/\/+$/, ""),
  };
}
