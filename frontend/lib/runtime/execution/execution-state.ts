import type {
  ExecutionBundleDto,
  ExecutionLifecyclePhase,
  ExecutionSummaryDto,
} from "@/lib/runtime/execution/execution-types";

const PHASE_FROM_RAW: Record<string, ExecutionLifecyclePhase> = {
  execution_pending: "execution_pending",
  execution_running: "execution_running",
  review_running: "review_running",
  correction_running: "correction_running",
  retry_running: "retry_running",
  rollback_running: "rollback_running",
  recovery_running: "recovery_running",
  execution_blocked: "execution_blocked",
  execution_failed: "execution_failed",
  execution_completed: "execution_completed",
};

export function normalizeExecutionLifecyclePhase(
  raw: string | null | undefined,
): ExecutionLifecyclePhase {
  const k = String(raw || "").trim().toLowerCase();
  if (k in PHASE_FROM_RAW) return PHASE_FROM_RAW[k];
  if (k === "running" || k === "execution") return "execution_running";
  if (k === "review" || k === "waiting_approval") return "review_running";
  if (k === "correction" || k === "correcting") return "correction_running";
  if (k === "retry" || k === "retrying") return "retry_running";
  if (k === "rollback") return "rollback_running";
  if (k === "recovery" || k === "recovered") return "recovery_running";
  if (k === "blocked") return "execution_blocked";
  if (k === "failed") return "execution_failed";
  if (k === "success" || k === "completed" || k === "done")
    return "execution_completed";
  return "execution_pending";
}

export function deriveLifecycleFromRunMeta(
  phaseRaw: string | null | undefined,
  stateRaw: string | null | undefined,
  bundle: ExecutionBundleDto | null,
): ExecutionLifecyclePhase {
  if (bundle?.summary.lifecycle.phase) return bundle.summary.lifecycle.phase;
  const p = String(phaseRaw || "").toLowerCase();
  const s = String(stateRaw || "").toLowerCase();
  if (s === "failed") return "execution_failed";
  if (s === "blocked") return "execution_blocked";
  if (s === "correcting") return "correction_running";
  if (s === "retrying") return "retry_running";
  if (s === "recovered") return "recovery_running";
  if (s === "waiting_approval") return "review_running";
  if (s === "success" && (p === "execution" || p === "review")) {
    return "execution_completed";
  }
  if (p === "execution" || s === "running") return "execution_running";
  if (p === "review") return "review_running";
  if (p === "correction") return "correction_running";
  if (p === "rollback") return "rollback_running";
  if (p === "stabilization" || p === "integrity") return "recovery_running";
  return "execution_pending";
}

export function executionAppliesToRun(
  phaseRaw: string | null | undefined,
  stateRaw: string | null | undefined,
): boolean {
  const p = String(phaseRaw || "").toLowerCase();
  const s = String(stateRaw || "").toLowerCase();
  if (p === "intake" || p === "clarify" || p === "clarification") return false;
  if (p === "strategy" && s === "success") return true;
  if (
    p === "execution" ||
    p === "review" ||
    p === "correction" ||
    p === "rollback" ||
    p === "stabilization" ||
    p === "integrity"
  ) {
    return true;
  }
  if (
    s === "running" ||
    s === "correcting" ||
    s === "retrying" ||
    s === "recovered" ||
    s === "blocked" ||
    s === "waiting_approval"
  ) {
    return true;
  }
  return false;
}

export type ExecutionAvailability = {
  canViewEvidence: boolean;
  canViewDiagnostics: boolean;
  degraded: boolean;
  blockedReason: string | null;
};

export function deriveExecutionAvailability(
  bundle: ExecutionBundleDto | null,
  opts: {
    connectionDegraded: boolean;
    runtimeReachable: boolean;
  },
): ExecutionAvailability {
  if (!bundle || bundle.summary.source === "unsupported") {
    return {
      canViewEvidence: false,
      canViewDiagnostics: false,
      degraded: true,
      blockedReason:
        bundle?.summary.unsupportedReason ??
        "Execução indisponível para esta corrida.",
    };
  }

  const degraded =
    opts.connectionDegraded ||
    bundle.summary.health === "degraded" ||
    bundle.summary.health === "partial";

  return {
    canViewEvidence: bundle.summary.health !== "unavailable",
    canViewDiagnostics: opts.runtimeReachable,
    degraded,
    blockedReason: degraded
      ? "Runtime degradado — preserve estado conhecido; confirme evidence."
      : null,
  };
}

export function executionHealthLabel(
  health: ExecutionSummaryDto["health"],
): string {
  switch (health) {
    case "healthy":
      return "Execução saudável";
    case "degraded":
      return "Execução degradada";
    case "partial":
      return "Execução parcial";
    default:
      return "Sem sinal de execução";
  }
}
