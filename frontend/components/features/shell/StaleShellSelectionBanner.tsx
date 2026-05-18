"use client";

import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { useI18n } from "@/lib/i18n/use-i18n";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

export function StaleShellSelectionBanner() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const notice = useMissionShellStore((s) => s.staleSelectionNotice);
  const dismiss = useMissionShellStore((s) => s.dismissStaleSelectionNotice);
  const projectCount = useProjects().data?.projects.length ?? 0;

  if (!notice) return null;

  const message =
    notice === "run_unavailable"
      ? t("shell.staleRunUnavailable")
      : t("shell.staleProjectUnavailable");

  const hint =
    notice === "run_unavailable"
      ? t("shell.staleRunUnavailableHint")
      : t("shell.staleProjectUnavailableHint");

  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-2 border-b border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[12px] text-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium leading-snug">{message}</p>
        <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[10px]"
          onClick={() => {
            void qc.invalidateQueries({ queryKey: runtimeQueryKeys.projects() });
            dismiss();
          }}
        >
          <RefreshCw className="size-3" />
          {t("shell.refreshProjectList")}
        </Button>
        {projectCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-[10px]"
            onClick={dismiss}
          >
            {t("shell.dismissStaleNotice")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-7"
          aria-label={t("shell.dismissStaleNotice")}
          onClick={dismiss}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
