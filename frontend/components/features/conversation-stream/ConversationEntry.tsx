"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationHeader } from "./ConversationHeader";
import { ConversationBody } from "./ConversationBody";
import { CopyButton } from "./CopyButton";
import {
  SB_RUNTIME_NAV_EVENT,
  type RuntimeNavigateDetail,
} from "@/lib/runtime/navigation/runtime-action-navigation";

export type ConversationEntryTone =
  | "default"
  | "active"
  | "waiting"
  | "done"
  | "blocked"
  | "failed";

export const ConversationEntry = memo(function ConversationEntry({
  id,
  anchorId,
  title,
  leading,
  status,
  metadata,
  summaryLine,
  timestamp,
  children,
  expandedContent,
  copyText,
  expandable = false,
  defaultExpanded = true,
  tone = "default",
  highlighted = false,
  titleClassName,
  className,
}: {
  id: string;
  anchorId?: string;
  title: ReactNode;
  leading?: ReactNode;
  status?: ReactNode;
  metadata?: ReactNode;
  summaryLine?: ReactNode;
  timestamp?: ReactNode;
  children?: ReactNode;
  expandedContent?: ReactNode;
  copyText?: string;
  expandable?: boolean;
  defaultExpanded?: boolean;
  tone?: ConversationEntryTone;
  highlighted?: boolean;
  titleClassName?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(
    expandable ? defaultExpanded : true,
  );

  useEffect(() => {
    const navAnchor = anchorId ?? id;
    if (!navAnchor || !expandable) return;
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeNavigateDetail>).detail;
      if (detail?.scrollAnchorId === navAnchor && detail.expand) {
        setExpanded(true);
      }
    };
    window.addEventListener(SB_RUNTIME_NAV_EVENT, onNavigate);
    return () => window.removeEventListener(SB_RUNTIME_NAV_EVENT, onNavigate);
  }, [anchorId, id, expandable]);

  const isOpen = !expandable || expanded;
  const showLead = Boolean(summaryLine || timestamp);
  const showCopyButton = Boolean(copyText?.trim()) && (!expandable || expanded);

  return (
    <article
      id={id}
      data-exec-anchor={id}
      className={cn("group/entry cs-entry", className)}
    >
      <ConversationHeader
        leading={leading}
        status={status}
        metadata={metadata}
        title={
          <h2
            className={cn("cs-entry-title tracking-tight", titleClassName)}
          >
            {title}
          </h2>
        }
      />

      {isOpen ? (
        <ConversationBody className="mt-2" summaryLine={summaryLine} timestamp={timestamp}>
          {children}
          {expandedContent ? (
            <div className="cs-entry-nested mt-2.5 space-y-2 pt-1">
              {expandedContent}
            </div>
          ) : null}
        </ConversationBody>
      ) : showLead ? (
        <ConversationBody
          className="mt-2"
          summaryLine={summaryLine}
          timestamp={timestamp}
        />
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div>
          {expandable ? (
            <button
              type="button"
              aria-expanded={expanded}
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
          ) : null}
        </div>
        {showCopyButton ? (
          <CopyButton text={copyText!} alwaysVisible />
        ) : null}
      </div>
    </article>
  );
});
