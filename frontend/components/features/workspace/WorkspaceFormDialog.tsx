"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import type { SetupWorkspaceDto } from "@/lib/api/workspace-types";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export type WorkspaceFormMode =
  | { kind: "create" }
  | { kind: "edit"; workspace: SetupWorkspaceDto };

export function WorkspaceFormDialog({
  open,
  onOpenChange,
  mode,
  projects,
  busy,
  errorMessage,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: WorkspaceFormMode;
  projects: ProjectSummaryDto[];
  busy?: boolean;
  errorMessage?: string | null;
  onSubmit: (payload: { name: string; projectIds: string[] }) => void;
}) {
  const { t } = useI18n();
  const isEdit = mode.kind === "edit";

  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (mode.kind === "edit") {
      setName(mode.workspace.name);
      setSelectedIds(new Set(mode.workspace.projectIds ?? []));
    } else {
      setName("");
      setSelectedIds(new Set());
    }
  }, [open, mode]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) =>
        (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id, undefined, {
          sensitivity: "base",
        }),
      ),
    [projects],
  );

  if (!open) return null;

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSave = name.trim().length > 0 && selectedIds.size > 0 && !busy;

  return (
    <WorkspaceDialogOverlay busy={busy} onDismiss={() => onOpenChange(false)}>
      <div className="flex max-h-[min(32rem,90vh)] w-full max-w-md flex-col rounded-lg border border-border/80 bg-card shadow-xl">
        <div className="border-b border-border/50 px-4 py-3">
          <h2
            id="workspace-form-title"
            className="text-sm font-semibold text-foreground"
          >
            {isEdit ? t("workspace.editTitle") : t("workspace.createTitle")}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isEdit ? t("workspace.editHint") : t("workspace.createHint")}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-medium uppercase text-muted-foreground">
              {t("workspace.formNameLabel")}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("workspace.formNamePlaceholder")}
              autoComplete="off"
              disabled={busy}
              className="w-full rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-[13px]"
            />
          </label>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">
              {t("workspace.formProjectsLabel")}
            </p>
            {sortedProjects.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {t("workspace.formNoProjects")}
              </p>
            ) : (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border/50 p-1">
                {sortedProjects.map((p) => {
                  const checked = selectedIds.has(p.id);
                  const label = p.displayName?.trim() || p.id;
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-accent/50",
                          checked && "bg-accent/30",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          className="size-3.5 shrink-0 rounded border-border"
                          onChange={() => toggleProject(p.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground">
              {t("workspace.formProjectsHint", { count: selectedIds.size })}
            </p>
          </div>
          {errorMessage ? (
            <p className="text-[11px] text-sb-failed" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border/50 px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                projectIds: [...selectedIds],
              })
            }
          >
            {busy ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
            ) : null}
            {isEdit ? t("common.save") : t("workspace.formCreate")}
          </Button>
        </div>
      </div>
    </WorkspaceDialogOverlay>
  );
}

function WorkspaceDialogOverlay({
  children,
  busy,
  onDismiss,
}: {
  children: React.ReactNode;
  busy?: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="workspace-form-title"
      onClick={() => {
        if (!busy) onDismiss();
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
