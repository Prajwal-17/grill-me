import { afterAll, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  completeFirstRun,
  defaultWorkspaceRoot,
  hasExistingData,
  isSelectableFolderParent,
  isSelectableLocalRoot,
  readSetupConfig,
  resolveStartup,
  SETUP_CONFIG_FILE,
  setupConfigSchema,
  writeSetupConfig,
  type StartupOptions,
} from "../src/setup";

const roots: string[] = [];
async function tempRoot(prefix = "grill-setup-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

function startup(configRoot: string): StartupOptions {
  return {
    configRoot,
    channel: "production",
    dataFolderName: "Grill Me",
    workspaceFolderName: "Grill Me Workspaces",
  };
}

describe("desktop first-run setup", () => {
  test("validates absolute roots, parents, and stored records", () => {
    expect(isSelectableLocalRoot("/tmp/grill-data")).toBe(true);
    expect(isSelectableLocalRoot("/tmp/legal\\backslash")).toBe(true);
    expect(isSelectableLocalRoot("/")).toBe(false);
    expect(isSelectableLocalRoot("/tmp/..")).toBe(false);
    expect(isSelectableLocalRoot("relative/data")).toBe(false);
    expect(isSelectableLocalRoot("/tmp/data\0")).toBe(false);
    expect(isSelectableLocalRoot("/" + "a".repeat(4096))).toBe(false);
    expect(isSelectableFolderParent("/")).toBe(true);
    expect(isSelectableFolderParent("/tmp")).toBe(true);
    expect(isSelectableFolderParent("relative")).toBe(false);

    const valid = setupConfigSchema.safeParse({
      version: 1,
      channel: "production",
      completedAt: new Date().toISOString(),
      dataRoot: "/tmp/grill-data",
      workspaceRoot: "/tmp/grill-workspaces",
    });
    expect(valid.success).toBe(true);
    for (const patch of [
      { dataRoot: "relative" },
      { dataRoot: "/" },
      { dataRoot: "/tmp/.." },
      { dataRoot: "/tmp/a\0b" },
      { extra: true },
    ]) {
      expect(
        setupConfigSchema.safeParse({
          version: 1,
          channel: "production",
          completedAt: new Date().toISOString(),
          dataRoot: "/tmp/grill-data",
          workspaceRoot: "/tmp/grill-workspaces",
          ...patch,
        }).success,
      ).toBe(false);
    }
  });

  test("a fresh install asks for setup without creating data or config", async () => {
    const root = await tempRoot();
    const resolved = await resolveStartup(startup(root));
    expect(resolved).toMatchObject({
      kind: "setup",
      error: null,
      saved: null,
      defaults: {
        dataRoot: root,
        workspaceRoot: defaultWorkspaceRoot(root),
      },
    });
    expect(await hasExistingData(root)).toBe(false);
    expect(await readdir(root)).toEqual([]);
    expect((await readSetupConfig(root, "production")).found).toBe(false);
  });

  test("defaults persist atomically and create the edition workspace layout", async () => {
    const root = await tempRoot();
    const options = startup(root);
    const selection = await completeFirstRun({
      ...options,
      choice: { dataParent: null, workspaceParent: null },
    });
    const canonicalRoot = await realpath(root);
    expect(selection).toEqual({
      dataRoot: canonicalRoot,
      workspaceRoot: await realpath(defaultWorkspaceRoot(canonicalRoot)),
    });
    const stored = await readSetupConfig(root, "production");
    expect(stored.config).toMatchObject({
      version: 1,
      channel: "production",
      dataRoot: selection.dataRoot,
      workspaceRoot: selection.workspaceRoot,
    });
    expect((await stat(join(root, SETUP_CONFIG_FILE))).mode & 0o777).toBe(
      0o600,
    );
    expect(
      (await readFile(join(root, SETUP_CONFIG_FILE), "utf8")).endsWith("\n"),
    ).toBe(true);
    expect(
      (await readdir(root)).filter((name) => name.includes(".tmp")),
    ).toEqual([]);
    expect((await stat(selection.workspaceRoot)).isDirectory()).toBe(true);
    expect((await resolveStartup(options)).kind).toBe("ready");
  });

  test("custom parents get named child folders and existing contents survive", async () => {
    const configRoot = await tempRoot();
    const dataParent = await tempRoot();
    const workspaceParent = await tempRoot();
    await writeFile(join(dataParent, "keep.txt"), "keep me\n");
    const selection = await completeFirstRun({
      ...startup(configRoot),
      choice: {
        dataParent,
        workspaceParent,
      },
    });
    const canonicalDataParent = await realpath(dataParent);
    const canonicalWorkspaceParent = await realpath(workspaceParent);
    expect(selection.dataRoot).toBe(join(canonicalDataParent, "Grill Me"));
    expect(selection.workspaceRoot).toBe(
      join(canonicalWorkspaceParent, "Grill Me Workspaces"),
    );
    expect((await stat(selection.dataRoot)).isDirectory()).toBe(true);
    expect((await stat(selection.workspaceRoot)).isDirectory()).toBe(true);
    expect((await readdir(dataParent)).sort()).toEqual([
      "Grill Me",
      "keep.txt",
    ]);
    expect(await readFile(join(dataParent, "keep.txt"), "utf8")).toBe(
      "keep me\n",
    );
    expect(
      (await readdir(dataParent)).some((name) => name.endsWith(".sqlite")),
    ).toBe(false);

    await writeFile(join(selection.dataRoot, "user-file.txt"), "preserve\n");
    const again = await completeFirstRun({
      ...startup(configRoot),
      choice: {
        dataParent,
        workspaceParent,
      },
    });
    expect(again).toEqual(selection);
    expect(
      await readFile(join(selection.dataRoot, "user-file.txt"), "utf8"),
    ).toBe("preserve\n");
  });

  test("an existing default installation is adopted without moving anything", async () => {
    const root = await tempRoot();
    const database = join(root, "grill-me.sqlite");
    const secrets = join(root, "secrets.json");
    await writeFile(database, "legacy-database\n");
    await writeFile(secrets, '{"legacy":true}\n', { mode: 0o600 });
    const resolved = await resolveStartup(startup(root));
    expect(resolved).toMatchObject({
      kind: "ready",
      existing: true,
      dataRoot: await realpath(root),
      workspaceRoot: defaultWorkspaceRoot(await realpath(root)),
    });
    expect(await readFile(database, "utf8")).toBe("legacy-database\n");
    expect(await readFile(secrets, "utf8")).toBe('{"legacy":true}\n');
    expect(await stat(join(root, "workspaces")).catch(() => null)).toBeNull();
    expect((await readSetupConfig(root, "production")).config).toMatchObject({
      dataRoot: await realpath(root),
      workspaceRoot: defaultWorkspaceRoot(await realpath(root)),
    });
  });

  test("saved custom locations survive restarts", async () => {
    const configRoot = await tempRoot();
    const dataRoot = join(await tempRoot(), "Grill Me");
    const workspaceRoot = join(await tempRoot(), "Grill Me Workspaces");
    await mkdir(dataRoot);
    await mkdir(workspaceRoot);
    await writeSetupConfig(configRoot, {
      version: 1,
      channel: "production",
      completedAt: new Date().toISOString(),
      dataRoot: await realpath(dataRoot),
      workspaceRoot: await realpath(workspaceRoot),
    });
    const resolved = await resolveStartup(startup(configRoot));
    expect(resolved).toMatchObject({
      kind: "ready",
      existing: false,
      dataRoot: await realpath(dataRoot),
      workspaceRoot: await realpath(workspaceRoot),
    });
  });

  test("missing saved data opens setup instead of falling back to a new database", async () => {
    const configRoot = await tempRoot();
    const missingData = join(await tempRoot(), "detached-drive", "Grill Me");
    const missingWorkspace = join(
      await tempRoot(),
      "detached-drive",
      "Grill Me Workspaces",
    );
    await writeSetupConfig(configRoot, {
      version: 1,
      channel: "production",
      completedAt: new Date().toISOString(),
      dataRoot: missingData,
      workspaceRoot: missingWorkspace,
    });
    const resolved = await resolveStartup(startup(configRoot));
    expect(resolved).toMatchObject({
      kind: "setup",
      saved: { dataRoot: missingData, workspaceRoot: missingWorkspace },
    });
    expect(resolved.kind === "setup" && resolved.error).toContain(
      "unavailable",
    );
    expect(
      await stat(join(configRoot, "grill-me.sqlite")).catch(() => null),
    ).toBeNull();
  });

  test("a corrupt setup record does not silently adopt default data", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "grill-me.sqlite"), "legacy-database\n");
    await writeFile(join(root, SETUP_CONFIG_FILE), "{not json\n");
    const resolved = await resolveStartup(startup(root));
    expect(resolved.kind).toBe("setup");
    expect(resolved.kind === "setup" && resolved.saved).toBeNull();
    expect(resolved.kind === "setup" && resolved.error).toContain(
      "could not be read",
    );
    expect(await readFile(join(root, "grill-me.sqlite"), "utf8")).toBe(
      "legacy-database\n",
    );
    expect(await readFile(join(root, SETUP_CONFIG_FILE), "utf8")).toBe(
      "{not json\n",
    );
  });

  test("setup records are isolated by channel and edition folder names", async () => {
    const productionRoot = await tempRoot();
    const developmentRoot = await tempRoot();
    const production = await completeFirstRun({
      ...startup(productionRoot),
      choice: { dataParent: null, workspaceParent: null },
    });
    const development = await completeFirstRun({
      configRoot: developmentRoot,
      channel: "development",
      dataFolderName: "Grill Me Dev",
      workspaceFolderName: "Grill Me Dev Workspaces",
      choice: { dataParent: null, workspaceParent: null },
    });
    expect(production.dataRoot).not.toBe(development.dataRoot);
    expect(production.workspaceRoot).not.toBe(development.workspaceRoot);
    expect(
      (await readSetupConfig(productionRoot, "development")).config,
    ).toBeNull();
    expect(
      (await readSetupConfig(productionRoot, "development")).error,
    ).toContain("different edition");
    expect(
      (await readSetupConfig(productionRoot, "production")).config,
    ).not.toBeNull();
    expect(
      (await readSetupConfig(developmentRoot, "development")).config,
    ).not.toBeNull();
  });

  test("unusable parent locations leave setup incomplete", async () => {
    const configRoot = await tempRoot();
    const fileParent = join(await tempRoot(), "not-a-folder");
    await writeFile(fileParent, "fixture\n");
    await expect(
      completeFirstRun({
        ...startup(configRoot),
        choice: { dataParent: fileParent, workspaceParent: null },
      }),
    ).rejects.toThrow(/unavailable/);
    expect((await readSetupConfig(configRoot, "production")).found).toBe(false);
    expect(
      await stat(join(configRoot, "grill-me.sqlite")).catch(() => null),
    ).toBeNull();
  });

  test.skipIf(process.getuid?.() === 0)(
    "permission failures leave setup incomplete and do not start a database",
    async () => {
      const configRoot = await tempRoot();
      const parent = await tempRoot();
      await chmod(parent, 0o500);
      try {
        await expect(
          completeFirstRun({
            ...startup(configRoot),
            choice: { dataParent: parent, workspaceParent: null },
          }),
        ).rejects.toThrow(/unavailable|could not create or use/);
        expect((await readSetupConfig(configRoot, "production")).found).toBe(
          false,
        );
        expect(
          await stat(join(configRoot, "grill-me.sqlite")).catch(() => null),
        ).toBeNull();
      } finally {
        await chmod(parent, 0o700);
      }
    },
  );
});
