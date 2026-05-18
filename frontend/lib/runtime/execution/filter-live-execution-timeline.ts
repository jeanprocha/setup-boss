import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import type { ExecutionBundleDto } from "@/lib/runtime/execution/execution-types";
import type { OperationalPipelineRow } from "@/lib/runtime/execution/derive-operational-pipeline";
import {
  EXECUTION_STEPS,
  type ExecutionStepId,
} from "@/lib/runtime/execution/execution-step-catalog";

export type FilterLiveExecutionTimelineOpts = {
  runId: string | null;
  newActivityFlow: boolean;
  summary: RunSummaryDto | null;
  clarificationBundle: ClarificationBundleDto | null;
  strategyBundle: StrategyBundleDto | null;
  executionBundle: ExecutionBundleDto | null;
  /** Se true, inclui no máximo um passo futuro imediatamente após o actual. */
  includeNextProbableFuture?: boolean;
};

function catalogIndex(id: ExecutionStepId): number {
  const i = EXECUTION_STEPS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

function addIndexRange(
  out: Set<ExecutionStepId>,
  fromId: ExecutionStepId,
  toId: ExecutionStepId,
) {
  const a = catalogIndex(fromId);
  const b = catalogIndex(toId);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (let i = lo; i <= hi; i++) {
    out.add(EXECUTION_STEPS[i]!.id);
  }
}

function clarificationTouched(
  b: ClarificationBundleDto | null,
): boolean {
  if (!b?.session) return false;
  if (b.session.questionsCount > 0 || b.session.answersCount > 0) {
    return true;
  }
  const rp = b.session.runtimePhase;
  return Boolean(rp && rp !== "unavailable");
}

function hasPatchOrArtifactSignal(
  executionBundle: ExecutionBundleDto | null,
  strategyBundle: StrategyBundleDto | null,
): boolean {
  const cor = executionBundle?.summary.correction;
  if (cor?.summary || cor?.rejectionReason) return true;
  const n = strategyBundle?.sharedContext.artifacts.length ?? 0;
  return n > 0;
}

/**
 * Passos do catálogo que fazem sentido mostrar quando a corrida já terminou
 * com sucesso (ou recovered): só o que foi realmente percorrido / tem dados.
 */
function deriveTerminalSuccessVisibleIds(opts: {
  summary: RunSummaryDto;
  clarificationBundle: ClarificationBundleDto | null;
  strategyBundle: StrategyBundleDto | null;
  executionBundle: ExecutionBundleDto | null;
}): Set<ExecutionStepId> {
  const { summary, clarificationBundle, strategyBundle, executionBundle } =
    opts;
  const ids = new Set<ExecutionStepId>();

  addIndexRange(ids, "request_received", "operational_state");

  if (clarificationTouched(clarificationBundle)) {
    addIndexRange(ids, "clarification", "clarification_approval");
  }

  if (strategyBundle?.summary) {
    addIndexRange(ids, "strategy_generated", "execution_plan");
  }

  if (executionBundle) {
    addIndexRange(ids, "current_phase", "executor_running");

    const rev = executionBundle.summary.review;
    if (rev.status !== "none") {
      ids.add("review_in_progress");
      if (rev.status === "approved") ids.add("review_approved");
      if (rev.status === "rejected") ids.add("review_rejected");
    }

    const cor = executionBundle.summary.correction;
    if (cor.status !== "idle" || cor.generation > 0) {
      ids.add("auto_correction");
    }

    const retry = executionBundle.summary.retry;
    if (retry.count > 0 || retry.active) {
      ids.add("retry_execution");
    }

    if (executionBundle.summary.blockers.length > 0) {
      ids.add("flow_blocked");
    }

    if (executionBundle.summary.recovery.status !== "none") {
      ids.add("execution_resumed");
    }

    if (hasPatchOrArtifactSignal(executionBundle, strategyBundle)) {
      ids.add("patch_applied");
      ids.add("files_changed");
      ids.add("diff_summary");
    }
  }

  const ok = summary.state === "success" || summary.state === "recovered";
  if (ok) {
    ids.add("final_result");
    if (executionBundle) {
      ids.add("execution_completed");
    }
  }

  const js = summary.jobStatus?.toLowerCase() ?? "";
  if (js.includes("cancel")) {
    ids.add("execution_cancelled");
  }

  if (summary.branchHint?.trim()) {
    ids.add("pr_generated");
  }

  return ids;
}

/**
 * Reduz o pipeline operacional ao que deve aparecer na timeline central e na
 * aba Execução: instâncias relevantes (sem futuro hipotético além de um passo),
 * e sem expandir o catálogo inteiro quando a corrida já terminou.
 */
export function filterLiveOperationalPipelineRows(
  rows: readonly OperationalPipelineRow[],
  opts: FilterLiveExecutionTimelineOpts,
): OperationalPipelineRow[] {
  const {
    runId,
    newActivityFlow,
    summary,
    clarificationBundle,
    strategyBundle,
    executionBundle,
    includeNextProbableFuture = true,
  } = opts;

  // Fluxo "Nova atividade" sem corrida: só entrada — não antecipar pedido/corrida.
  if (newActivityFlow && !runId) {
    return rows.filter((r) => r.definition.id === "task_intake");
  }

  const primaryIdx = rows.findIndex((r) => r.timelinePhase === "current");
  const terminalOk =
    summary?.state === "success" || summary?.state === "recovered";
  const successIds =
    summary && terminalOk
      ? deriveTerminalSuccessVisibleIds({
          summary,
          clarificationBundle,
          strategyBundle,
          executionBundle,
        })
      : null;

  return rows.filter((row) => {
    const i = catalogIndex(row.definition.id);

    if (row.definition.id === "task_intake") {
      if (runId) return false;
      if (!newActivityFlow) return false;
    }

    if (successIds) {
      if (!successIds.has(row.definition.id)) return false;
    }

    if (!successIds && row.timelinePhase === "future") {
      if (!includeNextProbableFuture) return false;
      if (primaryIdx < 0) return false;
      const curCatalogIdx = catalogIndex(rows[primaryIdx]!.definition.id);
      return i === curCatalogIdx + 1;
    }

    return true;
  });
}
