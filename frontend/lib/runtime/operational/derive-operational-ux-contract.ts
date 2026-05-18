import type { RunSummaryDto, RuntimeEventDto } from "../../api/runtime-types.ts";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import {
  isClarificationCollectionComplete,
  isClarificationWorkflowComplete,
  shouldShowClarificationApprovalGate,
} from "../clarification/clarification-operational-state.ts";
/** Cópia mínima de `mapRawPhaseToLifecycleId` — evita dependência de i18n/stores em testes node. */
function mapRawPhaseToLifecycleId(
  raw: string | null | undefined,
):
  | "intake"
  | "clarification"
  | "strategy"
  | "execution"
  | "review"
  | "correction"
  | "completed" {
  const p = String(raw || "")
    .trim()
    .toLowerCase();
  if (!p) return "intake";
  if (p === "clarify" || p === "clarification") return "clarification";
  if (p === "queue" || p === "pending" || p === "intake") return "intake";
  if (p === "strategy") return "strategy";
  if (p === "execution" || p === "running") return "execution";
  if (p === "review" || p === "waiting_approval") return "review";
  if (p === "correction" || p === "correcting") return "correction";
  if (
    p === "done" ||
    p === "completed" ||
    p === "success" ||
    p === "failed" ||
    p === "cancelled"
  ) {
    return "completed";
  }
  return "execution";
}
function isStrategyGenerationComplete(
  bundle: StrategyBundleDto | null | undefined,
): boolean {
  if (!bundle) return false;
  if (bundle.summary.source === "unsupported") return false;
  const rp = bundle.summary.runtimePhase;
  const p3 = String(bundle.summary.phase3Status || "").toLowerCase();
  const ready =
    bundle.summary.operationalReadiness === "ready" ||
    bundle.summary.operationalReadiness === "partial";
  const phaseReady =
    rp === "strategy_ready" ||
    rp === "ready_for_execution" ||
    rp === "strategy_blocked" ||
    p3 === "strategy_ready" ||
    p3 === "ready_for_execution";
  return ready && phaseReady;
}
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";
import {
  labelOperationalUxPhase,
  labelOperationalUxStep,
} from "./operational-ux-labels.ts";
import type {
  DeriveOperationalUxContractInput,
  OperationalUxPhase,
  OperationalUxStep,
  PlanningStatus,
  RunOperationalUxContract,
} from "./operational-ux-types.ts";

const INITIAL_SPEC_EVENT_RE =
  /task_plan_initial|spec_draft_ready|initial_spec_ready|intake_completed/i;
const CONTEXT_LOADED_EVENT_RE =
  /knowledge_bootstrap_ready|governance_ia_ok|context_loaded/i;
const IA_FAIL_EVENT_RE =
  /knowledge_bootstrap_failed|knowledge_bootstrap_missing|governance_ia_failed/i;

function eventType(ev: RuntimeEventDto): string {
  return String(ev.type ?? "").toLowerCase();
}

function scanEvents(events: readonly RuntimeEventDto[] | undefined) {
  const list = events ?? [];
  let contextLoaded = false;
  let initialSpecReady = false;
  let iaFailed = false;
  let iaOk = false;

  for (const ev of list) {
    const t = eventType(ev);
    if (CONTEXT_LOADED_EVENT_RE.test(t)) contextLoaded = true;
    if (INITIAL_SPEC_EVENT_RE.test(t)) initialSpecReady = true;
    if (IA_FAIL_EVENT_RE.test(t)) iaFailed = true;
    if (/governance_ia_ok|knowledge_bootstrap_ready/.test(t)) iaOk = true;
  }

  return { contextLoaded, initialSpecReady, iaFailed, iaOk };
}

function deriveIaValidated(
  governanceReadiness: DeriveOperationalUxContractInput["governanceReadiness"],
  governanceOk: boolean | null | undefined,
  eventScan: ReturnType<typeof scanEvents>,
): boolean | null {
  if (governanceReadiness === "blocked") return false;
  if (governanceReadiness === "ready" || governanceReadiness === "warning") {
    return true;
  }
  if (governanceOk === true) return true;
  if (governanceOk === false || eventScan.iaFailed) return false;
  if (eventScan.iaOk) return true;
  return null;
}

function deriveContextLoaded(
  eventScan: ReturnType<typeof scanEvents>,
  life: ReturnType<typeof mapRawPhaseToLifecycleId>,
): boolean {
  if (eventScan.contextLoaded) return true;
  return life !== "intake";
}

function deriveInitialSpecReady(
  eventScan: ReturnType<typeof scanEvents>,
  life: ReturnType<typeof mapRawPhaseToLifecycleId>,
  clarificationApplies: boolean,
  clarification: ClarificationBundleDto | null | undefined,
): boolean {
  if (eventScan.initialSpecReady) return true;
  if (life === "clarification" || life === "strategy") return true;
  if (clarificationApplies && clarification) return true;
  return false;
}

function derivePlanningStatus(
  clarification: ClarificationBundleDto | null | undefined,
  clarificationApplies: boolean,
  strategy: StrategyBundleDto | null | undefined,
  strategyApplies: boolean,
): PlanningStatus {
  if (!clarificationApplies && !strategyApplies) return "idle";

  const rp = clarification?.session.runtimePhase;
  const pending =
    clarification?.questions.filter((q) => q.status === "pending").length ?? 0;

  if (rp === "refining") return "generating_plan";
  if (rp === "waiting_answers" || (pending > 0 && rp !== "clarification_empty")) {
    return pending > 0 ? "questions_pending" : "collecting_answers";
  }
  if (rp === "clarification_required") return "questions_pending";

  const strategyPhase = strategy?.summary.runtimePhase;
  if (
    strategyApplies &&
    (strategyPhase === "strategy_generating" ||
      strategyPhase === "strategy_pending" ||
      clarification?.approval.status === "approved")
  ) {
    return "strategy_building";
  }

  if (
    clarification &&
    (rp === "refinement_ready" ||
      rp === "awaiting_approval" ||
      clarification.refinement.available)
  ) {
    return "plan_ready_for_review";
  }

  if (rp === "rejected") return "adjusting_plan";

  if (
    isClarificationWorkflowComplete(rp) &&
    isStrategyGenerationComplete(strategy)
  ) {
    return "complete";
  }

  if (clarification && isClarificationCollectionComplete(clarification)) {
    return "generating_plan";
  }

  return clarificationApplies ? "collecting_answers" : "idle";
}

function deriveFinalPlanReady(
  clarification: ClarificationBundleDto | null | undefined,
  strategy: StrategyBundleDto | null | undefined,
  strategyApplies: boolean,
): boolean {
  if (!clarification?.refinement.available) return false;
  if (!strategyApplies) {
    return (
      clarification.session.runtimePhase === "refinement_ready" ||
      clarification.session.runtimePhase === "awaiting_approval"
    );
  }
  return isStrategyGenerationComplete(strategy);
}

function resolveApprovalActive(
  clarification: ClarificationBundleDto | null | undefined,
  finalPlanReady: boolean,
): boolean {
  if (!clarification) return false;
  if (shouldShowClarificationApprovalGate(clarification)) {
    const st = clarification.approval.status;
    if (st === "pending" || st === "none") return true;
  }
  return (
    finalPlanReady &&
    clarification.approval.status !== "approved" &&
    (clarification.session.runtimePhase === "awaiting_approval" ||
      clarification.session.runtimePhase === "refinement_ready")
  );
}

function resolveVersioningActive(summary: RunSummaryDto | null): boolean {
  const git = summary?.git;
  if (!git) return false;
  const st = String(git.status ?? "");
  if (st === "git_branch_ready") return false;
  if (st === "git_branch_pending") return true;
  if (summary?.git?.executeBlockCode === "git_branch_required") return true;
  return false;
}

function resolveExecutionPreStartActive(
  summary: RunSummaryDto | null,
  approvalActive: boolean,
  executionLifecyclePhase: string | null,
): boolean {
  if (!summary || approvalActive) return false;
  if (String(summary.git?.status ?? "") !== "git_branch_ready") return false;
  const phase = executionLifecyclePhase;
  if (!phase || phase === "execution_pending") return true;
  return (
    phase === "execution_running" ||
    phase === "review_running" ||
    phase === "correction_running" ||
    phase === "retry_running" ||
    phase === "recovery_running" ||
    phase === "execution_blocked" ||
    phase === "execution_failed" ||
    phase === "execution_completed"
  );
}

function resolveUxPhase(input: {
  summary: RunSummaryDto | null;
  life: ReturnType<typeof mapRawPhaseToLifecycleId>;
  newActivityFlow: boolean;
  clarificationApplies: boolean;
  strategyApplies: boolean;
  executionApplies: boolean;
  executionLifecyclePhase: string | null;
  initialSpecReady: boolean;
  approvalActive: boolean;
  versioningActive: boolean;
  planningStatus: PlanningStatus;
  operationalReviewStatus: string | null;
  operationalFinalizationStatus: string | null;
}): OperationalUxPhase {
  const {
    summary,
    life,
    newActivityFlow,
    clarificationApplies,
    strategyApplies,
    executionApplies,
    executionLifecyclePhase,
    initialSpecReady,
    approvalActive,
    versioningActive,
    planningStatus,
    operationalReviewStatus,
    operationalFinalizationStatus,
  } = input;

  const state = summary?.state ?? "";

  if (
    operationalReviewStatus === "confirmed" &&
    operationalFinalizationStatus !== "adjustment_requested"
  ) {
    return "finalization";
  }

  if (executionLifecyclePhase === "execution_completed") {
    return "review";
  }

  if (life === "completed" || state === "cancelled") {
    return "finalization";
  }

  if (state === "success" && life === "execution") {
    return "review";
  }

  if (
    executionApplies &&
    (executionLifecyclePhase === "review_running" ||
      executionLifecyclePhase === "correction_running" ||
      life === "review" ||
      life === "correction")
  ) {
    return "review";
  }

  if (
    executionApplies &&
    (executionLifecyclePhase === "execution_running" ||
      executionLifecyclePhase === "retry_running" ||
      executionLifecyclePhase === "recovery_running" ||
      life === "execution")
  ) {
    return "execution";
  }

  if (versioningActive) return "versioning";

  if (
    resolveExecutionPreStartActive(
      summary,
      approvalActive,
      executionLifecyclePhase,
    )
  ) {
    return "execution";
  }

  if (approvalActive) return "approval";

  if (
    clarificationApplies ||
    strategyApplies ||
    planningStatus !== "idle" ||
    (life === "clarification" || life === "strategy")
  ) {
    if (initialSpecReady || life !== "intake") return "planning";
  }

  if (newActivityFlow && !summary?.runId) return "initialization";
  if (life === "intake" || !initialSpecReady) return "initialization";

  if (life === "clarification" || life === "strategy") return "planning";

  return "initialization";
}

function resolveUxStep(input: {
  uxPhase: OperationalUxPhase;
  newActivityFlow: boolean;
  summary: RunSummaryDto | null;
  iaValidated: boolean | null;
  contextLoaded: boolean;
  initialSpecReady: boolean;
  planningStatus: PlanningStatus;
  clarification: ClarificationBundleDto | null | undefined;
  requiresHumanAction: boolean;
}): OperationalUxStep {
  const {
    uxPhase,
    newActivityFlow,
    summary,
    iaValidated,
    contextLoaded,
    initialSpecReady,
    planningStatus,
    clarification,
    requiresHumanAction,
  } = input;

  if (uxPhase === "finalization") return "run_complete";
  if (uxPhase === "review") return "review_active";
  if (uxPhase === "execution") return "execution_active";
  if (uxPhase === "versioning") return "versioning_branch";
  if (uxPhase === "approval") {
    return requiresHumanAction ? "plan_approval_gate" : "plan_approval_gate";
  }

  if (uxPhase === "planning") {
    switch (planningStatus) {
      case "questions_pending":
        return "planning_questions";
      case "collecting_answers":
        return "planning_answers";
      case "generating_plan":
      case "adjusting_plan":
        return "planning_refine";
      case "plan_ready_for_review":
        return "plan_approval_gate";
      case "strategy_building":
        return "planning_strategy";
      case "complete":
        return "planning_strategy";
      default:
        return clarification?.questions.length
          ? "planning_questions"
          : "planning_refine";
    }
  }

  if (newActivityFlow && !summary?.runId) {
    if (iaValidated === false) return "ia_validation";
    return "compose_activity";
  }

  if (!contextLoaded) return "context_load";
  if (!initialSpecReady) return "initial_spec";
  if (iaValidated === false) return "ia_validation";
  if (iaValidated === null) return "ia_validation";

  return "initial_spec";
}

function deriveRequiresHumanAction(
  uxPhase: OperationalUxPhase,
  planningStatus: PlanningStatus,
  clarification: ClarificationBundleDto | null | undefined,
  summary: RunSummaryDto | null,
): boolean {
  if (uxPhase === "approval") return true;
  if (planningStatus === "questions_pending") return true;
  if (clarification?.session.runtimePhase === "waiting_answers") return true;
  if (
    planningStatus === "plan_ready_for_review" &&
    clarification?.approval.status === "pending"
  ) {
    return true;
  }
  if (summary?.state === "waiting_approval") return true;
  return false;
}

const DEFAULT_CONTRACT: RunOperationalUxContract = {
  uxPhase: "initialization",
  uxStep: "idle",
  uxPhaseLabelPt: labelOperationalUxPhase("initialization"),
  uxStepLabelPt: labelOperationalUxStep("idle"),
  iaValidated: null,
  contextLoaded: false,
  initialSpecReady: false,
  planningStatus: "idle",
  planningQuestionsPending: 0,
  finalPlanReady: false,
  requiresHumanAction: false,
  isInitializationPhase: true,
  isPlanningPhase: false,
  confidence: "fallback",
};

/**
 * Normalizador central: estados internos do runtime → contrato UX operacional.
 */
export function deriveOperationalUxContract(
  input: DeriveOperationalUxContractInput,
): RunOperationalUxContract {
  const {
    summary,
    newActivityFlow = false,
    governanceReadiness = null,
    governanceOk = null,
    clarificationBundle = null,
    clarificationApplies = false,
    strategyBundle = null,
    strategyApplies = false,
    executionApplies = false,
    executionLifecyclePhase = null,
    events,
    operationalReviewStatus = null,
    operationalFinalizationStatus = null,
  } = input;

  if (!summary && !newActivityFlow) {
    return DEFAULT_CONTRACT;
  }

  const life = mapRawPhaseToLifecycleId(summary?.phase);
  const eventScan = scanEvents(events);

  const iaValidated = deriveIaValidated(governanceReadiness, governanceOk, eventScan);
  const contextLoaded = deriveContextLoaded(eventScan, life);
  const initialSpecReady = deriveInitialSpecReady(
    eventScan,
    life,
    clarificationApplies,
    clarificationBundle,
  );

  const planningQuestionsPending =
    clarificationBundle?.questions.filter((q) => q.status === "pending").length ??
    clarificationBundle?.session.pendingBlockingCount ??
    0;

  const planningStatus = derivePlanningStatus(
    clarificationBundle,
    clarificationApplies,
    strategyBundle,
    strategyApplies,
  );

  const finalPlanReady = deriveFinalPlanReady(
    clarificationBundle,
    strategyBundle,
    strategyApplies,
  );

  const approvalActive = resolveApprovalActive(clarificationBundle, finalPlanReady);
  const versioningActive = resolveVersioningActive(summary);

  const uxPhase = resolveUxPhase({
    summary,
    life,
    newActivityFlow,
    clarificationApplies,
    strategyApplies,
    executionApplies,
    executionLifecyclePhase,
    initialSpecReady,
    approvalActive,
    versioningActive,
    planningStatus,
    operationalReviewStatus,
    operationalFinalizationStatus,
  });

  const requiresHumanAction = deriveRequiresHumanAction(
    uxPhase,
    planningStatus,
    clarificationBundle,
    summary,
  );

  const uxStep = resolveUxStep({
    uxPhase,
    newActivityFlow,
    summary,
    iaValidated,
    contextLoaded,
    initialSpecReady,
    planningStatus,
    clarification: clarificationBundle,
    requiresHumanAction,
  });

  let confidence: RunOperationalUxContract["confidence"] = "derived";
  if (clarificationBundle?.source === "runtime" || strategyBundle?.source === "runtime") {
    confidence = "high";
  }
  if (!summary && newActivityFlow) {
    confidence = governanceReadiness != null ? "high" : "fallback";
  }

  return {
    uxPhase,
    uxStep,
    uxPhaseLabelPt: labelOperationalUxPhase(uxPhase),
    uxStepLabelPt: labelOperationalUxStep(uxStep),
    iaValidated,
    contextLoaded,
    initialSpecReady,
    planningStatus,
    planningQuestionsPending,
    finalPlanReady,
    requiresHumanAction,
    isInitializationPhase: uxPhase === "initialization",
    isPlanningPhase: uxPhase === "planning",
    confidence,
  };
}

/** Mapeia fase interna legada (lifecycle) para fase UX — uso em adaptadores. */
export function mapLifecyclePhaseToOperationalUx(
  rawPhase: string | null | undefined,
): OperationalUxPhase {
  const life = mapRawPhaseToLifecycleId(rawPhase);
  switch (life) {
    case "intake":
      return "initialization";
    case "clarification":
    case "strategy":
      return "planning";
    case "execution":
      return "execution";
    case "review":
    case "correction":
      return "review";
    case "completed":
      return "finalization";
    default:
      return "execution";
  }
}

/** Mapeia tipo de evento técnico → fase UX (heurística defensiva). */
export function mapRuntimeEventTypeToOperationalUx(eventTypeRaw: string): OperationalUxPhase | null {
  const t = String(eventTypeRaw || "").toLowerCase();
  if (!t) return null;
  if (/knowledge_bootstrap|intake_|governance_ia|initial_spec|task_plan_initial|spec_draft/.test(t)) {
    return "initialization";
  }
  if (/clarification_approve|approval_requested|awaiting_approval/.test(t)) {
    return "approval";
  }
  if (/clarification|refinement|refine|questions_generated|answers_submitted|plan_refined/.test(t)) {
    return "planning";
  }
  if (/strategy_|decomposition|complexity/.test(t)) {
    return "planning";
  }
  if (/git_branch|versioning/.test(t)) {
    return "versioning";
  }
  if (/execution_|executor_|patch_|tests_/.test(t)) {
    return "execution";
  }
  if (/review_|correction_/.test(t)) {
    return "review";
  }
  if (/completed|finalized|run_completed|job_completed/.test(t)) {
    return "finalization";
  }
  return null;
}
