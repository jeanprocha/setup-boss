import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import type { ClarificationRuntimePhase } from "@/lib/runtime/clarification/clarification-types";
import {
  isClarificationCollectionComplete,
  isClarificationWorkflowComplete,
} from "@/lib/runtime/clarification/clarification-operational-state";
import type { StrategyRuntimePhase } from "@/lib/runtime/strategy/strategy-types";
import { deriveStrategyOperationalStatus } from "@/lib/runtime/strategy/strategy-operational-state";
import {
  mapRawPhaseToLifecycleId,
  type LifecyclePhaseId,
} from "@/lib/runtime/adapters/runtime-labels";
import {
  EXECUTION_STEPS,
  type ExecutionStepDefinition,
  type ExecutionStepId,
} from "@/lib/runtime/execution/execution-step-catalog";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";
import { executionCardAnchorId } from "@/lib/runtime/execution/execution-timeline-card-types";

/** Resumo final / artefatos — âncora estável no feed central. */
export const ACTIVITY_RUNTIME_SUMMARY_ANCHOR = "act-runtime-summary";

function hasEvent(events: readonly RuntimeEventDto[], needle: string) {
  const n = needle.toLowerCase();
  return events.some((e) => e.type.toLowerCase() === n);
}

function scrollTargetForStep(id: ExecutionStepId): string | null {
  return executionCardAnchorId(id);
}

function mapRuntimeStateToOperational(
  st: RunSummaryDto["state"],
  isPrimary: boolean,
): OperationalStepStatus {
  if (!isPrimary) return "pending";
  switch (st) {
    case "running":
    case "retrying":
    case "correcting":
      return "running";
    case "waiting_clarification_questions":
    case "waiting_clarification_answers":
      return "waiting_input";
    case "waiting_approval":
      return "waiting_input";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    case "warning":
      return "blocked";
    case "success":
      return "completed";
    case "recovered":
      return "completed";
    default:
      return "active";
  }
}

/**
 * Índice do passo “em foco” (0..EXECUTION_STEPS.length-1).
 * Heurística só para UI — não altera o runtime.
 */
export function deriveOperationalPrimaryIndex(opts: {
  runId: string | null;
  newActivityFlow: boolean;
  summary: RunSummaryDto | null;
  events: readonly RuntimeEventDto[];
  clarificationRuntimePhase: ClarificationRuntimePhase | null;
  strategyRuntimePhase: StrategyRuntimePhase | null;
}): number {
  const {
    runId,
    newActivityFlow,
    summary,
    events,
    clarificationRuntimePhase,
    strategyRuntimePhase,
  } = opts;

  if (newActivityFlow && !runId) return 0;
  if (!runId || !summary) return 0;

  const st = summary.state;
  const life = mapRawPhaseToLifecycleId(summary.phase);

  if (st === "success") return EXECUTION_STEPS.length - 1;

  if (st === "failed") {
    const failIdx: Partial<Record<LifecyclePhaseId, number>> = {
      intake: 3,
      clarification: 8,
      strategy: 10,
      execution: 15,
      review: 21,
      correction: 23,
      rollback: 26,
      integrity: 33,
      completed: 33,
    };
    return failIdx[life] ?? 15;
  }

  if (life === "intake") {
    if (!hasEvent(events, "knowledge_bootstrap_ready") && !hasEvent(events, "run_created")) {
      return 0;
    }
    if (!hasEvent(events, "run_created")) return 2;
    if (!hasEvent(events, "runtime_started")) return 4;
    return 5;
  }

  if (
    (life === "clarification" || life === "strategy") &&
    isClarificationWorkflowComplete(clarificationRuntimePhase)
  ) {
    if (strategyRuntimePhase === "strategy_generating") return 9;
    if (
      strategyRuntimePhase === "strategy_ready" ||
      strategyRuntimePhase === "strategy_blocked" ||
      strategyRuntimePhase === "strategy_approved" ||
      strategyRuntimePhase === "ready_for_execution"
    ) {
      return 10;
    }
    return 9;
  }

  if (life === "clarification") {
    const collectionDone = isClarificationCollectionComplete({
      runtimePhase: clarificationRuntimePhase,
    });
    if (
      clarificationRuntimePhase === "awaiting_approval" ||
      clarificationRuntimePhase === "refinement_ready" ||
      clarificationRuntimePhase === "refining" ||
      clarificationRuntimePhase === "approved" ||
      clarificationRuntimePhase === "rejected"
    ) {
      return 8;
    }
    if (st === "waiting_approval" || collectionDone) return 8;
    if (st === "waiting_clarification_answers") return 7;
    if (clarificationRuntimePhase === "waiting_answers") return 7;
    if (clarificationRuntimePhase === "clarification_empty") return 6;
    return 6;
  }

  if (life === "strategy") {
    if (strategyRuntimePhase === "strategy_generating") return 9;
    if (
      strategyRuntimePhase === "strategy_ready" ||
      strategyRuntimePhase === "strategy_blocked"
    )
      return 10;
    if (st === "waiting_approval") return 10;
    return 9;
  }

  if (life === "execution") {
    if (st === "waiting_approval") return 20;
    return 14;
  }

  if (life === "review") {
    return 20;
  }

  if (life === "correction") {
    if (st === "retrying") return 24;
    return 23;
  }

  if (life === "rollback") return 26;
  if (life === "integrity") return 33;

  if (life === "completed") return EXECUTION_STEPS.length - 1;

  return 14;
}

function statusForIndex(
  i: number,
  primary: number,
  summary: RunSummaryDto | null,
  newActivityFlow: boolean,
  runId: string | null,
  clarificationRuntimePhase: ClarificationRuntimePhase | null,
  strategyRuntimePhase: StrategyRuntimePhase | null,
): { status: OperationalStepStatus; phase: "past" | "current" | "future" } {
  if (!summary && newActivityFlow && !runId) {
    if (i === 0) return { status: "active", phase: "current" };
    return { status: "pending", phase: "future" };
  }
  if (!summary) {
    return { status: "pending", phase: "future" };
  }

  const st = summary.state;

  if (st === "success") {
    return { status: "completed", phase: "past" };
  }

  if (i < primary) return { status: "completed", phase: "past" };
  if (i > primary) return { status: "pending", phase: "future" };

  const isPrimary = true;
  if (st === "failed" && i === primary) return { status: "failed", phase: "current" };
  if (st === "blocked" && i === primary)
    return { status: "blocked", phase: "current" };
  const collectionDone = isClarificationCollectionComplete({
    runtimePhase: clarificationRuntimePhase,
  });
  const workflowDone = isClarificationWorkflowComplete(
    clarificationRuntimePhase,
  );
  if (i === primary && workflowDone) {
    const strategyStatus = deriveStrategyOperationalStatus(strategyRuntimePhase, {
      clarificationHandoff: true,
    });
    if (strategyStatus) {
      return { status: strategyStatus, phase: "current" };
    }
  }
  if (
    (st === "waiting_clarification_answers" ||
      st === "waiting_clarification_questions") &&
    i === primary &&
    !collectionDone
  ) {
    return { status: "waiting_input", phase: "current" };
  }
  if (
    st === "waiting_approval" &&
    i === primary &&
    collectionDone &&
    !workflowDone
  ) {
    return { status: "waiting_input", phase: "current" };
  }
  if ((st === "running" || st === "retrying" || st === "correcting") && i === primary) {
    return { status: "running", phase: "current" };
  }
  return {
    status: mapRuntimeStateToOperational(st, isPrimary),
    phase: "current",
  };
}

export type OperationalPipelineRow = {
  definition: ExecutionStepDefinition;
  status: OperationalStepStatus;
  timelinePhase: "past" | "current" | "future";
  scrollTargetId: string | null;
};

export function buildOperationalPipelineRows(opts: {
  runId: string | null;
  newActivityFlow: boolean;
  summary: RunSummaryDto | null;
  events: readonly RuntimeEventDto[];
  clarificationRuntimePhase: ClarificationRuntimePhase | null;
  strategyRuntimePhase: StrategyRuntimePhase | null;
}): OperationalPipelineRow[] {
  const rawPrimary = deriveOperationalPrimaryIndex(opts);
  const primary =
    opts.runId && opts.summary
      ? Math.max(rawPrimary, 2)
      : rawPrimary;
  return EXECUTION_STEPS.map((definition, i) => {
    const { status, phase } = statusForIndex(
      i,
      primary,
      opts.summary,
      opts.newActivityFlow,
      opts.runId,
      opts.clarificationRuntimePhase,
      opts.strategyRuntimePhase,
    );
    return {
      definition,
      status,
      timelinePhase: phase,
      scrollTargetId: scrollTargetForStep(definition.id),
    };
  });
}

export function deriveOperationalHighlightIndex(
  rows: readonly OperationalPipelineRow[],
): number {
  const cur = rows.findIndex((r) => r.timelinePhase === "current");
  if (cur >= 0) return cur;
  return Math.max(0, rows.length - 1);
}
