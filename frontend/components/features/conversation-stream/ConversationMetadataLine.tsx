"use client";

import { cn } from "@/lib/utils";

export function ConversationMetadataLine({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "error" | "success";
}) {
  return (
    <span
      className={cn(
        "cs-text-caption cs-text-comment inline-flex max-w-full items-baseline gap-1 uppercase tracking-[0.08em]",
        tone === "default" && "",
        tone === "warn" && "cs-fg",
        tone === "error" && "cs-fg",
        tone === "success" && "cs-fg",
      )}
    >
      <span className="shrink-0 font-medium">{label}</span>
      <span className="truncate font-normal normal-case tracking-normal">
        {value}
      </span>
    </span>
  );
}
