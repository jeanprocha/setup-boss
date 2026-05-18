import {
  isStrategyReadyPhase,
  isTerminalRunContext,
} from "@/lib/runtime/observability/derive-runtime-stall-visual";

/** @deprecated Preferir `deriveRunOperationalCoherence` — mantido para testes legados. */
export function shouldShowStrategyProcessingUi(opts: {
  heroActive: boolean;
  strategyReady: boolean;
  needsRetry: boolean;
  runState?: string | null;
  strategyRuntimePhase?: string | null;
}): boolean {
  if (!opts.heroActive || opts.needsRetry) return false;
  if (opts.strategyReady) return false;
  if (isStrategyReadyPhase(opts.strategyRuntimePhase)) return false;
  if (
    isTerminalRunContext({
      runState: opts.runState,
      runtimePhase: opts.strategyRuntimePhase,
    })
  ) {
    return false;
  }
  return true;
}
