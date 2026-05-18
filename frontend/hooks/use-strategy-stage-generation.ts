"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchStrategyBundle, postStrategyRun } from "@/lib/runtime/strategy/strategy-actions";
import { isStrategyGenerationComplete } from "@/lib/runtime/strategy/strategy-readiness";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

/**
 * Geração explícita de strategy (POST /runs/:id/strategy) + leitura de readiness.
 * Partilhável entre hero da etapa Strategy e painel de clarificação (modo compacto).
 */
export function useStrategyStageGeneration(opts: {
  runKey: string | null;
  enabled: boolean;
  onAfterSuccess?: () => void | Promise<void>;
}) {
  const { runKey, enabled, onAfterSuccess } = opts;
  const qc = useQueryClient();
  const runtimeReachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const strategyProbe = useQuery({
    queryKey: [...runtimeQueryKeys.strategy(runKey ?? "__none"), "stage-generation"],
    queryFn: () => fetchStrategyBundle(runKey!),
    enabled: Boolean(runKey) && enabled && runtimeReachable,
    staleTime: 5_000,
  });

  const generateStrategy = useMutation({
    mutationFn: async () => {
      if (!runKey) throw new Error("runKey em falta");
      return postStrategyRun(runKey);
    },
    onSuccess: async () => {
      if (runKey) {
        await qc.invalidateQueries({ queryKey: runtimeQueryKeys.strategy(runKey) });
        await qc.invalidateQueries({ queryKey: runtimeQueryKeys.clarification(runKey) });
        await qc.invalidateQueries({ queryKey: runtimeQueryKeys.execution(runKey) });
        await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
      }
      await strategyProbe.refetch();
      await onAfterSuccess?.();
    },
  });

  const ready = isStrategyGenerationComplete(strategyProbe.data ?? null);

  return {
    runtimeReachable,
    strategyProbe,
    generateStrategy,
    strategyArtifactsReady: ready,
  };
}
