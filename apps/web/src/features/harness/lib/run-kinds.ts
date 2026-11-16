import {
  Bot,
  ClipboardCheck,
  FolderGit2,
  Lightbulb,
  MessagesSquare,
} from "lucide-react";

const kindMeta = {
  project_scaffold: { label: "Preparation", icon: FolderGit2 },
  review: { label: "Review", icon: ClipboardCheck },
  chat: { label: "Discussion", icon: MessagesSquare },
  hint: { label: "Hint", icon: Lightbulb },
} as const;

export function runKindMeta(kind: string) {
  return (
    kindMeta[kind as keyof typeof kindMeta] ?? {
      label: kind.replaceAll("_", " "),
      icon: Bot,
    }
  );
}
