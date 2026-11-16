import type {
  WorkspaceEditor,
  WorkspaceEditorOption,
} from "@repo/backend/shared/contracts";

/** Editors the workspace menu offers, in display order. */
const offeredEditors: readonly WorkspaceEditor[] = ["cursor", "zed", "vscode"];

/**
 * Editors offered as launch targets, limited to supported detected installs in
 * a stable order. The folder stays an explicit action and is never part of the
 * selectable list.
 */
export function editorChoices(
  options: readonly WorkspaceEditorOption[] | undefined,
): WorkspaceEditorOption[] {
  const detected = new Map(
    (options ?? []).map((option) => [option.id, option]),
  );
  return offeredEditors.flatMap((id) => {
    const option = detected.get(id);
    return option ? [option] : [];
  });
}

/**
 * Keep the user's selection while it is still detected; otherwise use the first
 * available editor. Returns null when no editor is available.
 */
export function resolveSelectedEditor(
  options: readonly WorkspaceEditorOption[],
  preferred: WorkspaceEditor | null,
): WorkspaceEditorOption | null {
  return (
    options.find((option) => option.id === preferred) ?? options[0] ?? null
  );
}

export type EditorLaunchTarget = {
  editor: WorkspaceEditor;
  label: string;
  folder: boolean;
};

/** The main button launches the selected editor, or the folder when none exists. */
export function editorLaunchTarget(
  selected: WorkspaceEditorOption | null,
): EditorLaunchTarget {
  return selected
    ? { editor: selected.id, label: `Open in ${selected.label}`, folder: false }
    : { editor: "file-manager", label: "Open folder", folder: true };
}
