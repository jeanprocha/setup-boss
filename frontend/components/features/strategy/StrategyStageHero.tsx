"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/primitives/Surface";
import { useStrategyStageGeneration } from "@/hooks/use-strategy-stage-generation";
import { useClarification } from "@/hooks/use-clarification";
import { useRunEvents } from "@/hooks/use-run-events";
import {
  useStrategyPhaseProgress,
  type StrategyPhaseProgress,
} from "@/hooks/use-strategy-phase-progress";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { deriveRunOperationalCoherence } from "@/lib/runtime/observability/derive-run-operational-coherence";
import { useRuntimeHeartbeatSnapshot } from "@/hooks/use-runtime-heartbeat";
import type { RunSummaryDto } from "@/lib/api/runtime-types";

type Props = {
  runKey: string | null;
  projectId: string | null;
  phase: string | null | undefined;
  state: string | null | undefined;
  active: boolean;
  autoStartMode?: boolean;
  needsRetry?: boolean;
};

export function StrategyStageHero({
  runKey,
  projectId,
  phase,
  state,
  active,
  autoStartMode = false,
  needsRetry = false,
}: Props) {
  const { bundle, refetch } = useClarification(runKey, phase, state);
  const { events } = useRunEvents(projectId, runKey);
  const gen = useStrategyStageGeneration({
    runKey,
    enabled: active,
    onAfterSuccess: async () => {
      await refetch();
    },
  });

  const { heartbeat } = useRuntimeHeartbeatSnapshot();

  const summary = useMemo((): RunSummaryDto | null => {
    if (!runKey) return null;
    return {
      id: runKey,
      runId: runKey,
      label: runKey,
      phase: phase ?? "strategy",
      state: state ?? "running",
      projectId,
      startedAtLabel: null,
      updatedAtLabel: null,
    };
  }, [runKey, phase, state, projectId]);

  const coherence = useMemo(
    () =>
      deriveRunOperationalCoherence({
        summary,
        strategy: gen.strategyProbe.data ?? null,
        clarification: bundle,
        strategyReadyOverride: gen.strategyArtifactsReady,
        heroActive: active && !needsRetry,
        uiStrategyProcessing: autoStartMode,
        heartbeat,
      }),
    [
      summary,
      gen.strategyProbe.data,
      bundle,
      gen.strategyArtifactsReady,
      active,
      needsRetry,
      autoStartMode,
      heartbeat,
    ],
  );

  const strategyRuntimePhase = coherence.strategyRuntimePhase;
  const processing = coherence.showStrategyProcessing;

  const busyAction =
    gen.generateStrategy.isPending ||
    (gen.generateStrategy.isSuccess && gen.strategyProbe.isFetching) ||
    (autoStartMode && processing);

  const progress = useStrategyPhaseProgress({
    events,
    processing: Boolean(processing && (autoStartMode || busyAction)),
    phaseStartedAtIso: bundle?.approval.decidedAt ?? null,
    runtimePhase: strategyRuntimePhase,
    strategyReady: gen.strategyArtifactsReady,
    runKey,
    runState: state,
  });

  if (!active || !runKey) return null;

  const blocking = !gen.runtimeReachable || busyAction;

  return (
    <Surface className="mb-3 space-y-3 border-2 border-sidebar-primary/35 bg-sidebar-accent/25 p-4 shadow-md dark:border-sidebar-primary/45 dark:bg-sidebar-accent/20">
      <div className="space-y-2">
        {processing ? (
          <div className="flex items-center gap-2">
            <Loader2
              className="size-5 animate-spin text-sidebar-primary"
              aria-hidden
            />
            <span className="sr-only">A gerar estratégia</span>
          </div>
        ) : null}
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-primary">
            Etapa activa · Estratégia de execução
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold leading-snug text-foreground">
              {needsRetry
                ? "Falha ao gerar estratégia — tente novamente."
                : processing || autoStartMode
                  ? "Gerando estratégia de execução…"
                  : "Estratégia de execução"}
            </p>
            {processing ? (
              <Badge
                variant="outline"
                className="border-sky-500/40 bg-sky-500/10 text-[9px] font-semibold uppercase text-sky-800 dark:text-sky-100/95"
              >
                Em andamento
              </Badge>
            ) : null}
          </div>
          {processing ? (
            <p className="text-[10px] tabular-nums text-muted-foreground">
              Tempo decorrido: {progress.elapsedLabel}
            </p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {processing
              ? "O Setup Boss está decompondo o plano, organizando a ordem de execução e preparando o contexto das próximas etapas."
              : "A estratégia define descomposição, ordenação, contexto partilhado e readiness. O arranque é automático após aprovar o plano refinado."}
          </p>
        </div>
      </div>

      {bundle && bundle.approval.status === "approved" ? (
        <p className="text-[10px] text-muted-foreground">
          Clarificação aprovada
          {bundle.questions.length > 0
            ? ` · ${bundle.questions.filter((q) => q.status === "answered").length}/${bundle.questions.length} respostas registadas`
            : null}
          .
        </p>
      ) : null}

      {processing ? <StrategyProgressBlock progress={progress} /> : null}

      {gen.strategyProbe.isError ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-100/90">
          Não foi possível ler o estado actual da strategy no runtime — verifique o
          daemon e tente de novo.
        </p>
      ) : null}
      {gen.strategyArtifactsReady ? (
        <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-100/95">
          Estratégia disponível no runtime. Use o painel abaixo para rever
          sub-tarefas e, quando estiver pronto, avance para Execute na barra de
          acções.
        </p>
      ) : needsRetry ? (
        <div className="space-y-2">
          {busyAction ? (
            <p className="text-[11px] font-medium text-foreground/90">
              A tentar gerar estratégia novamente…
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="h-11 w-full max-w-md text-[13px] font-semibold shadow-sm"
            disabled={blocking}
            data-runtime-focus="strategy-primary"
            onClick={() => gen.generateStrategy.mutate()}
          >
            {busyAction ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Tentar gerar estratégia novamente
          </Button>
        </div>
      ) : null}
      {gen.generateStrategy.isError ? (
        <p className="text-[10px] text-sb-failed">
          {gen.generateStrategy.error instanceof Error
            ? gen.generateStrategy.error.message
            : "Falha ao iniciar estratégia no runtime."}
        </p>
      ) : null}
    </Surface>
  );
}

function StrategyProgressBlock({ progress }: { progress: StrategyPhaseProgress }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/15 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Atividades recentes
      </p>
      <ul className="space-y-1.5" aria-live="polite">
        {progress.activities.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[11px] leading-snug">
            {item.done ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400/90" />
            ) : item.label.startsWith("Aguardando") ? (
              <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
            )}
            <span
              className={cn(
                item.done ? "text-foreground/85" : "text-foreground",
                !item.done && item.label.startsWith("Aguardando")
                  ? "italic text-muted-foreground"
                  : "",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {progress.stallMessage ? (
        <p
          className={cn(
            "text-[10px] leading-relaxed",
            progress.stallLevel === "stalled" || progress.stallLevel === "critical"
              ? "font-medium text-amber-800 dark:text-amber-100/90"
              : "text-muted-foreground",
          )}
        >
          {progress.stallMessage}
          {progress.stallLevel === "warning" ||
          progress.stallLevel === "stalled" ||
          progress.stallLevel === "critical"
            ? " Ainda a processar; logs disponíveis na aba Observabilidade."
            : null}
        </p>
      ) : null}
    </div>
  );
}
