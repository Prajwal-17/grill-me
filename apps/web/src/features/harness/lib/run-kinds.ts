import { Bot, ClipboardCheck, FolderGit2 } from "lucide-react";

const kindMeta = {
  project_scaffold: { label: "Preparation", icon: FolderGit2 },
  review: { label: "Review", icon: ClipboardCheck },
} as const;

export function runKindMeta(kind: string) {
  return (
    kindMeta[kind as keyof typeof kindMeta] ?? {
      label: kind.replaceAll("_", " "),
      icon: Bot,
    }
  );
}
