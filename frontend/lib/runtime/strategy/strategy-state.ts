import type {
  StrategyAvailability,
  StrategyBundleDto,
  StrategyRuntimePhase,
} from "@/lib/runtime/strategy/strategy-types";

const PHASE3_TO_RUNTIME: Record<string, StrategyRuntimePhase> = {
  strategy_pending: "strategy_pending",
  strategy_generating: "strategy_generating",
  strategy_ready: "strategy_ready",
  strategy_blocked: "strategy_blocked",
  strategy_failed: "strategy_failed",
  strategy_approved: "strategy_approved",
  ready_for_execution: "ready_for_execution",
};

export function normalizeStrategyRuntimePhase(
  raw: string | null | undefined,
): StrategyRuntimePhase {
  const k = String(raw || "").trim().toLowerCase();
  if (k in PHASE3_TO_RUNTIME) return PHASE3_TO_RUNTIME[k];
  if (k === "generating" || k === "running") return "strategy_generating";
  if (k === "ready") return "strategy_ready";
  if (k === "blocked") return "strategy_blocked";
  if (k === "failed") return "strategy_failed";
  if (k === "approved") return "strategy_approved";
  return "unavailable";
}

export function mapPhase3StatusToRuntimePhase(
  phase3Status: string | null,
  readiness: StrategyBundleDto["summary"]["operationalReadiness"],
  blockingCount: number,
): StrategyRuntimePhase {
  if (readiness === "ready") {
    if (phase3Status === "ready_for_execution") {
      return "ready_for_execution";
    }
    if (blockingCount > 0) {
      return "strategy_blocked";
    }
    return "strategy_ready";
  }
  const base = phase3Status ? PHASE3_TO_RUNTIME[phase3Status] : null;
  if (phase3Status === "strategy_ready" && blockingCount > 0) {
    return "strategy_blocked";
  }
  return base ?? "strategy_pending";
}

export function strategyAppliesToRun(
  phaseRaw: string | null | undefined,
  stateRaw: string | null | undefined,
): boolean {
  const p = String(phaseRaw || "").toLowerCase();
  const s = String(stateRaw || "").toLowerCase();
  if (p.includes("strategy")) return true;
  /** Handoff pós-clarificação: API usa `clarification` (não só `clarify`) com job ainda activo. */
  if (p === "clarify" || p === "clarification") {
    if (s === "success" || s === "running" || s === "waiting_approval") {
      return true;
    }
  }
  if (
    p === "execution" ||
    p === "review" ||
    p === "correction" ||
    p === "rollback" ||
    p === "stabilization"
  ) {
    return true;
  }
  return false;
}

export function deriveStrategyAvailability(
  bundle: StrategyBundleDto | null,
  ctx: {
    runtimeReachable: boolean;
    connectionDegraded: boolean;
  },
): StrategyAvailability {
  if (!bundle || bundle.summary.source === "unsupported") {
    return {
      readable: false,
      degraded: false,
      blockedReason:
        bundle?.summary.unsupportedReason ??
        "Strategy indisponível para esta corrida.",
    };
  }

  const degraded =
    ctx.connectionDegraded ||
    bundle.summary.source === "partial" ||
    bundle.summary.operationalReadiness === "partial";

  if (!ctx.runtimeReachable && bundle.summary.source === "runtime") {
    return {
      readable: true,
      degraded: true,
      blockedReason: "Runtime offline — dados strategy em cache degradado.",
    };
  }

  return {
    readable: true,
    degraded,
    blockedReason: degraded
      ? "Strategy parcial ou runtime degradado — validar antes de executar."
      : null,
  };
}

export function complexityLevelLabel(level: StrategyBundleDto["complexity"]["level"]): string {
  const map = { low: "Baixa", medium: "Média", high: "Alta", expert: "Expert" } as const;
  return map[level];
}

export function recommendationModeLabel(
  mode: StrategyBundleDto["recommendation"]["recommendedMode"],
): string {
  const map = {
    basic: "Econômico",
    standard: "Padrão",
    expert: "Avançado",
  } as const;
  return map[mode];
}
