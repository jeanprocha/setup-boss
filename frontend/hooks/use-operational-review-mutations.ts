"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  postOperationalReviewConfirm,
  postOperationalReviewRequestAdjustment,
} from "@/lib/runtime/operational/operational-review-actions";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useOperationalReviewMutations(opts: {
  runKey: string | null;
  projectId: string | null;
}) {
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    if (opts.runKey) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.operationalReview(opts.runKey),
      });
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.execution(opts.runKey),
      });
    }
    if (opts.projectId) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
    }
  };

  const confirmReview = useMutation({
    mutationFn: async (notes?: string) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      const r = await postOperationalReviewConfirm(opts.runKey, notes);
      if (!r.ok) throw new Error(r.message ?? "Falha ao confirmar review.");
      return r;
    },
    onSuccess: invalidate,
  });

  const requestAdjustment = useMutation({
    mutationFn: async (notes: string) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      const trimmed = notes.trim();
      if (!trimmed) throw new Error("Descreva o ajuste pretendido.");
      const r = await postOperationalReviewRequestAdjustment(opts.runKey, trimmed);
      if (!r.ok) throw new Error(r.message ?? "Falha ao solicitar ajuste.");
      return r;
    },
    onSuccess: invalidate,
  });

  return { confirmReview, requestAdjustment };
}
