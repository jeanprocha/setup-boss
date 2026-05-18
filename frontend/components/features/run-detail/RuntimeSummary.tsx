"use client";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/primitives/Surface";
import { StatusBadge } from "@/components/primitives/StatusBadge";
import type { RunOperationalVm } from "@/hooks/use-run-operational";
import {
  integrityBadgeClass,
  integrityStateLabel,
  runPhaseDisplayLabel,
} from "@/lib/runtime/adapters/runtime-labels";
import { useRuntimeActionAuditStore } from "@/stores/runtime-action-audit-store";
import { ClarificationStateBadge } from "@/components/features/clarification/ClarificationStateBadge";
import { ExecutionStateBadge } from "@/components/features/execution/ExecutionStateBadge";
import { useClarification } from "@/hooks/use-clarification";
import { useExecution } from "@/hooks/use-execution";
import { useStrategy } from "@/hooks/use-strategy";
import { StrategyStateBadge } from "@/components/features/strategy/StrategyStateBadge";
import { Activity, Clock3, Hash, Shield, Zap } from "lucide-react";

export function RuntimeSummary({
  op,
  phaseRaw,
  stateRaw,
  runKey,
}: {
  op: RunOperationalVm;
  phaseRaw?: string;
  stateRaw?: string;
  runKey?: string | null;
}) {
  const clarify = useClarification(
    runKey ?? op.runKey,
    phaseRaw ?? op.currentPhaseRaw,
    stateRaw ?? op.runtimeState,
  );
  const execution = useExecution(
    runKey ?? op.runKey,
    phaseRaw ?? op.currentPhaseRaw,
    stateRaw ?? op.runtimeState,
  );
  const strategy = useStrategy(
    runKey ?? op.runKey,
    phaseRaw ?? op.currentPhaseRaw,
    stateRaw ?? op.runtimeState,
  );

  const lastAudit = useRuntimeActionAuditStore((s) => {
    const rev = [...s.entries].reverse();
    return rev.find((e) => e.runId === op.runKey || e.jobId === op.runKey) ?? null;
  });

  return (
    <Surface className="border-border/80 bg-gradient-to-br from-card/90 to-card/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Hash className="size-3.5" aria-hidden />
              Run
            </span>
            <Badge variant="outline" className="font-mono text-[11px]">
              {op.runKey}
            </Badge>
            <StatusBadge state={op.runtimeState} />
            {clarify.bundle && clarify.applies ? (
              <ClarificationStateBadge
                phase={clarify.bundle.session.runtimePhase}
                className="max-w-[10rem]"
              />
            ) : null}
            {execution.applies ? (
              <ExecutionStateBadge
                phase={execution.lifecyclePhase}
                className="max-w-[10rem]"
              />
            ) : null}
            {strategy.bundle && strategy.applies ? (
              <StrategyStateBadge
                phase={strategy.runtimePhase}
                className="max-w-[10rem]"
              />
            ) : null}
          </div>
          <h2 className="truncate text-lg font-semibold leading-tight tracking-tight">
            {op.taskTitle}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 font-medium text-foreground/90">
              <Zap className="size-3.5 text-cyan-300/90" aria-hidden />
              {runPhaseDisplayLabel(op.currentPhaseRaw)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${integrityBadgeClass(op.integrity)}`}
            >
              <Shield className="size-3.5" aria-hidden />
              {integrityStateLabel(op.integrity)}
            </span>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 text-right text-[11px] sm:text-[12px]">
          <div>
            <dt className="flex items-center justify-end gap-1 text-muted-foreground">
              <Clock3 className="size-3" aria-hidden />
              Início
            </dt>
            <dd className="font-mono text-foreground">
              {op.startedAtLabel ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Actualizado</dt>
            <dd className="font-mono text-foreground">
              {op.updatedAtLabel ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Avisos</dt>
            <dd className="font-mono text-sb-warning">{op.warningsCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Erros</dt>
            <dd className="font-mono text-sb-failed">{op.errorsCount}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-border/60 pt-3">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Activity className="size-3.5" aria-hidden />
          Último evento
        </span>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/90">
          {lastAudit
            ? `Acção UI: ${lastAudit.message}`
            : op.lastEvent?.message ??
              "Sem eventos nesta janela para esta corrida."}
        </p>
      </div>
    </Surface>
  );
}
