import { type ReactNode } from "react";
import type { WorkspaceEditor } from "@repo/backend/shared/contracts";
import { cn } from "@/shared/lib/cn";
import vscodeLogo from "@/assets/editors/vscode.svg";

/**
 * Brand marks for the workspace editors the menu offers. Sources, licenses, and
 * usage notes live in `src/assets/editors/README.md`.
 */

type EditorIconProps = {
  size?: number;
  className?: string;
};

function SvgIcon({
  size = 16,
  className,
  viewBox,
  children,
}: EditorIconProps & {
  viewBox: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

function ZedMark(props: EditorIconProps) {
  return (
    <SvgIcon viewBox="0 0 96 96" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 6C7.34315 6 6 7.34315 6 9V75H0V9C0 4.02944 4.02944 0 9 0H89.3787C93.3878 0 95.3955 4.84715 92.5607 7.68198L43.0551 57.1875H57V51H63V58.6875C63 61.1728 60.9853 63.1875 58.5 63.1875H37.0551L26.7426 73.5H73.5V36H79.5V73.5C79.5 76.8137 76.8137 79.5 73.5 79.5H20.7426L10.2426 90H87C88.6569 90 90 88.6569 90 87V21H96V87C96 91.9706 91.9706 96 87 96H6.62132C2.61224 96 0.604504 91.1529 3.43934 88.318L52.7574 39H39V45H33V37.5C33 35.0147 35.0147 33 37.5 33H58.7574L69.2574 22.5H22.5V60H16.5V22.5C16.5 19.1863 19.1863 16.5 22.5 16.5H75.2574L85.7574 6H9Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
}

function CursorMark(props: EditorIconProps) {
  return (
    <SvgIcon viewBox="64 56 384 384" {...props}>
      <path
        d="m415.035 156.35-151.503-87.4695c-4.865-2.8094-10.868-2.8094-15.733 0l-151.4969 87.4695c-4.0897 2.362-6.6146 6.729-6.6146 11.459v176.383c0 4.73 2.5249 9.097 6.6146 11.458l151.5039 87.47c4.865 2.809 10.868 2.809 15.733 0l151.504-87.47c4.089-2.361 6.614-6.728 6.614-11.458v-176.383c0-4.73-2.525-9.097-6.614-11.459zm-9.516 18.528-146.255 253.32c-.988 1.707-3.599 1.01-3.599-.967v-165.872c0-3.314-1.771-6.379-4.644-8.044l-143.645-82.932c-1.707-.988-1.01-3.599.968-3.599h292.509c4.154 0 6.75 4.503 4.673 8.101h-.007z"
        fill="currentColor"
      />
    </SvgIcon>
  );
}

const logoFor: Partial<Record<WorkspaceEditor, string>> = {
  vscode: vscodeLogo,
};

export function WorkspaceEditorIcon({
  editor,
  size = 16,
  className,
}: EditorIconProps & { editor: WorkspaceEditor }) {
  if (editor === "zed") return <ZedMark size={size} className={className} />;
  if (editor === "cursor")
    return <CursorMark size={size} className={className} />;
  const logo = logoFor[editor];
  if (!logo) return null;
  return (
    <img
      src={logo}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("shrink-0 select-none", className)}
    />
  );
}
