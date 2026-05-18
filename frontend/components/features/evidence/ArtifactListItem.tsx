"use client";

import { cn } from "@/lib/utils";
import type { ArtifactVm } from "@/lib/runtime/evidence-types";
import {
  artifactSourceLabel,
  artifactStatusLabel,
  artifactTypeIcon,
  selectArtifactViewer,
} from "@/lib/runtime/adapters/artifact-adapters";
import { StepTooltip } from "@/components/features/execution-timeline/StepTooltip";

function artifactMetaDescription(a: ArtifactVm): string {
  return [
    a.sizeLabel,
    a.modifiedAtLabel && a.modifiedAtLabel !== "—" ? a.modifiedAtLabel : null,
    artifactStatusLabel(a.status),
    artifactSourceLabel(a.source),
    a.relatedPhase,
    a.virtualPath,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ArtifactListItem({
  artifact,
  active,
  onActivate,
}: {
  artifact: ArtifactVm;
  active: boolean;
  onActivate: () => void;
}) {
  const VIcon = artifactTypeIcon(
    selectArtifactViewer(artifact.mime, artifact.displayName),
  );
  const meta = artifactMetaDescription(artifact);

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 border-l-2 py-2 pl-2.5 pr-1 transition-colors duration-150",
          active
            ? "border-neutral-950 bg-neutral-100/90 dark:border-sidebar-foreground/80 dark:bg-sidebar-accent/55"
            : "border-transparent hover:bg-neutral-50/90 dark:hover:bg-sidebar-accent/20",
        )}
      >
        <button
          type="button"
          onClick={onActivate}
          aria-current={active ? "true" : undefined}
          aria-label={artifact.displayName}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:ring-offset-1"
        >
          <VIcon
            className={cn(
              "size-3.5 shrink-0 text-neutral-600 dark:text-sidebar-foreground/62",
              active && "text-neutral-950 dark:text-sidebar-foreground",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12px] leading-snug",
              active
                ? "font-semibold text-neutral-950 dark:text-sidebar-foreground"
                : "font-medium text-neutral-700 dark:text-sidebar-foreground/82",
            )}
          >
            {artifact.displayName}
          </span>
        </button>
        {meta ? (
          <StepTooltip
            label={artifact.displayName}
            description={meta}
            className="shrink-0"
          />
        ) : null}
      </div>
    </li>
  );
}
