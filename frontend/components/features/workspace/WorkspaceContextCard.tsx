"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { SetupWorkspaceDto } from "@/lib/api/workspace-types";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import {
  projectsByIdMap,
  resolveProjectsForWorkspace,
} from "@/lib/workspace/partition-projects-by-workspace";

export function WorkspaceContextCard({
  workspace,
  allProjects,
  projectIdsOverride,
}: {
  workspace: SetupWorkspaceDto | null;
  allProjects: ProjectSummaryDto[];
  projectIdsOverride?: string[];
}) {
  const { t } = useI18n();
  const projectsById = useMemo(() => projectsByIdMap(allProjects), [allProjects]);

  const projectIds = projectIdsOverride ?? workspace?.projectIds ?? [];

  const projects = useMemo(() => {
    if (workspace) {
      return resolveProjectsForWorkspace(
        { ...workspace, projectIds },
        projectsById,
      );
    }
    return projectIds
      .map((id) => projectsById.get(id))
      .filter((p): p is ProjectSummaryDto => Boolean(p));
  }, [workspace, projectIds, projectsById]);

  if (!workspace && !projects.length) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("workspaceRun.currentWorkspace")}
          </p>
          <p className="truncate text-[13px] font-medium text-foreground">
            {workspace?.name ?? "—"}
          </p>
        </div>
      </div>
      <div className="mt-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("workspaceRun.involvedProjects")}
        </p>
        {projects.length ? (
          <ul className="mt-1 space-y-0.5">
            {projects.map((p) => (
              <li key={p.id} className="truncate text-[12px] text-foreground/90">
                {p.displayName?.trim() || p.id}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("workspace.noProjectsInWorkspace")}
          </p>
        )}
      </div>
    </div>
  );
}
