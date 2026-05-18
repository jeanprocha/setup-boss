import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import type { ClarificationRuntimePhase } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyRuntimePhase } from "@/lib/runtime/strategy/strategy-types";
import {
  lifecyclePhaseLabel,
  mapRawPhaseToLifecycleId,
  runtimeEventTypeLabelPt,
} from "@/lib/runtime/adapters/runtime-labels";

import {
  formatRuntimeCheckpoint,
  type RuntimeCheckpointPresentation,
} from "@/lib/runtime/adapters/runtime-checkpoint-copy";
import { resolveHumanOperationalHeadline } from "@/lib/runtime/translation/runtime-translation-layer";

/** Âncora estável para entrada / nova atividade */
export const ACTIVITY_INTAKE_ANCHOR = "act-step-intake";

export type ActivityStepKind = "intake" | "milestone" | "live_phase";

export type ActivityStepInstance = {
  anchorId: string;
  title: string;
  kind: ActivityStepKind;
  event?: RuntimeEventDto;
  checkpoint?: RuntimeCheckpointPresentation;
};

function sanitizeId(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

/** Reduz repetição de marcos únicos na mesma corrida (ex.: re-fetch da fila). */
function dedupeSingletonMilestones(events: RuntimeEventDto[]): RuntimeEventDto[] {
  const once = new Set<string>();
  const out: RuntimeEventDto[] = [];
  for (const ev of events) {
    const t = ev.type.toLowerCase();
    if (
      t === "job_enqueued" ||
      t === "run_created" ||
      t === "intake_completed"
    ) {
      if (once.has(t)) continue;
      once.add(t);
    }
    out.push(ev);
  }
  return out;
}

function shouldIncludeEventInNav(ev: RuntimeEventDto): boolean {
  if (ev.metadata?.notArtifactBacked === true) return false;
  const t = ev.type.toLowerCase();
  if (t.includes("phase_")) return true;
  if (
    t === "run_created" ||
    t === "intake_completed" ||
    t === "clarification_initialized" ||
    t.startsWith("clarification_") ||
    t.startsWith("intake_") ||
    t.startsWith("spec_")
  ) {
    return true;
  }
  if (
    t.startsWith("job_") ||
    t.startsWith("execution") ||
    t.startsWith("review") ||
    t.startsWith("correction") ||
    t.startsWith("subtask") ||
    t.startsWith("clarif")
  ) {
    return true;
  }
  if (t === "runtime_started" || t === "runtime_finished") return true;
  return false;
}

/**
 * Títulos alinhados ao vocabulário de operação (podem repetir quando o fluxo volta).
 */
export function milestoneStepTitle(ev: RuntimeEventDto): string {
  if (ev.phaseHint) {
    const life = mapRawPhaseToLifecycleId(ev.phaseHint);
    return liveTitleFromLifecycle(life);
  }
  return runtimeEventTypeLabelPt(ev.type);
}

function liveTitleFromLifecycle(
  life: ReturnType<typeof mapRawPhaseToLifecycleId>,
): string {
  switch (life) {
    case "intake":
      return "Lendo arquivos .IA e base de conhecimento";
    case "clarification":
      return "Clarificação / SPEC";
    case "strategy":
      return "Gerando plano";
    case "execution":
      return "Executando subtarefas";
    case "review":
      return "Review";
    case "correction":
      return "Correcção";
    case "rollback":
      return "Rollback";
    case "integrity":
      return "Integridade";
    case "completed":
      return "Finalizado";
    default:
      return lifecyclePhaseLabel(life);
  }
}

/** Headline curta para o painel de estado operacional (Mission Control). */
export function resolveOperationalHeadline(
  summary: RunSummaryDto,
  clarificationRuntimePhase: ClarificationRuntimePhase | null,
  strategyRuntimePhase: StrategyRuntimePhase | null,
): string | null {
  return resolveHumanOperationalHeadline({
    summary,
    clarificationPhase: clarificationRuntimePhase,
    strategyPhase: strategyRuntimePhase,
  });
}

/** Índice sugerido para destaque (fallback quando scroll-spy não aplica). */
export function deriveHighlightIndexForSteps(
  instances: ActivityStepInstance[],
  summary: RunSummaryDto | null,
): number {
  if (instances.length === 0) return 0;
  const st = summary?.state;
  const running =
    st === "running" ||
    st === "retrying" ||
    st === "correcting" ||
    st === "waiting_approval" ||
    st === "waiting_clarification_questions" ||
    st === "waiting_clarification_answers" ||
    st === "blocked" ||
    st === "warning";
  if (running) {
    const live = instances.findIndex((i) => i.kind === "live_phase");
    if (live >= 0) return live;
    return instances.length - 1;
  }
  if (st === "success") return instances.length - 1;
  return instances.length - 1;
}

/**
 * Passos visíveis para a actividade: sem deduplicação por título.
 */
export function buildActivityStepInstances(opts: {
  runId: string | null;
  newActivityFlow: boolean;
  events: RuntimeEventDto[];
  summary: RunSummaryDto | null;
  clarificationRuntimePhase: ClarificationRuntimePhase | null;
  strategyRuntimePhase: StrategyRuntimePhase | null;
  projectLabel?: string | null;
}): ActivityStepInstance[] {
  const {
    runId,
    newActivityFlow,
    events,
    summary,
    clarificationRuntimePhase,
    strategyRuntimePhase,
    projectLabel,
  } = opts;

  if (newActivityFlow && !runId) {
    return [
      {
        anchorId: ACTIVITY_INTAKE_ANCHOR,
        title: "Entrada da tarefa",
        kind: "intake",
      },
    ];
  }

  if (!runId || !summary) {
    return [];
  }

  const sorted = dedupeSingletonMilestones(
    [...events].sort((a, b) => Date.parse(a.tsIso) - Date.parse(b.tsIso)),
  );

  const out: ActivityStepInstance[] = [
    {
      anchorId: ACTIVITY_INTAKE_ANCHOR,
      title: "Entrada da tarefa",
      kind: "intake",
    },
  ];

  for (const ev of sorted) {
    if (!shouldIncludeEventInNav(ev)) continue;
    const checkpoint = formatRuntimeCheckpoint(ev, {
      summary,
      projectLabel,
    });
    out.push({
      anchorId: `act-ev-${sanitizeId(ev.id)}`,
      title: checkpoint.title,
      kind: "milestone",
      event: ev,
      checkpoint,
    });
  }

  const liveTitle = resolveHumanOperationalHeadline({
    summary,
    clarificationPhase: clarificationRuntimePhase,
    strategyPhase: strategyRuntimePhase,
  });
  if (liveTitle) {
    out.push({
      anchorId: "act-live-phase",
      title: liveTitle,
      kind: "live_phase",
    });
  }

  return out;
}
