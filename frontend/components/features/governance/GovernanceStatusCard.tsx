"use client";

import { Button } from "@/components/ui/button";
import { GovernanceTimeline } from "@/components/features/governance/GovernanceTimeline";
import { IaOnboardingPanel } from "@/components/features/governance/IaOnboardingPanel";
import { IaValidationDiagnosticSections } from "@/components/features/observability/IaValidationDiagnosticSections";
import { useProjectGovernance } from "@/hooks/use-project-governance";
import { useProjects } from "@/hooks/use-projects";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import {
  readinessBadgeClass,
  readinessShortLabel,
} from "@/lib/runtime/governance/ia-governance-ux";
import { parseIaValidation } from "@/lib/runtime/intake/ia-validation";
import { OBSERVABILITY_FONT_CLASS } from "@/lib/runtime/observability/observability-panel-styles";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  Ban,
  Clipboard,
  Copy,
  Loader2,
  RefreshCw,
  ScrollText,
} from "lucide-react";

function ReadinessIcon({ readiness }: { readiness: "ready" | "warning" | "blocked" }) {
  if (readiness === "ready") {
    return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />;
  }
  if (readiness === "warning") {
    return <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />;
  }
  return <Ban className="size-4 text-destructive" />;
}

export function GovernanceStatusCard({
  projectId,
  className,
  compact = false,
  variant = "default",
}: {
  projectId: string | null;
  className?: string;
  compact?: boolean;
  /** `sidebar` — painel direito (Arquivos / Logs); sem timeline duplicada */
  variant?: "default" | "sidebar";
}) {
  const gov = useProjectGovernance(projectId);
  const projectsQ = useProjects();
  const project = projectsQ.data?.projects.find((p) => p.id === projectId);
  const projectRoot = project?.projectRoot?.trim() || null;

  const ux = gov.data;
  const ia = ux?.iaValidation ? parseIaValidation(ux.iaValidation) : null;

  const openObserve = () => {
    useMissionLayoutStore.getState().setRightTimelineOpen(true);
    useMissionLayoutStore.getState().setRightPanelTab("observe");
  };

  if (!projectId) return null;

  const isSidebar = variant === "sidebar";
  const tx = isSidebar ? OBSERVABILITY_FONT_CLASS : "text-[11px]";
  const txSm = isSidebar ? OBSERVABILITY_FONT_CLASS : "text-[10px]";
  const txMeta = isSidebar ? OBSERVABILITY_FONT_CLASS : "text-[9px]";

  const shellClass =
    variant === "sidebar"
      ? "rounded-md border border-sidebar-border/60 bg-sidebar-accent/8"
      : "rounded-md border border-border/50 bg-muted/10";

  const showTimeline =
    !compact && variant !== "sidebar" && Boolean(ux?.timeline.length);
  const showDiagnostics =
    Boolean(ia) &&
    ux?.readiness !== "ready" &&
    (!compact || variant === "sidebar");

  if (gov.isPending && !ux) {
    return (
      <div
        className={cn("flex items-center gap-2 px-2.5 py-2", shellClass, className)}
      >
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        <span className={cn(tx, "text-muted-foreground")}>
          A validar governança `.IA`…
        </span>
      </div>
    );
  }

  if (!ux) return null;

  return (
    <div
      className={cn("space-y-2 px-2.5 py-2", shellClass, className)}
    >
      <div className="flex items-start gap-2">
        <ReadinessIcon readiness={ux.readiness} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(tx, "font-semibold text-foreground")}>
              `.IA` Governance
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold uppercase",
                txMeta,
                readinessBadgeClass(ux.readiness),
              )}
            >
              {readinessShortLabel(ux.readiness)}
            </span>
          </div>
          <p className={cn(tx, "font-medium text-foreground/90")}>{ux.headline}</p>
          <p className={cn(txSm, "leading-relaxed text-muted-foreground")}>
            {ux.summary}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-muted-foreground",
          txMeta,
        )}
      >
        {ux.specVersion ? <span>SPEC v{ux.specVersion}</span> : null}
        {ux.validationDurationMs != null ? (
          <span>{ux.validationDurationMs}ms</span>
        ) : null}
        <span>{ux.warningsCount} aviso(s)</span>
        <span>{ux.errorsCount} erro(s)</span>
        {ux.performance.fileCount != null ? (
          <span>{ux.performance.fileCount} ficheiros</span>
        ) : null}
      </div>

      {ux.onboarding ? <IaOnboardingPanel onboarding={ux.onboarding} /> : null}

      {showTimeline ? <GovernanceTimeline stages={ux.timeline} /> : null}

      {showDiagnostics && ia ? (
        <IaValidationDiagnosticSections
          ia={ia}
          surface={variant === "sidebar" ? "sidebar" : "default"}
        />
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7", txSm)}
          onClick={openObserve}
        >
          <ScrollText className="mr-1 size-3" />
          Diagnósticos
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7", txSm)}
          onClick={() => {
            void navigator.clipboard.writeText(ux.reportText || "");
          }}
        >
          <Clipboard className="mr-1 size-3" />
          Copiar relatório
        </Button>
        {projectRoot ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-7", txSm)}
            onClick={() => {
              void navigator.clipboard.writeText(`${projectRoot}\\docs\\.IA`);
            }}
          >
            <Copy className="mr-1 size-3" />
            Copiar caminho docs/.IA
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7", txSm)}
          onClick={() => {
            void navigator.clipboard.writeText(
              "docs/governance/operational-ux.md",
            );
          }}
        >
          Docs governança
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7", txSm)}
          onClick={() => gov.retryValidation()}
          disabled={gov.isFetching}
        >
          {gov.isFetching ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 size-3" />
          )}
          Revalidar
        </Button>
      </div>
    </div>
  );
}
