import { useId, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkHeadingIds } from "@/shared/lib/markdown-outline";
import { cn } from "@/shared/lib/cn";
import {
  markdownComponents,
  readingMarkdownComponents,
} from "@/shared/components/markdown/renderers";
export const Markdown = memo(function Markdown({
  children,
  headingPrefix,
  variant = "default",
}: {
  children: string;
  headingPrefix?: string;
  variant?: "default" | "reading";
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "markdown min-w-0 break-words",
        variant === "reading"
          ? "markdown-reading"
          : "text-[inherit] leading-[inherit]",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          [remarkHeadingIds, { prefix: headingPrefix ?? id + "-" }],
        ]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={
          variant === "reading" ? readingMarkdownComponents : markdownComponents
        }
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
