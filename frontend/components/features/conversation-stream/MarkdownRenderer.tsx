"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { RuntimeCodeBlock } from "./RuntimeCodeBlock";
import { RuntimeTable } from "./RuntimeTable";

function extractText(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const p = (node as { props?: { children?: React.ReactNode } }).props;
    return extractText(p?.children);
  }
  return "";
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="cs-text-title mb-2 mt-3 tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="cs-text-title mb-1.5 mt-2.5">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="cs-text-subtitle mb-1 mt-2 normal-case">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="cs-text-body mb-2 leading-relaxed last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="cs-text-body mb-2 list-disc space-y-0.5 pl-4">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="cs-text-body mb-2 list-decimal space-y-0.5 pl-4">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="cs-text-body leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="cs-text-body mb-2 border-l-2 border-[var(--cs-border)] pl-3 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[var(--cs-border)]" />,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="cs-text-body font-normal underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  table: ({ children }) => <RuntimeTable>{children}</RuntimeTable>,
  thead: ({ children }) => (
    <thead className="cs-bg">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }) => <tr className="cs-table-row">{children}</tr>,
  th: ({ children }) => (
    <th className="cs-text-subtitle px-2 py-1.5 normal-case">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="cs-text-body px-2 py-1.5 align-top">
      {children}
    </td>
  ),
  code: (props) => {
    const { children, className } = props;
    const inline = !className;
    const text = extractText(children);
    if (inline) {
      return (
        <code className="cs-text-caption cs-inline-code">
          {children}
        </code>
      );
    }
    return (
      <RuntimeCodeBlock className={className} meta={undefined}>
        {text}
      </RuntimeCodeBlock>
    );
  },
  pre: ({ children }) => <>{children}</>,
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const trimmed = content.trim();
  const components = useMemo(() => markdownComponents, []);

  if (!trimmed) return null;

  return (
    <div className={cn("cs-markdown min-w-0", className)}>
      <ReactMarkdown components={components}>{trimmed}</ReactMarkdown>
    </div>
  );
});
