import type { OperationalPlanPresentation } from "./operational-plan-types.ts";
import type { PlanCommentThreadState } from "./plan-approval-timeline-types.ts";
import type { PlanUpdatedPlanDto } from "./plan-comment-follow-up-types.ts";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  planV2NeedsRegeneration,
} = require("../../../../core/operational-plan-staleness.js") as {
  OPERATIONAL_PLAN_SCHEMA_VERSION: number;
  planV2NeedsRegeneration: (
    presentation: OperationalPlanPresentation,
    basePlan: OperationalPlanPresentation,
    meta?: { schemaVersion?: number; canonicalized?: boolean },
  ) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sanitizeUpdatedPlanPresentation } =
  require("../../../../core/generate-full-updated-plan-presentation.js") as {
    sanitizeUpdatedPlanPresentation: (
      p: OperationalPlanPresentation,
    ) => OperationalPlanPresentation;
  };

export { OPERATIONAL_PLAN_SCHEMA_VERSION };

function parseIsoMs(value: string | undefined): number {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Plano local considerado stale face ao v1/base.
 */
export function isLocalUpdatedPlanStale(
  plan: PlanUpdatedPlanDto | null | undefined,
  basePlan: OperationalPlanPresentation | null | undefined,
): boolean {
  if (!plan?.presentation || !basePlan?.hasContent) return false;
  return planV2NeedsRegeneration(plan.presentation, basePlan, {
    schemaVersion: plan.schemaVersion,
    canonicalized: plan.canonicalized,
  });
}

/**
 * O payload remoto deve substituir o updatedPlan local?
 */
export function shouldRemoteUpdatedPlanReplaceLocal(
  local: PlanUpdatedPlanDto | null | undefined,
  remote: PlanUpdatedPlanDto | null | undefined,
  basePlan?: OperationalPlanPresentation | null,
): boolean {
  if (!remote?.presentation) return false;
  if (!local?.presentation) return true;

  if (basePlan?.hasContent && isLocalUpdatedPlanStale(local, basePlan)) {
    return true;
  }

  const remoteSchema = Number(remote.schemaVersion) || 0;
  const localSchema = Number(local.schemaVersion) || 0;
  if (remoteSchema > localSchema) return true;
  if (localSchema > remoteSchema) return false;

  if (remote.canonicalized === true && local.canonicalized !== true) return true;
  if (local.canonicalized === true && remote.canonicalized !== true) return false;

  const remoteVersion = Number(remote.planVersion) || 0;
  const localVersion = Number(local.planVersion) || 0;
  if (remoteVersion > localVersion) return true;
  if (localVersion > remoteVersion) return false;

  const remoteAt = parseIsoMs(remote.generatedAt);
  const localAt = parseIsoMs(local.generatedAt);
  if (remoteAt > localAt) return true;
  if (localAt > remoteAt) return false;

  if (remote.canonicalized === true) return true;

  return false;
}

/**
 * Normaliza metadados + polish; devolve null se ainda stale face à base.
 */
export function normalizeClientUpdatedPlan(
  plan: PlanUpdatedPlanDto | null | undefined,
  basePlan?: OperationalPlanPresentation | null,
): PlanUpdatedPlanDto | null {
  if (!plan?.presentation) return null;

  const presentation = sanitizeUpdatedPlanPresentation({
    ...plan.presentation,
    hasContent: Boolean(plan.presentation.hasContent),
  });

  const normalized: PlanUpdatedPlanDto = {
    ...plan,
    presentation,
    schemaVersion:
      Number(plan.schemaVersion) >= OPERATIONAL_PLAN_SCHEMA_VERSION
        ? Number(plan.schemaVersion)
        : OPERATIONAL_PLAN_SCHEMA_VERSION,
    canonicalized: plan.canonicalized === true,
    generatedAt: plan.generatedAt || new Date().toISOString(),
  };

  if (basePlan?.hasContent && isLocalUpdatedPlanStale(normalized, basePlan)) {
    return null;
  }

  return {
    ...normalized,
    schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
    canonicalized: true,
  };
}

/**
 * Remove ou normaliza updatedPlans stale ao ler sessionStorage (antes do fetch remoto).
 */
export function sanitizeThreadsUpdatedPlansFromStorage(
  threads: PlanCommentThreadState[],
  basePlan?: OperationalPlanPresentation | null,
): PlanCommentThreadState[] {
  if (!basePlan?.hasContent) return threads;

  let changed = false;
  const next = threads.map((t) => {
    if (!t.updatedPlan) return t;

    if (isLocalUpdatedPlanStale(t.updatedPlan, basePlan)) {
      changed = true;
      return {
        ...t,
        updatedPlan: null,
        updatedPlanStatus:
          t.updatedPlanStatus === "done" ? ("generating" as const) : t.updatedPlanStatus,
      };
    }

    const normalized = normalizeClientUpdatedPlan(t.updatedPlan, basePlan);
    if (!normalized) {
      changed = true;
      return {
        ...t,
        updatedPlan: null,
        updatedPlanStatus:
          t.updatedPlanStatus === "done" ? ("generating" as const) : t.updatedPlanStatus,
      };
    }

    if (
      normalized.schemaVersion !== t.updatedPlan.schemaVersion ||
      normalized.canonicalized !== t.updatedPlan.canonicalized ||
      normalized.presentation !== t.updatedPlan.presentation
    ) {
      changed = true;
      return { ...t, updatedPlan: normalized };
    }

    return t;
  });

  return changed ? next : threads;
}

export type RemoteThreadPayload = {
  analysis: PlanCommentThreadState["analysis"];
  additionalQuestions: PlanCommentThreadState["additionalQuestions"];
  additionalAnswers: PlanCommentThreadState["additionalAnswers"];
  updatedPlan: PlanCommentThreadState["updatedPlan"];
};

/**
 * Merge remoto → local; updatedPlan remoto canonicalizado prevalece sobre stale local.
 */
export function mergeRemoteThread(
  local: PlanCommentThreadState,
  remote: RemoteThreadPayload,
  basePlan?: OperationalPlanPresentation | null,
): PlanCommentThreadState {
  let next = { ...local };
  let changed = false;

  if (remote.analysis && local.analysisStatus !== "done") {
    next = {
      ...next,
      analysisStatus: "done",
      analysis: remote.analysis,
      analysisError: null,
    };
    changed = true;
  } else if (
    remote.analysis &&
    local.analysisStatus === "done" &&
    !local.analysis
  ) {
    next = { ...next, analysis: remote.analysis };
    changed = true;
  }

  if (remote.additionalQuestions && !local.additionalQuestions) {
    next.additionalQuestions = remote.additionalQuestions;
    changed = true;
  }

  if (remote.additionalAnswers && !local.additionalAnswers) {
    next = {
      ...next,
      additionalAnswers: remote.additionalAnswers,
      additionalAnswersStatus: "done",
    };
    changed = true;
  }

  const remotePlan = remote.updatedPlan
    ? normalizeClientUpdatedPlan(remote.updatedPlan, basePlan)
    : null;

  if (remotePlan) {
    const localPlan = local.updatedPlan;
    if (shouldRemoteUpdatedPlanReplaceLocal(localPlan, remotePlan, basePlan)) {
      next = {
        ...next,
        updatedPlan: remotePlan,
        updatedPlanStatus: "done",
      };
      changed = true;
    } else if (!localPlan) {
      next = {
        ...next,
        updatedPlan: remotePlan,
        updatedPlanStatus: "done",
      };
      changed = true;
    }
  } else if (
    local.updatedPlan &&
    basePlan?.hasContent &&
    isLocalUpdatedPlanStale(local.updatedPlan, basePlan)
  ) {
    next = {
      ...next,
      updatedPlan: null,
      updatedPlanStatus:
        next.updatedPlanStatus === "done" ? "generating" : next.updatedPlanStatus,
    };
    changed = true;
  }

  return changed ? next : local;
}

/**
 * Bloqueia persistência de updatedPlan stale no sessionStorage.
 */
export function prepareUpdatedPlanForPersistence(
  plan: PlanUpdatedPlanDto | null | undefined,
  basePlan?: OperationalPlanPresentation | null,
): PlanUpdatedPlanDto | null {
  return normalizeClientUpdatedPlan(plan, basePlan);
}
