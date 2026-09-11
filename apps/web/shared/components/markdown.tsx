"use client";
import { useId, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkHeadingIds } from "../lib/markdown-outline";
import { markdownComponents } from "./markdown/renderers";
export const Markdown = memo(function Markdown({
  children,
  headingPrefix,
}: {
  children: string;
  headingPrefix?: string;
}) {
  const id = useId();
  return (
    <div className="markdown min-w-0 break-words text-[inherit] leading-[inherit]">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          [remarkHeadingIds, { prefix: headingPrefix ?? id + "-" }],
        ]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
