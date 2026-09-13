"use client";
import hljs from "highlight.js/lib/common";
import { WrapText } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/components/ui/button";
import { CopyButton } from "@/shared/components/ui/copy-button";

export function CodeBlock({
  code,
  label = "code",
}: {
  code: string;
  label?: string;
}) {
  const [wrapped, setWrapped] = useState(false);
  const highlighted = useMemo(() => {
    const language = label.trim().toLowerCase();
    const explicit = language !== "code" && language !== "";
    // Keep very large blocks responsive and preserve unsupported formats as text.
    if (code.length > 50000 || (explicit && !hljs.getLanguage(language)))
      return {
        value: null,
        language: explicit ? label : "Plain text",
        detected: false,
      };
    try {
      const result = explicit
        ? hljs.highlight(code, { language, ignoreIllegals: true })
        : hljs.highlightAuto(code, [
            "javascript",
            "typescript",
            "python",
            "sql",
            "json",
            "bash",
            "xml",
            "css",
            "go",
            "java",
            "rust",
            "cpp",
            "csharp",
            "ruby",
            "yaml",
          ]);
      return {
        value: result.value,
        language: result.language || "Plain text",
        detected: !explicit && Boolean(result.language),
      };
    } catch {
      return { value: null, language: label, detected: false };
    }
  }, [code, label]);
  return (
    <div className="code-block my-5 min-w-0 overflow-hidden rounded-lg border border-line bg-canvas text-left">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-line px-3 py-1">
        <span
          className="min-w-0 truncate text-xs text-muted"
          title={
            highlighted.detected ? "Automatically detected language" : undefined
          }
        >
          {highlighted.language}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Wrap code"
            aria-pressed={wrapped}
            onClick={() => setWrapped((value) => !value)}
            className={wrapped ? "bg-elevated text-foreground" : undefined}
          >
            <WrapText size={14} />
            <span>Wrap</span>
          </Button>
          <CopyButton
            text={code}
            ariaLabel={`Copy ${highlighted.language} code`}
          />
        </div>
      </div>
      <pre
        tabIndex={0}
        aria-label={`${highlighted.language} code`}
        className={cn(
          "m-0 overflow-x-auto p-4 font-mono text-[13px] leading-6",
          wrapped
            ? "whitespace-pre-wrap [overflow-wrap:anywhere]"
            : "whitespace-pre",
        )}
      >
        {highlighted.value === null ? (
          <code>{code}</code>
        ) : (
          <code dangerouslySetInnerHTML={{ __html: highlighted.value }} />
        )}
      </pre>
    </div>
  );
}
