import { config } from "@repo/eslint-config/react-internal";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["dist/**"],
  },
  {
    files: ["vite.config.ts"],
    languageOptions: { globals: globals.node },
  },
];
