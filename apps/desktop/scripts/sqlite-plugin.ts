import { resolve } from "node:path";
import type { BunPlugin } from "bun";

const database = resolve(import.meta.dir, "../../backend/src/shared/database");
export const sqlitePlugin: BunPlugin = {
  name: "desktop-sqlite",
  setup(build) {
    build.onLoad(
      { filter: /\/shared\/database\/(?:db|schema)\.ts$/ },
      async ({ path }) => ({
        contents: await Bun.file(path.replace(/\.ts$/, ".sqlite.ts")).text(),
        loader: "ts",
      }),
    );
    build.onResolve(
      { filter: /(?:^|\/)shared\/database\/(db|schema)(?:\.ts)?$/ },
      ({ path }) => ({
        path: resolve(
          database,
          /\/schema(?:\.ts)?$/.test(path) ? "schema.sqlite.ts" : "db.sqlite.ts",
        ),
      }),
    );
    // db.ts itself imports ./schema; the desktop entry imports db.sqlite directly.
    build.onResolve({ filter: /^\.\/schema$/ }, ({ importer }) =>
      importer.startsWith(database)
        ? { path: resolve(database, "schema.sqlite.ts") }
        : undefined,
    );
  },
};
