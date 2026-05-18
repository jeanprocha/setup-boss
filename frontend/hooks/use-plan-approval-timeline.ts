"use client";

import { useCallback, useEffect, useState } from "react";
import type { OperationalPlanPresentation } from "@/lib/runtime/operational/operational-plan-types";
import {
  fetchPlanCommentThreads,
  postPlanCommentAdditionalAnswers,
  postPlanCommentAnalysis,
} from "@/lib/runtime/operational/plan-comment-actions";
import {
  appendPlanApprovalCommentThread,
  readPlanApprovalTimeline,
  updatePlanApprovalThread,
  writePlanApprovalTimeline,
} from "@/lib/runtime/operational/plan-approval-timeline-storage";
import {
  buildPlanTimelineEntries,
  resolveActivePlanEntry,
} from "@/lib/runtime/operational/plan-active-version";
import {
  mergeRemoteThread,
  prepareUpdatedPlanForPersistence,
  sanitizeThreadsUpdatedPlansFromStorage,
} from "@/lib/runtime/operational/plan-updated-plan-sync";
import {
  createPlanApprovalUserCommentBlock,
  type PlanApprovalUserCommentBlock,
  type PlanCommentThreadState,
} from "@/lib/runtime/operational/plan-approval-timeline-types";

function emptyThread(
  comment: PlanApprovalUserCommentBlock,
  remote?: {
    analysis: PlanCommentThreadState["analysis"];
    additionalQuestions: PlanCommentThreadState["additionalQuestions"];
    additionalAnswers: PlanCommentThreadState["additionalAnswers"];
    updatedPlan: PlanCommentThreadState["updatedPlan"];
  },
): PlanCommentThreadState {
  return {
    comment,
    analysisStatus: remote?.analysis ? "done" : "idle",
    analysis: remote?.analysis ?? null,
    analysisError: null,
    additionalQuestions: remote?.additionalQuestions ?? null,
    additionalAnswers: remote?.additionalAnswers ?? null,
    additionalAnswersStatus: remote?.additionalAnswers ? "done" : "idle",
    additionalAnswersError: null,
    updatedPlan: remote?.updatedPlan ?? null,
    updatedPlanStatus: remote?.updatedPlan ? "done" : "idle",
  };
}

export function usePlanApprovalTimeline(
  runKey: string | null,
  planExcerpt?: string,
  basePlan?: OperationalPlanPresentation | null,
) {
  const [threads, setThreads] = useState<PlanCommentThreadState[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [processingCommentId, setProcessingCommentId] = useState<string | null>(
    null,
  );
  const [submittingAnswersFor, setSubmittingAnswersFor] = useState<string | null>(
    null,
  );

  const syncFromStorage = useCallback(() => {
    if (!runKey) {
      setThreads([]);
      return;
    }
    const state = readPlanApprovalTimeline(runKey);
    setThreads(state.threads);
  }, [runKey]);

  useEffect(() => {
    if (!runKey) {
      setThreads([]);
      setHydrated(true);
      return;
    }
    const state = readPlanApprovalTimeline(runKey);
    const sanitized = sanitizeThreadsUpdatedPlansFromStorage(
      state.threads,
      basePlan ?? undefined,
    );
    if (sanitized !== state.threads) {
      writePlanApprovalTimeline(runKey, { version: 2, threads: sanitized });
    }
    setThreads(sanitized);
    setHydrated(true);

    void (async () => {
      const remote = await fetchPlanCommentThreads(runKey);
      if (remote.length === 0) return;
      const local = readPlanApprovalTimeline(runKey);
      const localThreads = sanitizeThreadsUpdatedPlansFromStorage(
        local.threads,
        basePlan ?? undefined,
      );
      let changed = localThreads !== local.threads;
      const merged = localThreads.map((t) => {
        const hit = remote.find((r) => r.comment.id === t.comment.id);
        if (!hit) return t;
        const next = mergeRemoteThread(t, hit, basePlan ?? undefined);
        if (next !== t) changed = true;
        return next;
      });
      for (const r of remote) {
        if (!merged.some((m) => m.comment.id === r.comment.id)) {
          merged.push(
            emptyThread(
              {
                id: r.comment.id,
                kind: "user_comment",
                text: r.comment.text,
                createdAt: r.comment.createdAt,
              },
              r,
            ),
          );
          changed = true;
        }
      }
      if (changed) {
        writePlanApprovalTimeline(runKey, { version: 2, threads: merged });
        setThreads(merged);
      }
    })();
  }, [runKey, basePlan]);

  const planEntries = basePlan?.hasContent
    ? buildPlanTimelineEntries(basePlan, threads)
    : [];
  const activePlanEntry = planEntries.length
    ? resolveActivePlanEntry(planEntries)
    : null;

  const processCommentAnalysis = useCallback(
    async (comment: PlanApprovalUserCommentBlock) => {
      if (!runKey) return;
      setProcessingCommentId(comment.id);
      updatePlanApprovalThread(runKey, comment.id, {
        analysisStatus: "processing",
        analysisError: null,
      });
      syncFromStorage();

      try {
        const result = await postPlanCommentAnalysis(runKey, {
          commentId: comment.id,
          text: comment.text,
          createdAt: comment.createdAt,
          planExcerpt,
          basePlan: basePlan ?? undefined,
        });
        const needsPlan =
          result.analysis.requiresNewPlan && !result.analysis.requiresQuestions;
        const persistedPlan = prepareUpdatedPlanForPersistence(
          result.updatedPlan,
          basePlan ?? undefined,
        );
        const next = updatePlanApprovalThread(runKey, comment.id, {
          analysisStatus: "done",
          analysis: result.analysis,
          analysisError: null,
          additionalQuestions: result.additionalQuestions,
          additionalAnswers: result.additionalAnswers,
          updatedPlan: persistedPlan,
          updatedPlanStatus: persistedPlan
            ? "done"
            : needsPlan
              ? "generating"
              : "idle",
        });
        setThreads(next.threads);
        return result.analysis;
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Não foi possível analisar o comentário.";
        const next = updatePlanApprovalThread(runKey, comment.id, {
          analysisStatus: "error",
          analysisError: msg,
        });
        setThreads(next.threads);
        return null;
      } finally {
        setProcessingCommentId(null);
      }
    },
    [runKey, planExcerpt, basePlan, syncFromStorage],
  );

  const submitAdditionalAnswers = useCallback(
    async (
      commentId: string,
      answers: Array<{ questionId: string; question: string; answer: string }>,
    ) => {
      if (!runKey) return null;
      const thread = readPlanApprovalTimeline(runKey).threads.find(
        (t) => t.comment.id === commentId,
      );
      if (!thread) return null;

      setSubmittingAnswersFor(commentId);
      updatePlanApprovalThread(runKey, commentId, {
        additionalAnswersStatus: "submitting",
        additionalAnswersError: null,
        updatedPlanStatus: "generating",
      });
      syncFromStorage();

      const entries = basePlan?.hasContent
        ? buildPlanTimelineEntries(basePlan, threads)
        : [];
      const activeVersion = entries.length
        ? resolveActivePlanEntry(entries).planVersion
        : 1;

      try {
        const result = await postPlanCommentAdditionalAnswers(
          runKey,
          commentId,
          {
            answers,
            commentText: thread.comment.text,
            analysis: thread.analysis,
            planExcerpt,
            basePlan: basePlan ?? undefined,
            existingPlanVersion: activeVersion,
          },
        );
        const persistedPlan = prepareUpdatedPlanForPersistence(
          result.updatedPlan,
          basePlan ?? undefined,
        );
        const next = updatePlanApprovalThread(runKey, commentId, {
          additionalAnswers: result.additionalAnswers,
          additionalAnswersStatus: "done",
          additionalAnswersError: null,
          updatedPlan: persistedPlan,
          updatedPlanStatus: persistedPlan ? "done" : "generating",
        });
        setThreads(next.threads);
        return result;
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Não foi possível enviar as respostas.";
        const next = updatePlanApprovalThread(runKey, commentId, {
          additionalAnswersStatus: "error",
          additionalAnswersError: msg,
          updatedPlanStatus: "error",
        });
        setThreads(next.threads);
        return null;
      } finally {
        setSubmittingAnswersFor(null);
      }
    },
    [runKey, planExcerpt, basePlan, threads, syncFromStorage],
  );

  const addComment = useCallback(
    async (text: string): Promise<PlanApprovalUserCommentBlock | null> => {
      const trimmed = text.trim();
      if (!trimmed || !runKey) return null;
      const block = createPlanApprovalUserCommentBlock(trimmed);
      const next = appendPlanApprovalCommentThread(runKey, block);
      setThreads(next.threads);
      void processCommentAnalysis(block);
      return block;
    },
    [runKey, processCommentAnalysis],
  );

  const comments = threads.map((t) => t.comment);

  return {
    threads,
    comments,
    addComment,
    submitAdditionalAnswers,
    hydrated,
    processingCommentId,
    submittingAnswersFor,
    processCommentAnalysis,
    planEntries,
    activePlanEntry,
  };
}
