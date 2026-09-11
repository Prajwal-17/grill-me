"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CodeBlock({
  code,
  label = "code",
}: {
  code: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_400);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-line bg-canvas text-left">
      <div className="flex h-10 items-center justify-between border-b border-line px-3">
        <span className="truncate font-mono text-xs text-muted">{label}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          onClick={copyCode}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {copyError && (
        <p role="alert" className="px-3 py-2 text-xs">
          Clipboard unavailable. Select and copy the code.
        </p>
      )}
      <div className="overflow-x-auto py-3 font-mono text-xs leading-6 text-foreground">
        {lines.map((line, index) => (
          <div className="grid min-w-max grid-cols-[3rem_1fr] px-3" key={index}>
            <span
              className="select-none pr-4 text-right text-dim"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <code className="whitespace-pre pr-4">{line || " "}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
