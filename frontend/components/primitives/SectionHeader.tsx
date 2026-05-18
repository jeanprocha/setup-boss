import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function SectionHeader({
  title,
  description,
  action,
  className,
  titleClassName,
  descriptionClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 border-b border-border/45 px-3 py-2",
        className,
      )}
    >
      <div className="min-w-0">
        <h2
          className={cn(
            "text-[12px] font-semibold tracking-tight text-foreground",
            titleClassName,
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "mt-0.5 text-[11px] leading-relaxed text-muted-foreground",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
