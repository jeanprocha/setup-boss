import type {
  PlanApprovalTimelinePersistedState,
  PlanApprovalTimelinePersistedStateV1,
  PlanApprovalTimelinePersistedStateV2,
  PlanApprovalUserCommentBlock,
  PlanCommentThreadState,
} from "./plan-approval-timeline-types.ts";
import type { PlanCommentAnalysisDto } from "./plan-comment-analysis-types.ts";
import type {
  PlanAdditionalAnswersDto,
  PlanAdditionalQuestionsDto,
  PlanUpdatedPlanDto,
} from "./plan-comment-follow-up-types.ts";

const STORAGE_PREFIX_V1 = "setup-boss:plan-approval-timeline:v1:";
const STORAGE_PREFIX_V2 = "setup-boss:plan-approval-timeline:v2:";

const EMPTY_V2: PlanApprovalTimelinePersistedStateV2 = {
  version: 2,
  threads: [],
};

function storageKeyV2(runKey: string): string {
  return `${STORAGE_PREFIX_V2}${runKey}`;
}

function storageKeyV1(runKey: string): string {
  return `${STORAGE_PREFIX_V1}${runKey}`;
}

function hasSessionStorage(): boolean {
  return typeof sessionStorage !== "undefined";
}

function isValidCommentBlock(
  value: unknown,
): value is PlanApprovalUserCommentBlock {
  if (!value || typeof value !== "object") return false;
  const row = value as PlanApprovalUserCommentBlock;
  return (
    row.kind === "user_comment" &&
    typeof row.id === "string" &&
    typeof row.text === "string" &&
    row.text.trim().length > 0 &&
    typeof row.createdAt === "string"
  );
}

function migrateV1ToV2(
  v1: PlanApprovalTimelinePersistedStateV1,
): PlanApprovalTimelinePersistedStateV2 {
  return {
    version: 2,
    threads: v1.comments.filter(isValidCommentBlock).map((comment) => ({
      comment,
      analysisStatus: "idle" as const,
      analysis: null,
      analysisError: null,
      additionalQuestions: null,
      additionalAnswers: null,
      additionalAnswersStatus: "idle" as const,
      additionalAnswersError: null,
      updatedPlan: null,
      updatedPlanStatus: "idle" as const,
    })),
  };
}

function parseV2(raw: unknown): PlanApprovalTimelinePersistedStateV2 {
  if (!raw || typeof raw !== "object") return { ...EMPTY_V2 };
  const o = raw as PlanApprovalTimelinePersistedStateV2;
  if (!Array.isArray(o.threads)) return { ...EMPTY_V2 };
  const threads: PlanCommentThreadState[] = [];
  for (const t of o.threads) {
    if (!t || typeof t !== "object") continue;
    if (!isValidCommentBlock(t.comment)) continue;
    const status = t.analysisStatus;
    const analysisStatus =
      status === "processing" ||
      status === "done" ||
      status === "error" ||
      status === "idle"
        ? status
        : "idle";
    threads.push({
      comment: t.comment,
      analysisStatus,
      analysis: isValidAnalysis(t.analysis) ? t.analysis : null,
      analysisError:
        typeof t.analysisError === "string" ? t.analysisError : null,
      additionalQuestions: isValidAdditionalQuestions(t.additionalQuestions)
        ? t.additionalQuestions
        : null,
      additionalAnswers: isValidAdditionalAnswers(t.additionalAnswers)
        ? t.additionalAnswers
        : null,
      additionalAnswersStatus:
        t.additionalAnswersStatus === "submitting" ||
        t.additionalAnswersStatus === "done" ||
        t.additionalAnswersStatus === "error"
          ? t.additionalAnswersStatus
          : "idle",
      additionalAnswersError:
        typeof t.additionalAnswersError === "string"
          ? t.additionalAnswersError
          : null,
      updatedPlan: isValidUpdatedPlan(t.updatedPlan) ? t.updatedPlan : null,
      updatedPlanStatus:
        t.updatedPlanStatus === "generating" ||
        t.updatedPlanStatus === "done" ||
        t.updatedPlanStatus === "error"
          ? t.updatedPlanStatus
          : "idle",
    });
  }
  return { version: 2, threads };
}

function isValidAdditionalQuestions(
  value: unknown,
): value is PlanAdditionalQuestionsDto {
  if (!value || typeof value !== "object") return false;
  const o = value as PlanAdditionalQuestionsDto;
  return (
    Array.isArray(o.questions) &&
    o.questions.every(
      (q) => typeof q.id === "string" && typeof q.text === "string",
    )
  );
}

function isValidAdditionalAnswers(
  value: unknown,
): value is PlanAdditionalAnswersDto {
  if (!value || typeof value !== "object") return false;
  const o = value as PlanAdditionalAnswersDto;
  return (
    Array.isArray(o.answers) &&
    o.answers.every(
      (a) =>
        typeof a.questionId === "string" && typeof a.answer === "string",
    )
  );
}

function isValidUpdatedPlan(value: unknown): value is PlanUpdatedPlanDto {
  if (!value || typeof value !== "object") return false;
  const o = value as PlanUpdatedPlanDto;
  return (
    typeof o.planVersion === "number" &&
    o.presentation != null &&
    typeof o.presentation === "object"
  );
}

function isValidAnalysis(value: unknown): value is PlanCommentAnalysisDto {
  if (!value || typeof value !== "object") return false;
  const a = value as PlanCommentAnalysisDto;
  return (
    typeof a.commentId === "string" &&
    (a.classification === "question" ||
      a.classification === "no_change" ||
      a.classification === "update_plan" ||
      a.classification === "needs_questions")
  );
}

export function readPlanApprovalTimeline(
  runKey: string,
): PlanApprovalTimelinePersistedState {
  if (!runKey || !hasSessionStorage()) return { ...EMPTY_V2 };
  try {
    const rawV2 = sessionStorage.getItem(storageKeyV2(runKey));
    if (rawV2) return parseV2(JSON.parse(rawV2));
    const rawV1 = sessionStorage.getItem(storageKeyV1(runKey));
    if (rawV1) {
      const v1 = JSON.parse(rawV1) as PlanApprovalTimelinePersistedStateV1;
      const migrated = migrateV1ToV2(v1);
      writePlanApprovalTimeline(runKey, migrated);
      return migrated;
    }
    return { ...EMPTY_V2 };
  } catch {
    return { ...EMPTY_V2 };
  }
}

export function writePlanApprovalTimeline(
  runKey: string,
  state: PlanApprovalTimelinePersistedState,
): void {
  if (!runKey || !hasSessionStorage()) return;
  try {
    sessionStorage.setItem(storageKeyV2(runKey), JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function appendPlanApprovalCommentThread(
  runKey: string,
  comment: PlanApprovalUserCommentBlock,
): PlanApprovalTimelinePersistedState {
  const current = readPlanApprovalTimeline(runKey);
  const next: PlanApprovalTimelinePersistedState = {
    version: 2,
    threads: [
      ...current.threads,
      {
        comment,
        analysisStatus: "idle",
        analysis: null,
        analysisError: null,
        additionalQuestions: null,
        additionalAnswers: null,
        additionalAnswersStatus: "idle",
        additionalAnswersError: null,
        updatedPlan: null,
        updatedPlanStatus: "idle",
      },
    ],
  };
  writePlanApprovalTimeline(runKey, next);
  return next;
}

export function updatePlanApprovalThread(
  runKey: string,
  commentId: string,
  patch: Partial<PlanCommentThreadState>,
): PlanApprovalTimelinePersistedState {
  const current = readPlanApprovalTimeline(runKey);
  const next: PlanApprovalTimelinePersistedState = {
    version: 2,
    threads: current.threads.map((t) =>
      t.comment.id === commentId ? { ...t, ...patch } : t,
    ),
  };
  writePlanApprovalTimeline(runKey, next);
  return next;
}

/** Compat: lista plana de comentários. */
export function listPlanApprovalComments(
  state: PlanApprovalTimelinePersistedState,
): PlanApprovalUserCommentBlock[] {
  return state.threads.map((t) => t.comment);
}
