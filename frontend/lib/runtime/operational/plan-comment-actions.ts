import { runtimeGetJson, runtimePostJson } from "@/lib/api/client";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import type { PlanCommentAnalysisDto } from "@/lib/runtime/operational/plan-comment-analysis-types";
import type {
  PlanAdditionalAnswersDto,
  PlanAdditionalQuestionsDto,
  PlanUpdatedPlanDto,
} from "@/lib/runtime/operational/plan-comment-follow-up-types";
import type { OperationalPlanPresentation } from "@/lib/runtime/operational/operational-plan-types";
import { classifyPlanCommentHeuristic } from "@/lib/runtime/operational/classify-plan-comment-heuristic";
import { generateUpdatedPlanHeuristicClient } from "@/lib/runtime/operational/generate-updated-plan-heuristic-client";

import {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  normalizeClientUpdatedPlan,
} from "./plan-updated-plan-sync.ts";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { planV2NeedsRegeneration } =
  require("../../../../core/operational-plan-staleness.js") as {
    planV2NeedsRegeneration: (
      presentation: OperationalPlanPresentation,
      basePlan: OperationalPlanPresentation,
      meta?: { schemaVersion?: number; canonicalized?: boolean },
    ) => boolean;
  };

const TIMEOUT_MS = 60_000;

type ApiAnalysis = {
  commentId?: string;
  classification?: string;
  reason?: string;
  assistantResponse?: string;
  requiresNewPlan?: boolean;
  requiresQuestions?: boolean;
  suggestedQuestions?: string[];
  planChangeSummary?: string;
  analyzedAt?: string;
  mode?: string;
};

function regenerateUpdatedPlanIfNeeded(
  updatedPlan: PlanUpdatedPlanDto | null,
  input: {
    basePlan?: OperationalPlanPresentation;
    planExcerpt?: string;
    commentText: string;
    analysis: PlanCommentAnalysisDto;
    additionalAnswers?: Array<{
      questionId: string;
      question: string;
      answer: string;
    }>;
  },
): PlanUpdatedPlanDto | null {
  if (!updatedPlan?.presentation || !input.basePlan?.hasContent) {
    return updatedPlan;
  }
  if (
    !planV2NeedsRegeneration(updatedPlan.presentation, input.basePlan, {
      schemaVersion: updatedPlan.schemaVersion,
      canonicalized: updatedPlan.canonicalized,
    })
  ) {
    return updatedPlan;
  }
  const presentation = generateUpdatedPlanHeuristicClient({
    basePresentation: input.basePlan,
    planExcerpt: input.planExcerpt,
    commentText: input.commentText,
    analysis: input.analysis,
    additionalAnswers: input.additionalAnswers,
  });
  return {
    ...updatedPlan,
    presentation,
    schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
    canonicalized: true,
    generatedAt: new Date().toISOString(),
  };
}

function mapPresentation(raw: unknown): OperationalPlanPresentation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as OperationalPlanPresentation;
  if (!o.understanding) return null;
  return { ...o, hasContent: Boolean(o.hasContent) };
}

function mapAdditionalQuestions(
  raw: unknown,
  commentId: string,
): PlanAdditionalQuestionsDto | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as PlanAdditionalQuestionsDto;
  const questions = Array.isArray(o.questions)
    ? o.questions
        .map((q, i) => ({
          id: String(q.id || `q-${commentId}-${i + 1}`),
          text: String(q.text || "").trim(),
        }))
        .filter((q) => q.text)
    : [];
  if (!questions.length) return null;
  return {
    commentId: String(o.commentId || commentId),
    createdAt: o.createdAt || new Date().toISOString(),
    questions,
  };
}

function mapAdditionalAnswers(
  raw: unknown,
  commentId: string,
): PlanAdditionalAnswersDto | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as PlanAdditionalAnswersDto;
  const answers = Array.isArray(o.answers)
    ? o.answers
        .map((a) => ({
          questionId: String(a.questionId || ""),
          question: String(a.question || "").trim(),
          answer: String(a.answer || "").trim(),
        }))
        .filter((a) => a.answer)
    : [];
  if (!answers.length) return null;
  return {
    commentId: String(o.commentId || commentId),
    submittedAt: o.submittedAt || new Date().toISOString(),
    answers,
  };
}

function mapUpdatedPlan(
  raw: unknown,
  commentId: string,
): PlanUpdatedPlanDto | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as PlanUpdatedPlanDto;
  const presentation = mapPresentation(o.presentation);
  if (!presentation) return null;
  const draft: PlanUpdatedPlanDto = {
    commentId: String(o.commentId || commentId),
    planVersion: Number(o.planVersion) > 0 ? Number(o.planVersion) : 2,
    schemaVersion: Number(o.schemaVersion) > 0 ? Number(o.schemaVersion) : 0,
    canonicalized: o.canonicalized === true,
    generatedAt: o.generatedAt || new Date().toISOString(),
    supersedesPlanVersion:
      Number(o.supersedesPlanVersion) > 0 ? Number(o.supersedesPlanVersion) : 1,
    presentation,
  };
  return normalizeClientUpdatedPlan(draft) ?? {
    ...draft,
    schemaVersion: draft.schemaVersion || OPERATIONAL_PLAN_SCHEMA_VERSION,
    presentation: draft.presentation,
  };
}

function mapAnalysis(raw: ApiAnalysis, commentId: string): PlanCommentAnalysisDto | null {
  const classification = raw.classification;
  if (
    classification !== "question" &&
    classification !== "no_change" &&
    classification !== "update_plan" &&
    classification !== "needs_questions"
  ) {
    return null;
  }
  return {
    commentId: String(raw.commentId || commentId),
    classification,
    reason: String(raw.reason || "").trim() || "Análise concluída.",
    assistantResponse: String(raw.assistantResponse || "").trim(),
    requiresNewPlan: Boolean(raw.requiresNewPlan),
    requiresQuestions: Boolean(raw.requiresQuestions),
    suggestedQuestions: Array.isArray(raw.suggestedQuestions)
      ? raw.suggestedQuestions.map((q) => String(q || "").trim()).filter(Boolean)
      : [],
    planChangeSummary: String(raw.planChangeSummary || "").trim(),
    analyzedAt: raw.analyzedAt || new Date().toISOString(),
    mode: raw.mode === "llm" ? "llm" : "heuristic",
  };
}

export type PlanCommentThreadRemote = {
  comment: { id: string; text: string; createdAt: string };
  analysis: PlanCommentAnalysisDto | null;
  additionalQuestions: PlanAdditionalQuestionsDto | null;
  additionalAnswers: PlanAdditionalAnswersDto | null;
  updatedPlan: PlanUpdatedPlanDto | null;
};

export async function fetchPlanCommentThreads(
  runKey: string,
): Promise<PlanCommentThreadRemote[]> {
  const enc = encodeURIComponent(runKey);
  try {
    const j = await runtimeGetJson<{
      ok?: boolean;
      data?: {
        threads?: Array<{
          comment?: { id?: string; text?: string; createdAt?: string };
          analysis?: ApiAnalysis | null;
          additionalQuestions?: unknown;
          additionalAnswers?: unknown;
          updatedPlan?: unknown;
        }>;
      };
    }>(`/runs/${enc}/plan-comments`, { timeoutMs: 12_000 });
    const threads = j.data?.threads ?? [];
    return threads
      .map((t) => {
        const id = String(t.comment?.id || "").trim();
        if (!id) return null;
        return {
          comment: {
            id,
            text: String(t.comment?.text || "").trim(),
            createdAt: t.comment?.createdAt || new Date().toISOString(),
          },
          analysis: t.analysis ? mapAnalysis(t.analysis, id) : null,
          additionalQuestions: mapAdditionalQuestions(
            t.additionalQuestions,
            id,
          ),
          additionalAnswers: mapAdditionalAnswers(t.additionalAnswers, id),
          updatedPlan: mapUpdatedPlan(t.updatedPlan, id),
        };
      })
      .filter((x): x is PlanCommentThreadRemote => x != null);
  } catch {
    return [];
  }
}

export async function postPlanCommentAnalysis(
  runKey: string,
  input: {
    commentId: string;
    text: string;
    createdAt: string;
    planExcerpt?: string;
    basePlan?: OperationalPlanPresentation;
  },
): Promise<{
  analysis: PlanCommentAnalysisDto;
  additionalQuestions: PlanAdditionalQuestionsDto | null;
  additionalAnswers: PlanAdditionalAnswersDto | null;
  updatedPlan: PlanUpdatedPlanDto | null;
}> {
  const enc = encodeURIComponent(runKey);
  try {
    const j = await runtimePostJson<{
      ok?: boolean;
      data?: {
        analysis?: ApiAnalysis;
        additionalQuestions?: unknown;
        additionalAnswers?: unknown;
        updatedPlan?: unknown;
      };
      error?: { message?: string };
    }>(
      `/runs/${enc}/plan-comments`,
      {
        commentId: input.commentId,
        text: input.text,
        createdAt: input.createdAt,
      },
      { timeoutMs: TIMEOUT_MS },
    );
    const mapped = j.data?.analysis
      ? mapAnalysis(j.data.analysis, input.commentId)
      : null;
    if (mapped) {
      const rawUpdated = mapUpdatedPlan(j.data?.updatedPlan, input.commentId);
      const updatedPlan =
        rawUpdated && input.basePlan?.hasContent
          ? regenerateUpdatedPlanIfNeeded(rawUpdated, {
              basePlan: input.basePlan,
              planExcerpt: input.planExcerpt,
              commentText: input.text,
              analysis: mapped,
            })
          : rawUpdated;
      return {
        analysis: mapped,
        additionalQuestions: mapAdditionalQuestions(
          j.data?.additionalQuestions,
          input.commentId,
        ),
        additionalAnswers: mapAdditionalAnswers(
          j.data?.additionalAnswers,
          input.commentId,
        ),
        updatedPlan,
      };
    }
  } catch (e) {
    if (!(e instanceof RuntimeApiError)) throw e;
  }

  const heuristic = classifyPlanCommentHeuristic({
    commentText: input.text,
    planExcerpt: input.planExcerpt,
  });
  const analysis: PlanCommentAnalysisDto = {
    commentId: input.commentId,
    ...heuristic,
    analyzedAt: new Date().toISOString(),
  };

  let additionalQuestions: PlanAdditionalQuestionsDto | null = null;
  let updatedPlan: PlanUpdatedPlanDto | null = null;

  if (analysis.requiresQuestions && analysis.suggestedQuestions.length) {
    additionalQuestions = {
      commentId: input.commentId,
      createdAt: new Date().toISOString(),
      questions: analysis.suggestedQuestions.map((text, i) => ({
        id: `q-${input.commentId}-${i + 1}`,
        text,
      })),
    };
  }

  if (analysis.requiresNewPlan && !analysis.requiresQuestions && input.basePlan) {
    const presentation = generateUpdatedPlanHeuristicClient({
      basePresentation: input.basePlan,
      planExcerpt: input.planExcerpt,
      commentText: input.text,
      analysis,
    });
    updatedPlan = normalizeClientUpdatedPlan(
      {
        commentId: input.commentId,
        planVersion: 2,
        schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
        canonicalized: true,
        generatedAt: new Date().toISOString(),
        supersedesPlanVersion: 1,
        presentation,
      },
      input.basePlan,
    );
  }

  return {
    analysis,
    additionalQuestions,
    additionalAnswers: null,
    updatedPlan,
  };
}

export async function postPlanCommentAdditionalAnswers(
  runKey: string,
  commentId: string,
  input: {
    answers: Array<{ questionId: string; question: string; answer: string }>;
    commentText: string;
    analysis: PlanCommentAnalysisDto | null;
    planExcerpt?: string;
    basePlan?: OperationalPlanPresentation;
    existingPlanVersion?: number;
  },
): Promise<{
  additionalAnswers: PlanAdditionalAnswersDto;
  updatedPlan: PlanUpdatedPlanDto;
}> {
  const enc = encodeURIComponent(runKey);
  const encComment = encodeURIComponent(commentId);
  try {
    const j = await runtimePostJson<{
      ok?: boolean;
      data?: {
        additionalAnswers?: unknown;
        updatedPlan?: unknown;
      };
    }>(
      `/runs/${enc}/plan-comments/${encComment}/questions/answers`,
      { answers: input.answers },
      { timeoutMs: TIMEOUT_MS },
    );
    const additionalAnswers = mapAdditionalAnswers(
      j.data?.additionalAnswers,
      commentId,
    );
    const rawUpdated = mapUpdatedPlan(j.data?.updatedPlan, commentId);
    const updatedPlan =
      rawUpdated && input.basePlan?.hasContent
        ? regenerateUpdatedPlanIfNeeded(rawUpdated, {
            basePlan: input.basePlan,
            planExcerpt: input.planExcerpt,
            commentText: input.commentText,
            analysis: input.analysis ?? {
              commentId,
              classification: "update_plan",
              reason: "",
              assistantResponse: "",
              requiresNewPlan: true,
              requiresQuestions: false,
              suggestedQuestions: [],
              planChangeSummary: "",
              analyzedAt: new Date().toISOString(),
              mode: "heuristic",
            },
            additionalAnswers: input.answers,
          })
        : rawUpdated;
    if (additionalAnswers && updatedPlan) {
      return { additionalAnswers, updatedPlan };
    }
  } catch (e) {
    if (!(e instanceof RuntimeApiError)) throw e;
  }

  const additionalAnswers: PlanAdditionalAnswersDto = {
    commentId,
    submittedAt: new Date().toISOString(),
    answers: input.answers,
  };
  const nextVersion = (input.existingPlanVersion ?? 1) + 1;
  const presentation = generateUpdatedPlanHeuristicClient({
    basePresentation: input.basePlan,
    planExcerpt: input.planExcerpt,
    commentText: input.commentText,
    analysis: input.analysis,
    additionalAnswers: input.answers,
  });
  const updatedPlan =
    normalizeClientUpdatedPlan(
      {
        commentId,
        planVersion: nextVersion,
        schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
        canonicalized: true,
        generatedAt: new Date().toISOString(),
        supersedesPlanVersion: nextVersion - 1,
        presentation,
      },
      input.basePlan,
    ) ??
    ({
      commentId,
      planVersion: nextVersion,
      schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
      canonicalized: true,
      generatedAt: new Date().toISOString(),
      supersedesPlanVersion: nextVersion - 1,
      presentation,
    } satisfies PlanUpdatedPlanDto);
  return { additionalAnswers, updatedPlan };
}
