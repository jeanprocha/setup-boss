"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

const MIN_HEIGHT_PX = 72;

const shellClass = cn(
  "rounded-md shadow-none transition-[background-color] duration-200 ease-out",
  "bg-muted/15 hover:bg-muted/22",
  "focus-within:bg-muted/26 focus-within:shadow-none",
);

const textareaClass = cn(
  "max-h-[360px] min-h-[4.5rem] w-full resize-none border-0 bg-transparent px-3 py-2.5",
  "text-[13px] leading-relaxed text-foreground shadow-none [box-shadow:none]",
  "outline-none ring-0 ring-offset-0",
  "placeholder:text-muted-foreground/45",
  "focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
  "appearance-none",
);

export function MissionPromptInput({
  value,
  onChange,
  disabled,
  readOnly,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT_PX), 360);
    el.style.height = `${next}px`;
  }, [value]);

  return (
    <div className={shellClass} style={{ boxShadow: "none" }}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        rows={3}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn(textareaClass, (disabled || readOnly) && "opacity-60")}
        style={{ boxShadow: "none" }}
      />
    </div>
  );
}
