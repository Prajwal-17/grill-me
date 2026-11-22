import { createHash } from "node:crypto";
import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProjectWorkspace,
  deleteProjectJournal,
  openProjectWorkspace,
  projectDirectoryName,
  projectFileRecord,
  projectLayout,
  projectRelativePath,
  readProjectJournal,
  withGeneratedFile,
  writeProjectJournal,
} from "@repo/backend/modules/challenges/project-workspace";
import {
  createProjectTools,
  projectToolJournalContext,
  type ProjectToolActivity,
} from "@repo/backend/modules/ai/agent/tools/project";

const roots: string[] = [];

async function tempRoot() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "grill-project-tools-")),
  );
  roots.push(root);
  return root;
}

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

type FixtureOptions = {
  limits?: Parameters<typeof createProjectTools>[0]["limits"];
  onActivity?: (activity: ProjectToolActivity) => void | Promise<void>;
  signal?: AbortSignal;
  journal?: Parameters<typeof projectToolJournalContext>[1];
};

async function fixture(options: FixtureOptions = {}) {
  const root = await tempRoot();
  const created = await createProjectWorkspace({ root });
  const tools = createProjectTools({
    root: created.layout.projectRoot,
    journal: projectToolJournalContext(created.layout, options.journal),
    limits: options.limits,
    onActivity: options.onActivity,
    signal: options.signal,
  });
  const tool = (name: string) => {
    const found = tools.find((entry) => entry.name === name);
    if (!found) throw new Error(`Missing project tool ${name}`);
    return found;
  };
  return {
    root,
    layout: created.layout,
    journal: created.journal,
    tools,
    tool,
  };
}

function text(result: { content: { type: string; text?: string }[] }) {
  return result.content.find((entry) => entry.type === "text")?.text ?? "";
}

describe("project workspace layout and journal", () => {
  test("builds stable attempt names and rejects unsafe project paths", () => {
    expect(projectDirectoryName(1)).toBe("project");
    expect(projectDirectoryName(2)).toBe("project-2");
    const layout = projectLayout("/tmp/challenge-workspace", 2);
    expect(layout).toMatchObject({
      projectDirectory: "project-2",
      projectRoot: "/tmp/challenge-workspace/project-2",
      artifactsRoot: "/tmp/challenge-workspace/artifacts",
      metadataRoot: "/tmp/challenge-workspace/.grill-me",
      journalPath: "/tmp/challenge-workspace/.grill-me/projects/project-2.json",
    });
    expect(() => projectDirectoryName(0)).toThrow("between 1 and 99");
    expect(() => projectLayout("relative")).toThrow("absolute path");
    expect(() => projectLayout("/")).toThrow("filesystem root");

    expect(projectRelativePath("src/math.ts")).toBe("src/math.ts");
    for (const path of [
      "",
      " ",
      "../outside.ts",
      "src/../outside.ts",
      "./src/math.ts",
      "src//math.ts",
      "/etc/passwd",
      "C:/Windows/file.ts",
      "src\\math.ts",
      "src/math\0.ts",
      ".grill-me/project.json",
      ".GRILL-ME/project.json",
      ".git/config",
      ".env",
      ".envrc",
      "src/.env.local",
      "secrets.json",
      ".npmrc",
      "node_modules/pkg/index.js",
      "a".repeat(513),
    ]) {
      expect(() => projectRelativePath(path)).toThrow();
    }
  });

  test("creates fresh project-N attempts without touching earlier attempts", async () => {
    const root = await tempRoot();
    const first = await createProjectWorkspace({ root });
    expect(first.layout.projectDirectory).toBe("project");
    expect(first.journal.files).toEqual({});
    expect(await readdir(first.layout.projectRoot)).toEqual([]);
    expect((await stat(first.layout.artifactsRoot)).isDirectory()).toBe(true);
    expect((await stat(first.layout.metadataRoot)).isDirectory()).toBe(true);
    await writeFile(join(first.layout.projectRoot, "keep.ts"), "keep\n");

    const second = await createProjectWorkspace({ root });
    expect(second.layout.projectDirectory).toBe("project-2");
    expect(
      await readFile(join(first.layout.projectRoot, "keep.ts"), "utf8"),
    ).toBe("keep\n");
    expect(second.layout.journalPath).not.toBe(first.layout.journalPath);
    expect(await readProjectJournal(second.layout)).toMatchObject({
      projectDirectory: "project-2",
      files: {},
    });

    expect((await openProjectWorkspace({ root })).layout.projectDirectory).toBe(
      "project-2",
    );
    expect(
      (await openProjectWorkspace({ root, projectDirectory: "project" }))
        .journal,
    ).toMatchObject({ projectDirectory: "project" });
  });

  test("creates a project under a nested challenge workspace path", async () => {
    const parent = await tempRoot();
    const root = join(parent, "profiles", "profile", "challenge");
    const created = await createProjectWorkspace({ root });
    expect(created.layout.workspaceRoot).toBe(root);
    expect((await stat(join(root, "project"))).isDirectory()).toBe(true);
    expect((await stat(join(root, "artifacts"))).isDirectory()).toBe(true);
    expect(
      (
        await stat(join(root, ".grill-me", "projects", "project.json"))
      ).isFile(),
    ).toBe(true);
  });

  test("fails closed for missing, corrupt, and symlinked journals", async () => {
    const root = await tempRoot();
    const created = await createProjectWorkspace({ root });
    await deleteProjectJournal(created.layout);
    expect(await readProjectJournal(created.layout)).toBeNull();

    const tools = createProjectTools({
      root: created.layout.projectRoot,
      journal: projectToolJournalContext(created.layout),
    });
    const create = tools.find((tool) => tool.name === "create_project_file")!;
    const createdFile = await create.execute(
      "call",
      { path: "src/ready.ts", content: "export const ready = true;\n" },
      undefined,
    );
    expect(text(createdFile)).toContain("Created src/ready.ts");
    expect(await readProjectJournal(created.layout)).toMatchObject({
      projectDirectory: "project",
    });

    await writeFile(created.layout.journalPath, "{ not json");
    const list = tools.find((tool) => tool.name === "list_project_files")!;
    await expect(list.execute("call", {}, undefined)).rejects.toMatchObject({
      code: "PROJECT_METADATA_INVALID",
    });
    await expect(
      create.execute(
        "call",
        { path: "src/other.ts", content: "other\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_METADATA_INVALID" });
    expect(
      await readFile(
        join(created.layout.projectRoot, "src", "ready.ts"),
        "utf8",
      ),
    ).toBe("export const ready = true;\n");

    const outside = await tempRoot();
    const outsideJournal = join(outside, "project.json");
    await writeFile(outsideJournal, "{}\n");
    await rm(created.layout.journalPath);
    await symlink(outsideJournal, created.layout.journalPath);
    await expect(readProjectJournal(created.layout)).rejects.toMatchObject({
      code: "PROJECT_METADATA_INVALID",
    });

    const outsideProjects = await tempRoot();
    const outsideAttempt = join(outsideProjects, "project.json");
    await writeFile(outsideAttempt, "{}\n");
    await rm(join(created.layout.metadataRoot, "projects"), {
      recursive: true,
      force: true,
    });
    await symlink(
      outsideProjects,
      join(created.layout.metadataRoot, "projects"),
    );
    await expect(readProjectJournal(created.layout)).rejects.toMatchObject({
      code: "PROJECT_METADATA_INVALID",
    });
    await expect(deleteProjectJournal(created.layout)).rejects.toMatchObject({
      code: "PROJECT_METADATA_INVALID",
    });
    expect(await readFile(outsideAttempt, "utf8")).toBe("{}\n");
  });

  test("records the exact generated hash before and after a write", async () => {
    const { layout, tool } = await fixture();
    const content =
      "export function add(a: number, b: number) { return a + b; }\n";
    const created = await tool("create_project_file").execute(
      "call",
      { path: "src/add.ts", content },
      undefined,
    );
    const journal = await readProjectJournal(layout);
    const record = journal!.files["src/add.ts"]!;
    expect(record).toMatchObject({
      sha256: createHash("sha256").update(content).digest("hex"),
      bytes: Buffer.byteLength(content),
    });
    expect(text(created)).toContain(
      `Created src/add.ts (${record.bytes} bytes)`,
    );
  });
});

describe("project filesystem tools", () => {
  test("creates nested directories and files, reads lines, searches, and edits exactly", async () => {
    const { layout, tool } = await fixture();
    await tool("create_project_directory").execute(
      "call",
      { path: "src/features/nested" },
      undefined,
    );
    expect(
      (
        await stat(join(layout.projectRoot, "src/features/nested"))
      ).isDirectory(),
    ).toBe(true);

    const content = "alpha\nbeta\nalpha\n";
    await tool("create_project_file").execute(
      "call",
      { path: "src/features/nested/words.ts", content },
      undefined,
    );
    await expect(
      tool("create_project_file").execute(
        "call",
        { path: "src/features/nested/words.ts", content: "replace\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_FILE_EXISTS" });

    const full = await tool("read_project_file").execute(
      "call",
      { path: "src/features/nested/words.ts" },
      undefined,
    );
    expect(text(full)).toBe(content);
    const lines = await tool("read_project_file").execute(
      "call",
      { path: "src/features/nested/words.ts", startLine: 2, lineCount: 1 },
      undefined,
    );
    expect(text(lines)).toContain("beta");
    expect(text(lines)).toContain("lines 2–2 of 4");

    await expect(
      tool("edit_project_file").execute(
        "call",
        {
          path: "src/features/nested/words.ts",
          oldText: "alpha",
          newText: "gamma",
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_EDIT_AMBIGUOUS" });
    const replaced = await tool("edit_project_file").execute(
      "call",
      {
        path: "src/features/nested/words.ts",
        oldText: "alpha",
        newText: "gamma",
        replaceAll: true,
      },
      undefined,
    );
    expect(text(replaced)).toContain("2 replacements");
    expect(
      await readFile(
        join(layout.projectRoot, "src/features/nested/words.ts"),
        "utf8",
      ),
    ).toBe("gamma\nbeta\ngamma\n");
    await expect(
      tool("edit_project_file").execute(
        "call",
        {
          path: "src/features/nested/words.ts",
          oldText: "missing",
          newText: "x",
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_EDIT_NOT_FOUND" });
    expect(
      await readFile(
        join(layout.projectRoot, "src/features/nested/words.ts"),
        "utf8",
      ),
    ).toBe("gamma\nbeta\ngamma\n");

    const list = await tool("list_project_files").execute(
      "call",
      {},
      undefined,
    );
    expect(text(list)).toContain("src/features/nested/words.ts");
    const rootList = await tool("list_project_files").execute(
      "call",
      { path: "." },
      undefined,
    );
    expect(text(rootList)).toContain("src/features/nested/words.ts");
    const search = await tool("search_project_files").execute(
      "call",
      { query: "BETA" },
      undefined,
    );
    expect(text(search)).toContain("src/features/nested/words.ts:2: beta");
  });

  test("rejects traversal, absolute, metadata, secret, and symlink paths", async () => {
    const { layout, tool } = await fixture();
    const outside = await tempRoot();
    await writeFile(join(outside, "secret.ts"), "outside\n");
    await symlink(outside, join(layout.projectRoot, "linked"));
    await symlink(
      join(outside, "secret.ts"),
      join(layout.projectRoot, "linked-file.ts"),
    );

    for (const path of [
      "../outside.ts",
      "/etc/passwd",
      "src/../outside.ts",
      ".grill-me/project.json",
      ".env",
      "src/.env.local",
    ]) {
      await expect(
        tool("read_project_file").execute("call", { path }, undefined),
      ).rejects.toMatchObject({ code: "PROJECT_PATH_INVALID" });
      await expect(
        tool("create_project_file").execute(
          "call",
          { path, content: "blocked\n" },
          undefined,
        ),
      ).rejects.toMatchObject({ code: "PROJECT_PATH_INVALID" });
    }

    await expect(
      tool("read_project_file").execute(
        "call",
        { path: "linked/secret.ts" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_PATH_INVALID" });
    await expect(
      tool("read_project_file").execute(
        "call",
        { path: "linked-file.ts" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_PATH_INVALID" });
    await expect(
      tool("create_project_file").execute(
        "call",
        { path: "linked/new.ts", content: "escape\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_PATH_INVALID" });
    expect(await readdir(outside)).toEqual(["secret.ts"]);

    await rm(join(layout.projectRoot, "src"), { recursive: true, force: true });
    await symlink(outside, join(layout.projectRoot, "src"));
    await expect(
      tool("create_project_file").execute(
        "call",
        { path: "src/new.ts", content: "escape\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_PATH_INVALID" });
    expect(await readdir(outside)).toEqual(["secret.ts"]);
  });

  test("rejects a symlinked project tools root", async () => {
    const { root, layout } = await fixture();
    const link = join(root, "project-link");
    await symlink(layout.projectRoot, link);
    const tools = createProjectTools({
      root: link,
      journal: {
        metadataRoot: layout.metadataRoot,
        journalPath: layout.journalPath,
        projectDirectory: layout.projectDirectory,
      },
    });
    await expect(
      tools
        .find((tool) => tool.name === "create_project_file")!
        .execute("call", { path: "escape.ts", content: "x\n" }, undefined),
    ).rejects.toMatchObject({ code: "PROJECT_LAYOUT_INVALID" });
  });

  test("never silently overwrites untracked or user-edited files", async () => {
    const { layout, tool } = await fixture();
    await writeFile(join(layout.projectRoot, "notes.md"), "user notes\n");
    await expect(
      tool("create_project_file").execute(
        "call",
        { path: "notes.md", content: "replacement\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_FILE_EXISTS" });
    await expect(
      tool("edit_project_file").execute(
        "call",
        { path: "notes.md", oldText: "user", newText: "app" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_FILE_UNTRACKED" });
    expect(await readFile(join(layout.projectRoot, "notes.md"), "utf8")).toBe(
      "user notes\n",
    );

    await tool("create_project_file").execute(
      "call",
      { path: "src/generated.ts", content: "export const value = 1;\n" },
      undefined,
    );
    await writeFile(
      join(layout.projectRoot, "src/generated.ts"),
      "export const value = 2;\n",
    );
    await expect(
      tool("edit_project_file").execute(
        "call",
        {
          path: "src/generated.ts",
          oldText: "value = 1",
          newText: "value = 3",
        },
        undefined,
      ),
    ).rejects.toMatchObject({
      code: "PROJECT_FILE_MODIFIED",
      details: { path: "src/generated.ts" },
    });
    expect(
      await readFile(join(layout.projectRoot, "src/generated.ts"), "utf8"),
    ).toBe("export const value = 2;\n");
  });

  test("does not resurrect stale metadata after a failed write", async () => {
    const { layout, tool } = await fixture();
    const path = "src/stable.ts";
    const content = "export const stable = true;\n";
    await tool("create_project_file").execute(
      "call",
      { path, content },
      undefined,
    );
    const before = await readProjectJournal(layout);
    await expect(
      tool("edit_project_file").execute(
        "call",
        { path, oldText: "not present", newText: "x" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_EDIT_NOT_FOUND" });
    expect(await readProjectJournal(layout)).toEqual(before);
    expect(await readFile(join(layout.projectRoot, path), "utf8")).toBe(
      content,
    );
  });

  test("fails closed when the journal references a file with a different hash", async () => {
    const { layout, tool } = await fixture();
    const path = "src/crash.ts";
    const expected = "expected content\n";
    const actual = "partial content\n";
    await mkdir(join(layout.projectRoot, "src"));
    await writeFile(join(layout.projectRoot, path), actual);
    const journal = {
      version: 1 as const,
      projectDirectory: layout.projectDirectory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: {},
    };
    await writeProjectJournal(
      layout,
      withGeneratedFile(journal, path, projectFileRecord(expected)),
    );
    await expect(
      tool("edit_project_file").execute(
        "call",
        { path, oldText: "partial", newText: "changed" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_FILE_MODIFIED" });
    expect(await readFile(join(layout.projectRoot, path), "utf8")).toBe(actual);
  });

  test("enforces file, search, listing, and read limits", async () => {
    const { layout, tool } = await fixture({
      limits: {
        maxFileBytes: 8,
        maxReadBytes: 8,
        maxProjectFiles: 1,
        maxListEntries: 2,
        maxSearchResults: 2,
      },
    });
    await expect(
      tool("create_project_file").execute(
        "call",
        { path: "src/large.ts", content: "greater than eight bytes\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_FILE_TOO_LARGE" });
    await tool("create_project_file").execute(
      "call",
      { path: "src/one.ts", content: "1234" },
      undefined,
    );
    await expect(
      tool("create_project_file").execute(
        "call",
        { path: "src/two.ts", content: "2" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_LIMIT_REACHED" });
    await writeFile(join(layout.projectRoot, "src/search.ts"), "hit\nhit\n");
    const search = await tool("search_project_files").execute(
      "call",
      { query: "hit", maxResults: 2 },
      undefined,
    );
    expect(text(search).match(/hit/g)).toHaveLength(2);
    expect(text(search)).toContain("search stopped");
    await writeFile(join(layout.projectRoot, "src/huge.ts"), "0123456789");
    await expect(
      tool("read_project_file").execute(
        "call",
        { path: "src/huge.ts" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_FILE_TOO_LARGE" });
    const list = await tool("list_project_files").execute(
      "call",
      { path: "src" },
      undefined,
    );
    expect(text(list)).toContain("listing truncated");
  });

  test("reports activities and preserves files when cancelled", async () => {
    const activities: ProjectToolActivity[] = [];
    const controller = new AbortController();
    const { layout, tool } = await fixture({
      onActivity: (activity) => {
        activities.push(activity);
      },
      signal: controller.signal,
    });
    await tool("create_project_directory").execute(
      "call",
      { path: "src/reporting" },
      undefined,
    );
    await tool("create_project_file").execute(
      "call",
      { path: "src/reporting/notes.ts", content: "report\n" },
      undefined,
    );
    await tool("edit_project_file").execute(
      "call",
      {
        path: "src/reporting/notes.ts",
        oldText: "report",
        newText: "reported",
      },
      undefined,
    );
    await tool("read_project_file").execute(
      "call",
      { path: "src/reporting/notes.ts" },
      undefined,
    );
    await tool("search_project_files").execute(
      "call",
      { query: "reported" },
      undefined,
    );
    await tool("list_project_files").execute("call", {}, undefined);
    expect(activities.map((activity) => activity.type)).toEqual([
      "created_directory",
      "created_file",
      "edited_file",
      "read",
      "searched",
      "listed",
    ]);

    controller.abort();
    await expect(
      tool("create_project_file").execute(
        "call",
        { path: "src/cancelled.ts", content: "no\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_OPERATION_CANCELLED" });
    expect(
      await stat(join(layout.projectRoot, "src/cancelled.ts")).catch(
        () => null,
      ),
    ).toBeNull();
    expect(
      await readFile(
        join(layout.projectRoot, "src/reporting/notes.ts"),
        "utf8",
      ),
    ).toBe("reported\n");
  });

  test("supports an in-memory journal context when the journal file is absent", async () => {
    const { layout } = await fixture();
    await deleteProjectJournal(layout);
    const seeded = {
      version: 1 as const,
      projectDirectory: layout.projectDirectory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: {},
    };
    const tools = createProjectTools({
      root: layout.projectRoot,
      journal: projectToolJournalContext(layout, seeded),
    });
    const create = tools.find((tool) => tool.name === "create_project_file")!;
    await create.execute(
      "call",
      { path: "src/seeded.ts", content: "seed\n" },
      undefined,
    );
    expect(await readProjectJournal(layout)).toMatchObject({
      files: { "src/seeded.ts": { bytes: 5 } },
    });
  });
});
