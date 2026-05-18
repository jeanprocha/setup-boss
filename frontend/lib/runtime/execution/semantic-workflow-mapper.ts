import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type {
  StrategyBundleDto,
  StrategyRuntimePhase,
} from "@/lib/runtime/strategy/strategy-types";
import {
  strategyAutoStartInProgress,
  strategyNeedsManualRetry,
} from "@/lib/runtime/strategy/strategy-auto-start-policy";
import type { ExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-types";
import { humanCtaToTimelineAction } from "@/lib/runtime/navigation/human-cta-to-timeline-action";
import {
  translateClarificationRuntimePhase,
  translateExecutionLifecyclePhase,
  translateStrategyRuntimePhase,
} from "@/lib/runtime/translation/runtime-translation-layer";
import type { HumanOperationalCta } from "@/lib/runtime/translation/human-operational-state";
import {
  isClarificationCollectionComplete,
  isClarificationWorkflowComplete,
} from "@/lib/runtime/clarification/clarification-operational-state";
import {
  mapRawPhaseToLifecycleId,
  type LifecyclePhaseId,
} from "@/lib/runtime/adapters/runtime-labels";
import {
  getExecutionStepDefinition,
  type ExecutionStepId,
} from "@/lib/runtime/execution/execution-step-catalog";
import type {
  ExecutionTimelineCard,
  ExecutionTimelineCardAction,
  ExecutionTimelineCardHighlight,
  ExecutionTimelineCardSection,
  SemanticExecutionTimelineCard,
} from "@/lib/runtime/execution/execution-timeline-card-types";
import { operationalToSurfaceStatus } from "@/lib/runtime/execution/execution-timeline-card-types";
import type { OperationalPipelineRow } from "@/lib/runtime/execution/derive-operational-pipeline";
import {
  operationalStatusRank,
  type OperationalStepStatus,
} from "@/lib/runtime/execution/operational-step-status";
import {
  semanticTimelineAnchorId,
  type SemanticWorkflowPhaseId,
} from "@/lib/runtime/execution/semantic-workflow-phase-id";

export { semanticTimelineAnchorId } from "@/lib/runtime/execution/semantic-workflow-phase-id";

type PhaseMeta = {
  title: string;
  displayStepId: ExecutionStepId;
  embeddedSlotStepId: ExecutionStepId | null;
};

const PHASE_META: Record<SemanticWorkflowPhaseId, PhaseMeta> = {
  project_initialization: {
    title: "Inicialização",
    displayStepId: "knowledge_bootstrap",
    embeddedSlotStepId: null,
  },
  intake: {
    title: "Entrada da tarefa",
    displayStepId: "task_intake",
    embeddedSlotStepId: "task_intake",
  },
  run_bootstrap: {
    title: "Pedido e arranque",
    displayStepId: "run_started",
    embeddedSlotStepId: null,
  },
  clarification_spec: {
    title: "Clarificação / SPEC",
    displayStepId: "clarification",
    embeddedSlotStepId: "clarification",
  },
  refined_plan: {
    title: "Plano refinado",
    displayStepId: "clarification_approval",
    embeddedSlotStepId: "clarification_approval",
  },
  strategy: {
    title: "Execução",
    displayStepId: "executor_running",
    embeddedSlotStepId: "executor_running",
  },
  execution_planning: {
    title: "Planeamento de execução",
    displayStepId: "execution_plan",
    embeddedSlotStepId: null,
  },
  execution: {
    title: "Execução",
    displayStepId: "executor_running",
    embeddedSlotStepId: "executor_running",
  },
  review: {
    title: "Review e correções",
    displayStepId: "review_in_progress",
    embeddedSlotStepId: null,
  },
  finalization: {
    title: "Conclusão e artefactos",
    displayStepId: "final_result",
    embeddedSlotStepId: null,
  },
};

function trunc(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function mapExecutionStepToSemanticPhase(
  stepId: ExecutionStepId,
  life: LifecyclePhaseId,
): SemanticWorkflowPhaseId {
  switch (stepId) {
    case "knowledge_bootstrap":
      return "project_initialization";
    case "task_intake":
      return "intake";
    case "request_received":
    case "run_created":
    case "run_started":
    case "operational_state":
      return "run_bootstrap";
    case "clarification":
    case "clarification_questions":
    case "clarification_answers":
      return "clarification_spec";
    case "clarification_approval":
      return "refined_plan";
    case "waiting_human_input":
      return "clarification_spec";
    case "waiting_approval":
      if (life === "clarification") return "refined_plan";
      return "execution";
    case "strategy_generated":
    case "strategy_approval":
      return "execution";
    case "action_required":
      return "execution";
    case "execution_plan":
      return "execution_planning";
    case "current_phase":
    case "current_subtask":
    case "executor_running":
    case "patch_applied":
    case "files_changed":
    case "diff_summary":
    case "tests_running":
    case "tests_result":
    case "retry_execution":
    case "execution_paused":
    case "execution_resumed":
    case "flow_blocked":
      return "execution";
    case "review_in_progress":
    case "review_approved":
    case "review_rejected":
    case "auto_correction":
    case "retry_review":
      return "execution";
    case "execution_cancelled":
    case "execution_completed":
    case "final_result":
    case "activity_summary":
    case "knowledge_update":
    case "commit_generated":
    case "pr_generated":
      return "finalization";
    default:
      return "execution";
  }
}

function pickStrongerStatus(
  a: OperationalStepStatus,
  b: OperationalStepStatus,
): OperationalStepStatus {
  return operationalStatusRank(a) >= operationalStatusRank(b) ? a : b;
}

function aggregateGroupOperationalStatus(
  members: readonly OperationalPipelineRow[],
): OperationalStepStatus {
  const current = members.filter((m) => m.timelinePhase === "current");
  if (current.length > 0) {
    return current.reduce(
      (acc, r) => pickStrongerStatus(acc, r.status),
      current[0]!.status,
    );
  }
  if (members.length > 0 && members.every((m) => m.timelinePhase === "past")) {
    return "completed";
  }
  return "pending";
}

function mergeHighlights(
  members: readonly ExecutionTimelineCard[],
): ExecutionTimelineCardHighlight[] {
  const out: ExecutionTimelineCardHighlight[] = [];
  const seen = new Set<string>();
  for (const c of members) {
    for (const h of c.highlights) {
      const k = `${h.label}:${h.value}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function resolveSemanticPhaseHumanCta(
  phase: SemanticWorkflowPhaseId,
  clarificationBundle: ClarificationBundleDto | null,
  strategyPhase: StrategyRuntimePhase | null,
  executionPhase: ExecutionLifecyclePhase | null,
): HumanOperationalCta | null {
  if (phase === "clarification_spec" && clarificationBundle) {
    return (
      translateClarificationRuntimePhase(clarificationBundle.session.runtimePhase)
        .cta ?? null
    );
  }
  if (phase === "refined_plan" && clarificationBundle) {
    const rp = clarificationBundle.session.runtimePhase;
    if (
      rp === "awaiting_approval" ||
      clarificationBundle.approval.status === "pending"
    ) {
      return translateClarificationRuntimePhase("awaiting_approval").cta ?? null;
    }
    return translateClarificationRuntimePhase("refinement_ready").cta ?? null;
  }
  if (phase === "strategy") {
    return translateStrategyRuntimePhase(strategyPhase).cta ?? null;
  }
  if (phase === "execution" || phase === "review") {
    return translateExecutionLifecyclePhase(executionPhase).cta ?? null;
  }
  return null;
}

function mergeActions(
  members: readonly ExecutionTimelineCard[],
): ExecutionTimelineCardAction[] {
  const out: ExecutionTimelineCardAction[] = [];
  const seen = new Set<string>();
  for (const c of members) {
    for (const a of c.actions) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/** Conteúdo interactivo vive no embedded slot — sem duplicar Q&A nem metadata runtime. */
function buildClarificationExpandSections(
  _bundle: ClarificationBundleDto,
): ExecutionTimelineCardSection[] {
  return [];
}

function buildRefinedPlanExpandSections(
  _bundle: ClarificationBundleDto,
): ExecutionTimelineCardSection[] {
  return [];
}

function mergeExpandedSections(
  members: readonly { row: OperationalPipelineRow; card: ExecutionTimelineCard }[],
  phase: SemanticWorkflowPhaseId,
  clarificationBundle: ClarificationBundleDto | null,
): ExecutionTimelineCardSection[] {
  if (phase === "clarification_spec" && clarificationBundle) {
    return buildClarificationExpandSections(clarificationBundle);
  }
  if (phase === "refined_plan" && clarificationBundle) {
    return buildRefinedPlanExpandSections(clarificationBundle);
  }
  if (phase === "finalization") {
    const fin = members.find((m) => m.row.definition.id === "final_result");
    if (fin && fin.card.expandedSections.length > 0) {
      return fin.card.expandedSections;
    }
  }
  const substeps = members.map((m) => ({
    label: m.row.definition.title,
    detail: trunc(String(m.card.summaryLine ?? "—"), 160),
    status: m.row.status,
  }));
  const sections: ExecutionTimelineCardSection[] = [];
  if (substeps.length > 1) {
    sections.push({
      title: "Progresso interno",
      kind: "semanticSubsteps",
      substeps,
    });
  }
  for (const m of members) {
    for (const s of m.card.expandedSections) {
      sections.push({
        ...s,
        title: `${m.row.definition.title} — ${s.title}`,
      });
    }
  }
  return sections;
}

function mergeSummaryLine(
  members: readonly { row: OperationalPipelineRow; card: ExecutionTimelineCard }[],
): string {
  const current = members.filter((m) => m.row.timelinePhase === "current");
  const pick =
    current.length > 0
      ? current[current.length - 1]!.card.summaryLine
      : members[members.length - 1]!.card.summaryLine;
  return trunc(String(pick ?? "—"), 200);
}

function buildSemanticCard(
  phase: SemanticWorkflowPhaseId,
  members: readonly { row: OperationalPipelineRow; card: ExecutionTimelineCard }[],
  clarificationBundle: ClarificationBundleDto | null,
  strategyBundle: StrategyBundleDto | null,
  strategyPhase: StrategyRuntimePhase | null,
  dominantStrategyHandoff: boolean,
  executionPhase: ExecutionLifecyclePhase | null,
): SemanticExecutionTimelineCard {
  const meta = PHASE_META[phase];
  const cards = members.map((m) => m.card);
  const rows = members.map((m) => m.row);
  let op = aggregateGroupOperationalStatus(rows);
  const collectionDone =
    clarificationBundle != null &&
    isClarificationCollectionComplete(clarificationBundle);
  if (phase === "clarification_spec" && collectionDone) {
    op = "completed";
  }
  if (phase === "refined_plan" && clarificationBundle) {
    const approval = clarificationBundle.approval.status;
    if (approval === "rejected") {
      op = pickStrongerStatus(op, "blocked");
    } else if (
      collectionDone &&
      (clarificationBundle.session.runtimePhase === "awaiting_approval" ||
        clarificationBundle.session.runtimePhase === "refinement_ready" ||
        approval === "pending")
    ) {
      op = pickStrongerStatus(op, "waiting_input");
    } else if (
      isClarificationWorkflowComplete(
        clarificationBundle.session.runtimePhase,
      ) ||
      approval === "approved"
    ) {
      op = "completed";
    }
  }
  const strategyAutoGenerating =
    phase === "strategy" &&
    (dominantStrategyHandoff ||
      strategyPhase === "strategy_generating" ||
      strategyPhase === "strategy_pending" ||
      strategyAutoStartInProgress(clarificationBundle, strategyBundle));
  const strategyRetry =
    phase === "strategy" && strategyNeedsManualRetry(strategyBundle);
  if (strategyAutoGenerating) {
    op = "running";
  } else if (strategyRetry) {
    op = "waiting_user";
  }
  const strategyStageExpanded = strategyAutoGenerating || strategyRetry;
  const surface = operationalToSurfaceStatus(op);
  const priority = Math.min(...cards.map((c) => c.priority));
  const hasEmbeddedSlot = cards.some((c) => c.hasEmbeddedSlot);
  const intakeComposer = phase === "intake" && hasEmbeddedSlot;
  const expandable = intakeComposer ? false : cards.some((c) => c.expandable);
  const defaultExpanded = intakeComposer
    ? true
    : strategyStageExpanded
      ? true
      : phase === "clarification_spec" && collectionDone
        ? false
        : phase === "refined_plan" &&
            op === "waiting_input" &&
            clarificationBundle?.refinement.available
          ? true
          : op === "completed"
            ? false
            : cards.some((c) => c.defaultExpanded);
  const checkpointSeverity = cards.reduce<
    ExecutionTimelineCard["checkpointSeverity"]
  >((acc, c) => {
    const sev = c.checkpointSeverity;
    if (!sev) return acc;
    if (!acc) return sev;
    const rank: Record<NonNullable<typeof sev>, number> = {
      info: 1,
      success: 2,
      warning: 3,
      error: 4,
    };
    return rank[sev] > rank[acc] ? sev : acc;
  }, null);

  const timestamps = cards
    .map((c) => c.timestamp)
    .filter((t): t is string => Boolean(t));
  const timestamp =
    timestamps.length > 0 ? timestamps[timestamps.length - 1]! : null;

  const def = getExecutionStepDefinition(meta.displayStepId);

  let summaryLine = mergeSummaryLine(members);
  if (phase === "clarification_spec" && collectionDone && clarificationBundle) {
    const answered = clarificationBundle.questions.filter(
      (q) => q.status === "answered",
    ).length;
    summaryLine =
      answered > 0
        ? `${answered} pergunta${answered === 1 ? "" : "s"} respondida${answered === 1 ? "" : "s"} — clarificação concluída`
        : "Clarificação concluída";
  } else if (phase === "refined_plan" && clarificationBundle) {
    if (clarificationBundle.approval.status === "rejected") {
      summaryLine = "Plano refinado rejeitado — revisão necessária";
    } else if (
      op === "waiting_input" &&
      clarificationBundle.refinement.available
    ) {
      summaryLine = "Aguarda aprovação do plano refinado";
    }
  }

  return {
    ...cards[cards.length - 1]!,
    stepId: meta.displayStepId,
    category: def?.category ?? cards[0]!.category,
    semanticPhaseId: phase,
    embeddedSlotStepId: meta.embeddedSlotStepId,
    anchorId: semanticTimelineAnchorId(phase),
    title: meta.title,
    status: op,
    surfaceStatus: surface,
    summaryLine,
    timestamp,
    highlights:
      phase === "run_bootstrap" ||
      phase === "finalization" ||
      intakeComposer
        ? []
        : mergeHighlights(cards),
    expandedSections: mergeExpandedSections(members, phase, clarificationBundle),
    actions: (() => {
      const merged = mergeActions(cards);
      if (strategyAutoGenerating && hasEmbeddedSlot) {
        return merged.filter(
          (a) =>
            !(
              a.intent === "navigate" &&
              a.navigation?.target === "strategy"
            ),
        );
      }
      const phaseCta = resolveSemanticPhaseHumanCta(
        phase,
        clarificationBundle,
        strategyPhase,
        executionPhase,
      );
      const needsCta =
        (surface === "active" || strategyRetry) &&
        (op === "waiting_input" || op === "waiting_user") &&
        phaseCta;
      if (!needsCta) return merged;
      const nav = humanCtaToTimelineAction(phaseCta, `semantic-cta-${phase}`);
      const rest = merged.filter((a) => a.id !== nav.id);
      return [nav, ...rest];
    })(),
    expandable,
    defaultExpanded,
    priority,
    hasEmbeddedSlot,
    checkpointSeverity,
  };
}

export type BuildSemanticTimelineOpts = {
  cards: readonly ExecutionTimelineCard[];
  rows: readonly OperationalPipelineRow[];
  summary: RunSummaryDto | null;
  clarificationBundle: ClarificationBundleDto | null;
  strategyBundle?: StrategyBundleDto | null;
  strategyPhase?: StrategyRuntimePhase | null;
  dominantStrategyHandoff?: boolean;
  executionPhase?: ExecutionLifecyclePhase | null;
};

function wrapAtomicSemanticCard(
  c: ExecutionTimelineCard,
  life: LifecyclePhaseId,
  clarificationBundle: ClarificationBundleDto | null,
): SemanticExecutionTimelineCard {
  const p = mapExecutionStepToSemanticPhase(c.stepId, life);
  const m = PHASE_META[p];
  const def = getExecutionStepDefinition(m.displayStepId);
  return {
    ...c,
    stepId: m.displayStepId,
    category: def?.category ?? c.category,
    semanticPhaseId: p,
    embeddedSlotStepId: m.embeddedSlotStepId,
    anchorId: semanticTimelineAnchorId(p),
    title: m.title,
    expandedSections:
      p === "clarification_spec" && clarificationBundle
        ? buildClarificationExpandSections(clarificationBundle)
        : p === "refined_plan" && clarificationBundle
          ? buildRefinedPlanExpandSections(clarificationBundle)
          : c.expandedSections,
  };
}

/**
 * Agrega cards 1:1 do pipeline em fases semânticas para a timeline central.
 * Não altera runtime — só apresentação.
 */
export function buildSemanticExecutionTimeline(
  opts: BuildSemanticTimelineOpts,
): SemanticExecutionTimelineCard[] {
  const {
    cards,
    rows,
    summary,
    clarificationBundle,
    strategyBundle = null,
    strategyPhase = null,
    dominantStrategyHandoff = false,
    executionPhase = null,
  } = opts;
  const life = mapRawPhaseToLifecycleId(summary?.phase);

  if (cards.length !== rows.length || cards.length === 0) {
    return cards.map((c) => wrapAtomicSemanticCard(c, life, clarificationBundle));
  }

  type Pair = { row: OperationalPipelineRow; card: ExecutionTimelineCard };
  const pairList: Pair[] = rows.map((row, i) => ({
    row,
    card: cards[i]!,
  }));

  const groups: { phase: SemanticWorkflowPhaseId; members: Pair[] }[] = [];

  for (const pair of pairList) {
    const phase = mapExecutionStepToSemanticPhase(pair.row.definition.id, life);
    const last = groups[groups.length - 1];
    if (last && last.phase === phase) {
      last.members.push(pair);
    } else {
      groups.push({ phase, members: [pair] });
    }
  }

  return groups.map((g) =>
    buildSemanticCard(
      g.phase,
      g.members,
      clarificationBundle,
      strategyBundle,
      strategyPhase,
      dominantStrategyHandoff,
      executionPhase,
    ),
  );
}

/**
 * Índice do card semântico que contém o passo operacional actualmente em foco.
 */
export function deriveSemanticTimelineHighlightIndex(
  rows: readonly OperationalPipelineRow[],
  semanticCards: readonly { semanticPhaseId: SemanticWorkflowPhaseId }[],
  summary: RunSummaryDto | null,
): number {
  if (semanticCards.length === 0) return 0;
  const life = mapRawPhaseToLifecycleId(summary?.phase);
  const cur = rows.findIndex((r) => r.timelinePhase === "current");
  if (cur < 0) return Math.max(0, semanticCards.length - 1);
  const targetPhase = mapExecutionStepToSemanticPhase(
    rows[cur]!.definition.id,
    life,
  );
  const idx = semanticCards.findIndex((c) => c.semanticPhaseId === targetPhase);
  return idx >= 0 ? idx : 0;
}
