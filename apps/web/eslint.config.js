import { config } from "@repo/eslint-config/react-internal";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["dist/**", ".next/**", "test-results/**", "playwright-report/**"],
  },
  {
    files: ["*.config.ts", "e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
];
