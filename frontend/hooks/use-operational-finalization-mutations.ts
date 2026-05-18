"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  postOperationalFinalizationFinalize,
  postOperationalFinalizationRequestAdjustment,
} from "@/lib/runtime/operational/operational-finalization-actions";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useOperationalFinalizationMutations(opts: {
  runKey: string | null;
  projectId: string | null;
}) {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    if (opts.runKey) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.operationalFinalization(opts.runKey),
      });
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.operationalReview(opts.runKey),
      });
    }
    if (opts.projectId) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
    }
  };

  const finalizeActivity = useMutation({
    mutationFn: async (notes?: string) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      const r = await postOperationalFinalizationFinalize(opts.runKey, notes);
      if (!r.ok) throw new Error(r.message ?? "Falha ao finalizar atividade.");
      return r;
    },
    onSuccess: invalidate,
  });

  const requestFinalAdjustment = useMutation({
    mutationFn: async (notes: string) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      const trimmed = notes.trim();
      if (!trimmed) throw new Error("Descreva o ajuste pretendido.");
      const r = await postOperationalFinalizationRequestAdjustment(
        opts.runKey,
        trimmed,
      );
      if (!r.ok) throw new Error(r.message ?? "Falha ao solicitar ajuste final.");
      return r;
    },
    onSuccess: invalidate,
  });

  return { finalizeActivity, requestFinalAdjustment };
}
