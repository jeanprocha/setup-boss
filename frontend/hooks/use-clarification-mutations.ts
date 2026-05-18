"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import {
  fetchClarificationBundle,
  postClarificationAnswers,
  postClarificationApprove,
  postClarificationReject,
  postClarificationRequestRefinement,
} from "@/lib/runtime/clarification/clarification-actions";
import type { SubmitAnswersPayload } from "@/lib/runtime/clarification/clarification-types";
import { canSubmitAnswersPayload } from "@/lib/runtime/clarification/clarification-state";
import { useClarificationAuditStore } from "@/stores/clarification-audit-store";
import {
  shouldOpenStrategyTab,
  useClarificationStore,
} from "@/stores/clarification-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

export function useClarificationMutations(opts: {
  runKey: string | null;
  jobId: string | null;
  runId: string | null;
  projectId: string | null;
  refinementAvailable?: boolean;
}) {
  const qc = useQueryClient();
  const pushAudit = useClarificationAuditStore((s) => s.push);
  const requestStrategyBootstrap = useClarificationStore(
    (s) => s.requestStrategyBootstrap,
  );
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    if (opts.runKey) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.clarification(opts.runKey),
      });
      await qc.refetchQueries({
        queryKey: runtimeQueryKeys.clarification(opts.runKey),
      });
    }
    if (opts.projectId) {
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
      await qc.refetchQueries({
        queryKey: runtimeQueryKeys.projectRuns(opts.projectId),
      });
    }
    if (opts.runId || opts.runKey) {
      const rk = opts.runId ?? opts.runKey;
      await qc.invalidateQueries({
        queryKey: runtimeQueryKeys.strategy(rk),
      });
    }
  };

  const submitAnswers = useMutation({
    mutationFn: async (payload: SubmitAnswersPayload) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      const guard = canSubmitAnswersPayload(payload.answers);
      if (!guard.ok) throw new Error(guard.reason);
      const r = await postClarificationAnswers(opts.runKey, payload);
      if (!r.ok) throw new Error(r.message);
      return r;
    },
    onSuccess: async (_result, vars) => {
      pushAudit({
        kind: "answers_submitted",
        message: `${vars.answers.length} resposta(s) submetida(s).`,
        jobId: opts.jobId,
        runId: opts.runId ?? opts.runKey,
        severity: "info",
      });
      pushAudit({
        kind: "refinement_generated",
        message: "Refinement executado após submissão de respostas.",
        jobId: opts.jobId,
        runId: opts.runId ?? opts.runKey,
        severity: "info",
      });
      await invalidate();
    },
  });

  const approve = useMutation({
    mutationFn: async (input?: {
      notes?: string;
      recommendedMode?: "basic" | "standard" | "expert";
      priority?: "low" | "normal" | "high";
    }) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      if (opts.refinementAvailable === false) {
        throw new Error(
          "Refinement ainda não disponível — não é possível aprovar.",
        );
      }
      const r = await postClarificationApprove(opts.runKey, input);
      if (!r.ok) throw new Error(r.message);
      return r;
    },
    onSuccess: async (result) => {
      pushAudit({
        kind: "approved",
        message: "Plano aprovado pelo operador.",
        jobId: opts.jobId,
        runId: opts.runId ?? opts.runKey,
        severity: "info",
      });
      const phase =
        result && "data" in result && result.data
          ? result.data.runtimePhase
          : result && "runtimePhase" in result
            ? (result as { runtimePhase?: string | null }).runtimePhase
            : null;
      const phase2 =
        result && "data" in result && result.data
          ? result.data.phase2Status
          : result && "phase2Status" in result
            ? (result as { phase2Status?: string | null }).phase2Status
            : null;
      const bootstrapId = opts.runId ?? opts.runKey;
      if (bootstrapId && shouldOpenStrategyTab(phase, phase2)) {
        requestStrategyBootstrap(bootstrapId);
      }
      await invalidate();
    },
  });

  const reject = useMutation({
    mutationFn: async (notes?: string) => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      const r = await postClarificationReject(opts.runKey, notes);
      if (!r.ok) throw new Error(r.message);
      return r;
    },
    onSuccess: async () => {
      pushAudit({
        kind: "rejected",
        message: "Plano rejeitado — gate HITL fechado.",
        jobId: opts.jobId,
        runId: opts.runId ?? opts.runKey,
        severity: "warn",
      });
      await invalidate();
    },
  });

  const requestRefinement = useMutation({
    mutationFn: async () => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      const r = await postClarificationRequestRefinement(opts.runKey);
      if (!r.ok) throw new Error(r.message);
      return r;
    },
    onSuccess: async () => {
      pushAudit({
        kind: "refinement_requested",
        message: "Refinamento solicitado pelo operador.",
        jobId: opts.jobId,
        runId: opts.runId ?? opts.runKey,
        severity: "info",
      });
      await invalidate();
    },
  });

  const refreshClarification = useMutation({
    mutationFn: async () => {
      if (!opts.runKey) throw new Error("runKey em falta");
      if (!reachable) throw new Error("Runtime offline.");
      return fetchClarificationBundle(opts.runKey);
    },
    onSuccess: (bundle) => {
      if (opts.runKey) {
        qc.setQueryData(runtimeQueryKeys.clarification(opts.runKey), bundle);
      }
    },
  });

  return {
    submitAnswers,
    approve,
    reject,
    requestRefinement,
    refreshClarification,
  };
}
