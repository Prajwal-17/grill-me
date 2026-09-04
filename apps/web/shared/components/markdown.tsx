"use client";

import { Check, Copy } from "lucide-react";
import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = textFromNode(children).replace(/\n$/, "");
  const language = isValidElement<{ className?: string }>(children)
    ? children.props.className?.replace(/^language-/, "")
    : undefined;

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  }

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-line bg-[#0b0d10]">
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <span className="font-mono text-[10px] text-dim">
          {language || "code"}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] text-muted transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          onClick={copyCode}
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-xs leading-6 text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 break-words text-[inherit] leading-[inherit]">
      <ReactMarkdown
        components={{
          h1: ({ children: content }) => (
            <h1 className="mt-5 mb-2 text-lg leading-6 font-semibold tracking-[-0.02em] first:mt-0">
              {content}
            </h1>
          ),
          h2: ({ children: content }) => (
            <h2 className="mt-5 mb-2 text-base leading-6 font-semibold first:mt-0">
              {content}
            </h2>
          ),
          h3: ({ children: content }) => (
            <h3 className="mt-4 mb-1.5 text-sm font-semibold first:mt-0">
              {content}
            </h3>
          ),
          p: ({ children: content }) => (
            <p className="mb-3 last:mb-0">{content}</p>
          ),
          ul: ({ children: content }) => (
            <ul className="mb-3 list-disc space-y-1.5 pl-5 marker:text-muted last:mb-0">
              {content}
            </ul>
          ),
          ol: ({ children: content }) => (
            <ol className="mb-3 list-decimal space-y-1.5 pl-5 marker:text-muted last:mb-0">
              {content}
            </ol>
          ),
          li: ({ children: content }) => <li className="pl-0.5">{content}</li>,
          strong: ({ children: content }) => (
            <strong className="font-semibold text-foreground">{content}</strong>
          ),
          a: ({ children: content, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand underline decoration-brand/35 underline-offset-2 transition-colors hover:text-blue-300 hover:decoration-current"
            >
              {content}
            </a>
          ),
          code: ({ children: content, className }) => (
            <code
              className={
                className ||
                "rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.88em] text-blue-100"
              }
            >
              {content}
            </code>
          ),
          blockquote: ({ children: content }) => (
            <blockquote className="my-4 border-l-2 border-brand/60 pl-3 text-muted [&>p]:mb-0">
              {content}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-line" />,
          pre: ({ children: content }) => <CodeBlock>{content}</CodeBlock>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
