"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

function languageFromClassName(className?: string): string | null {
  if (!className) return null;
  const m = /language-(\w+)/.exec(className);
  return m?.[1]?.toUpperCase() ?? null;
}

function filenameFromMeta(meta?: string): string | null {
  if (!meta?.trim()) return null;
  return meta.trim();
}

export const RuntimeCodeBlock = memo(function RuntimeCodeBlock({
  children,
  className,
  meta,
}: {
  children: string;
  className?: string;
  meta?: string;
}) {
  const lang = languageFromClassName(className);
  const file = filenameFromMeta(meta);

  return (
    <div className="cs-code-block group/code overflow-hidden rounded-md border border-border/25 bg-[oklch(0.14_0.01_260)]">
      {lang || file ? (
        <div className="flex items-center justify-between gap-2 border-b border-white/6 px-2.5 py-1">
          {lang ? (
            <span className="cs-text-caption font-mono font-semibold uppercase tracking-wider text-neutral-300">
              {lang}
            </span>
          ) : (
            <span />
          )}
          {file ? (
            <span className="cs-text-caption truncate font-mono text-neutral-400">
              {file}
            </span>
          ) : null}
        </div>
      ) : null}
      <pre className="cs-text-body overflow-x-auto p-2.5 font-mono leading-relaxed text-neutral-100">
        <code className={cn("block whitespace-pre", className)}>{children}</code>
      </pre>
    </div>
  );
});
