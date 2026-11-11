import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import type { Root } from "mdast";

export type OutlineItem = { id: string; title: string; depth: number };

function headings(tree: Root, prefix: string) {
  const slugger = new GithubSlugger();
  const outline: OutlineItem[] = [];
  visit(tree, "heading", (node) => {
    const title = toString(node);
    const id = prefix + slugger.slug(title);
    node.data = {
      ...node.data,
      hProperties: { ...node.data?.hProperties, id },
    };
    outline.push({ id, title, depth: node.depth });
  });
  return outline;
}
export function markdownOutline(markdown: string, prefix: string) {
  return headings(
    unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown),
    prefix,
  );
}
export function remarkHeadingIds(options: { prefix: string }) {
  return (tree: Root) => {
    const outline = headings(tree, options.prefix);
    const anchors = new Map(
      outline.map((item) => [item.id.slice(options.prefix.length), item.id]),
    );
    visit(tree, "link", (node) => {
      if (!node.url.startsWith("#")) return;
      let fragment = node.url.slice(1);
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        return;
      }
      const id = anchors.get(fragment);
      if (id) node.url = "#" + id;
    });
  };
}
