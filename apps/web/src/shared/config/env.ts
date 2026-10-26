import { parseWebEnv } from "./env-schema";

export const env = parseWebEnv(import.meta.env, import.meta.env.VITE_APP_ENV);
