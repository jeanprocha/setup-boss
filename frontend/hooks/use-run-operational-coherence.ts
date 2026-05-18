"use client";

import { useMemo } from "react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import { deriveRunOperationalCoherence } from "@/lib/runtime/observability/derive-run-operational-coherence";
import { useRuntimeHeartbeatSnapshot } from "@/hooks/use-runtime-heartbeat";

export function useRunOperationalCoherence(opts: {
  summary: RunSummaryDto | null;
  strategy: StrategyBundleDto | null | undefined;
  clarification: ClarificationBundleDto | null | undefined;
  executionLifecyclePhase?: string | null;
  strategyReadyOverride?: boolean;
  heroActive?: boolean;
  uiExecutionProcessing?: boolean;
}) {
  const { heartbeat } = useRuntimeHeartbeatSnapshot();

  return useMemo(
    () =>
      deriveRunOperationalCoherence({
        ...opts,
        heartbeat,
      }),
    [
      opts.summary,
      opts.strategy,
      opts.clarification,
      opts.executionLifecyclePhase,
      opts.strategyReadyOverride,
      opts.heroActive,
      opts.uiExecutionProcessing,
      heartbeat,
    ],
  );
}
