import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceEditorOption } from "@repo/backend/shared/contracts";
import {
  editorChoices,
  editorLaunchTarget,
  resolveSelectedEditor,
} from "./workspace-editor-selection";

const vscode: WorkspaceEditorOption = { id: "vscode", label: "VS Code" };
const cursor: WorkspaceEditorOption = { id: "cursor", label: "Cursor" };
const zed: WorkspaceEditorOption = { id: "zed", label: "Zed" };
const folder: WorkspaceEditorOption = {
  id: "file-manager",
  label: "File manager",
};
const unsupported: WorkspaceEditorOption[] = [
  { id: "vscode-insiders", label: "VS Code Insiders" },
  { id: "vscodium", label: "VSCodium" },
  { id: "idea", label: "IntelliJ IDEA" },
  { id: "webstorm", label: "WebStorm" },
  { id: "pycharm", label: "PyCharm" },
];

test("only Cursor, Zed, and VS Code are offered, in that order", () => {
  const options = editorChoices([vscode, ...unsupported, zed, folder, cursor]);
  assert.deepEqual(
    options.map((option) => option.id),
    ["cursor", "zed", "vscode"],
  );
});

test("unsupported persisted editors fall back to the first permitted choice", () => {
  const options = editorChoices([vscode, ...unsupported, cursor]);
  assert.equal(resolveSelectedEditor(options, "vscode-insiders")?.id, "cursor");
  assert.equal(resolveSelectedEditor(options, "pycharm")?.id, "cursor");
  assert.equal(resolveSelectedEditor(options, "file-manager")?.id, "cursor");
});

test("menu selection changes the launch label without launching", () => {
  const options = [vscode, cursor];
  const selected = resolveSelectedEditor(options, "cursor");
  const target = editorLaunchTarget(selected);
  assert.equal(target.label, "Open in Cursor");
  assert.equal(target.folder, false);
});

test("the main action launches the selected editor", () => {
  const options = [vscode, cursor, zed];
  const target = editorLaunchTarget(resolveSelectedEditor(options, "zed"));
  assert.equal(target.editor, "zed");
  assert.equal(target.label, "Open in Zed");
});

test("refresh keeps the user's selection even when order changes", () => {
  const refreshed = [zed, cursor, vscode];
  assert.equal(resolveSelectedEditor(refreshed, "cursor")?.id, "cursor");
});

test("a selection that is no longer detected falls back to the first editor", () => {
  const changed = [vscode, cursor];
  assert.equal(resolveSelectedEditor(changed, "zed")?.id, "vscode");
});

test("a saved editor returns after a transient detection gap without being forgotten", () => {
  const saved = "cursor" as const;
  assert.equal(resolveSelectedEditor([], saved), null);
  assert.equal(resolveSelectedEditor([vscode], saved)?.id, "vscode");
  assert.equal(resolveSelectedEditor([vscode, cursor], saved)?.id, "cursor");
});

test("the folder is never restored as an editor selection", () => {
  assert.equal(
    resolveSelectedEditor([vscode, cursor], "file-manager")?.id,
    "vscode",
  );
});

test("no detected editor falls back to opening the folder", () => {
  const options = editorChoices([folder]);
  assert.deepEqual(options, []);
  assert.equal(resolveSelectedEditor(options, null), null);
  assert.deepEqual(editorLaunchTarget(null), {
    editor: "file-manager",
    label: "Open folder",
    folder: true,
  });
});
