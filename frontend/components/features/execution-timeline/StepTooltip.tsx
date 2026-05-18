"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StepTooltip({
  label,
  description,
  className,
}: {
  label: string;
  description: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const maxW = Math.min(300, vw - 20);
    let left = r.left;
    if (left + maxW > vw - 10) left = Math.max(10, vw - maxW - 10);
    setPos({ top: r.bottom + 6, left });
  }, []);

  const show = () => {
    updatePos();
    setOpen(true);
  };
  const hide = () => setOpen(false);

  const tooltip =
    open && typeof document !== "undefined" ? (
      <div
        role="tooltip"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          maxWidth: Math.min(300, window.innerWidth - 20),
          zIndex: 80,
        }}
        className="pointer-events-none rounded-md border border-border/55 bg-popover px-2.5 py-2 text-[11px] leading-snug text-popover-foreground shadow-[0_8px_30px_-12px_rgba(0,0,0,0.35)] dark:shadow-[0_10px_36px_-14px_rgba(0,0,0,0.65)]"
      >
        <p className="mb-0.5 font-semibold tracking-tight text-foreground">{label}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
    ) : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={cn("inline-flex shrink-0", className)}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <button
          type="button"
          className="cursor-pointer rounded-sm p-0.5 text-neutral-400 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:text-sidebar-foreground/55 dark:hover:bg-sidebar-accent/35 dark:hover:text-sidebar-foreground/90"
          aria-label={`${label}: ${description}`}
          onFocus={show}
          onBlur={hide}
        >
          <HelpCircle className="size-3" aria-hidden />
        </button>
      </span>
      {tooltip ? createPortal(tooltip, document.body) : null}
    </>
  );
}
