import { isValidElement, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { CodeBlock } from "@/shared/components/ui/code-block";

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

function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const code = textFromNode(children).replace(/\n$/, "");
  const language = isValidElement<{ className?: string }>(children)
    ? children.props.className?.replace(/^language-/, "")
    : undefined;

  return <CodeBlock code={code} label={language || "code"} />;
}

function createMarkdownComponents(reading: boolean): Components {
  const type = reading
    ? {
        h1: "mt-8 mb-3 text-title font-semibold first:mt-0",
        h2: "mt-6 mb-2 text-section font-semibold first:mt-0",
        h3: "mt-5 mb-2 text-question font-semibold first:mt-0",
        h4: "mt-4 mb-2 text-prose font-semibold first:mt-0",
        h5: "mt-4 mb-1.5 text-ui font-semibold",
        h6: "mt-4 mb-1.5 text-ui font-medium text-muted",
        p: "mb-4 last:mb-0",
        list: "mb-5 list-disc space-y-2 pl-5 marker:text-muted last:mb-0",
        tasks: "mb-5 grid list-none gap-2 pl-0 last:mb-0",
        ordered: "mb-5 list-decimal space-y-2 pl-5 marker:text-muted last:mb-0",
        quote: "my-5 border-l-2 border-line-strong pl-4 text-muted [&>p]:mb-0",
        inlineCode:
          "rounded-sm bg-elevated px-1 py-0.5 font-mono text-[0.88em] text-foreground",
      }
    : {
        h1: "mt-8 mb-3 text-section font-semibold first:mt-0",
        h2: "mt-7 mb-3 text-question font-semibold first:mt-0",
        h3: "mt-6 mb-2 text-reading font-semibold first:mt-0",
        h4: "mt-5 mb-2 text-reading font-semibold",
        h5: "mt-4 mb-2 text-ui font-semibold",
        h6: "mt-4 mb-2 text-ui font-medium text-muted",
        p: "mb-3 last:mb-0",
        list: "mb-3 list-disc space-y-1.5 pl-5 marker:text-muted last:mb-0",
        tasks: "mb-3 grid list-none gap-1.5 pl-0 last:mb-0",
        ordered:
          "mb-3 list-decimal space-y-1.5 pl-5 marker:text-muted last:mb-0",
        quote: "my-4 border-l-2 border-brand/60 pl-3 text-muted [&>p]:mb-0",
        inlineCode:
          "rounded bg-elevated px-1.5 py-0.5 font-mono text-[0.88em] text-foreground",
      };

  return {
    h1: ({ children: content, id }) => (
      <h1 id={id} tabIndex={-1} className={type.h1}>
        {content}
      </h1>
    ),
    h2: ({ children: content, id }) => (
      <h2 id={id} tabIndex={-1} className={type.h2}>
        {content}
      </h2>
    ),
    h3: ({ children: content, id }) => (
      <h3 id={id} tabIndex={-1} className={type.h3}>
        {content}
      </h3>
    ),
    h4: ({ children: content, id }) => (
      <h4 id={id} tabIndex={-1} className={type.h4}>
        {content}
      </h4>
    ),
    h5: ({ children: content, id }) => (
      <h5 id={id} tabIndex={-1} className={type.h5}>
        {content}
      </h5>
    ),
    h6: ({ children: content, id }) => (
      <h6 id={id} tabIndex={-1} className={type.h6}>
        {content}
      </h6>
    ),
    p: ({ children: content }) => <p className={type.p}>{content}</p>,
    ul: ({ children: content, className }) => (
      <ul
        className={
          className?.includes("contains-task-list") ? type.tasks : type.list
        }
      >
        {content}
      </ul>
    ),
    ol: ({ children: content, start }) => (
      <ol start={start} className={type.ordered}>
        {content}
      </ol>
    ),
    li: ({ children: content, className, id }) => (
      <li
        id={id}
        className={
          className?.includes("task-list-item")
            ? "flex items-start gap-2"
            : "pl-0.5"
        }
      >
        {content}
      </li>
    ),
    input: ({ type: inputType, checked }) =>
      inputType === "checkbox" ? (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          tabIndex={-1}
          className="mt-1.5 size-3.5 shrink-0 accent-brand"
        />
      ) : null,
    strong: ({ children: content }) => (
      <strong className="font-semibold text-foreground">{content}</strong>
    ),
    del: ({ children: content }) => (
      <del className="text-muted decoration-dim">{content}</del>
    ),
    a: ({ children: content, href, node: _node, ...props }) => (
      <a
        {...props}
        href={href}
        target={href?.startsWith("#") ? undefined : "_blank"}
        rel="noreferrer"
        className="font-medium text-brand underline decoration-brand/35 underline-offset-2 transition-colors hover:text-foreground hover:decoration-current"
      >
        {content}
      </a>
    ),
    code: ({ children: content, className }) => (
      <code className={className || type.inlineCode}>{content}</code>
    ),
    blockquote: ({ children: content }) => (
      <blockquote className={type.quote}>{content}</blockquote>
    ),
    table: ({ children: content }) => (
      <div
        role="region"
        aria-label="Table"
        tabIndex={0}
        className="my-5 max-w-full overflow-x-auto rounded-lg border border-line"
      >
        <table className="w-full border-collapse text-left text-ui leading-6">
          {content}
        </table>
      </div>
    ),
    thead: ({ children: content }) => (
      <thead className="bg-elevated text-foreground">{content}</thead>
    ),
    tbody: ({ children: content }) => (
      <tbody className="divide-y divide-line">{content}</tbody>
    ),
    tr: ({ children: content }) => (
      <tr className="transition-colors hover:bg-elevated">{content}</tr>
    ),
    th: ({ children: content, style }) => (
      <th
        style={style}
        className="border-r border-line px-3 py-2.5 font-semibold last:border-r-0"
      >
        {content}
      </th>
    ),
    td: ({ children: content, style }) => (
      <td
        style={style}
        className="border-r border-line px-3 py-2.5 align-top text-foreground last:border-r-0"
      >
        {content}
      </td>
    ),
    hr: () => <hr className="my-5 border-line" />,
    pre: ({ children: content }) => (
      <MarkdownCodeBlock>{content}</MarkdownCodeBlock>
    ),
  };
}

export const markdownComponents: Components = createMarkdownComponents(false);
export const readingMarkdownComponents: Components =
  createMarkdownComponents(true);
