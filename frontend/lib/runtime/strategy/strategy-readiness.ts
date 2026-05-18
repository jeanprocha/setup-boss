import type { StrategyBundleDto } from "./strategy-types";

/** Strategy suficiente para pensar em execução (spec mínima gerada no runtime). */
export function isStrategyGenerationComplete(
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
