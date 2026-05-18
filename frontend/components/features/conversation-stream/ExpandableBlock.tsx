"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_COLLAPSE_CHARS = 720;
const DEFAULT_MAX_COLLAPSED_PX = 168;

export function ExpandableBlock({
  children,
  contentText,
  defaultCollapsed,
  collapseThreshold = DEFAULT_COLLAPSE_CHARS,
  maxCollapsedHeight = DEFAULT_MAX_COLLAPSED_PX,
  className,
}: {
  children: ReactNode;
  contentText?: string;
  defaultCollapsed?: boolean;
  collapseThreshold?: number;
  maxCollapsedHeight?: number;
  className?: string;
}) {
  const regionId = useId();
  const innerRef = useRef<HTMLDivElement>(null);
  const shouldAutoCollapse =
    defaultCollapsed ??
    (contentText != null && contentText.length > collapseThreshold);

  const [expanded, setExpanded] = useState(!shouldAutoCollapse);
  const [overflows, setOverflows] = useState(shouldAutoCollapse);

  useEffect(() => {
    if (!shouldAutoCollapse || expanded) return;
    const el = innerRef.current;
    if (!el) return;
    const check = () => {
      setOverflows(el.scrollHeight > maxCollapsedHeight + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shouldAutoCollapse, expanded, maxCollapsedHeight, children]);

  const showToggle = shouldAutoCollapse || overflows;

  const collapseStyle: CSSProperties | undefined =
    !expanded && showToggle ? { maxHeight: maxCollapsedHeight } : undefined;

  return (
    <div className={cn("relative", className)}>
      <div
        id={regionId}
        ref={innerRef}
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={collapseStyle}
      >
        {children}
      </div>
      {!expanded && showToggle ? (
        <div
          className="cs-expand-fade pointer-events-none absolute inset-x-0 bottom-0 h-10"
          aria-hidden
        />
      ) : null}
      {showToggle ? (
        <div className="mt-1 flex justify-start">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={() => setExpanded((e) => !e)}
            className="cs-text-caption cs-interactive inline-flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 font-medium"
          >
            <ChevronDown
              className={cn(
                "size-3 transition-transform duration-200",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
            {expanded ? "Recolher" : "Expandir"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
