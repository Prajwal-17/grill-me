import type { Element, Root, RootContent } from "hast";

// Beautiful UI's word reveal, applied to Markdown text nodes. Node positions
// keep existing words stable as live chunks arrive; code/math remain untouched.
export function rehypeStreaming({ enabled }: { enabled: boolean }) {
  return (tree: Root) => {
    if (!enabled) return;
    function reveal(parent: Root | Element) {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === "element") {
          const classes = node.properties.className;
          const math =
            Array.isArray(classes) &&
            classes.some((value) => String(value).includes("katex"));
          if (
            !["pre", "code", "math", "svg", "script", "style"].includes(
              node.tagName,
            ) &&
            !math
          )
            reveal(node);
        }
        if (node.type !== "text" || !node.value.trim()) return [node];
        return (node.value.match(/\S+\s*|\s+/gu) ?? []).map((value) => ({
          type: "element",
          tagName: "span",
          properties: { className: ["stream-word"] },
          children: [{ type: "text", value }],
        }));
      });
    }
    reveal(tree);
  };
}
