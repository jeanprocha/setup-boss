"use strict";

/**
 * Ponte E2E: mesma lógica de merge Fase F (sem importar .ts do frontend).
 */

const {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  planV2NeedsRegeneration,
  isLocalUpdatedPlanStale,
  shouldRemoteUpdatedPlanReplaceLocal,
} = require("./session-storage-bridge-logic.js");

const { sanitizeUpdatedPlanPresentation } =
  require("../../../../core/generate-full-updated-plan-presentation.js");

function normalizeClientUpdatedPlan(plan, basePlan) {
  if (!plan?.presentation) return null;
  const presentation = sanitizeUpdatedPlanPresentation({
    ...plan.presentation,
    hasContent: Boolean(plan.presentation.hasContent),
  });
  const normalized = {
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

function sanitizeThreadsUpdatedPlansFromStorage(threads, basePlan) {
  if (!basePlan?.hasContent) return threads;
  return threads.map((t) => {
    if (!t.updatedPlan) return t;
    if (isLocalUpdatedPlanStale(t.updatedPlan, basePlan)) {
      return {
        ...t,
        updatedPlan: null,
        updatedPlanStatus:
          t.updatedPlanStatus === "done" ? "generating" : t.updatedPlanStatus,
      };
    }
    const normalized = normalizeClientUpdatedPlan(t.updatedPlan, basePlan);
    if (!normalized) {
      return {
        ...t,
        updatedPlan: null,
        updatedPlanStatus:
          t.updatedPlanStatus === "done" ? "generating" : t.updatedPlanStatus,
      };
    }
    return { ...t, updatedPlan: normalized };
  });
}

function mergeRemoteThread(local, remote, basePlan) {
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
  }

  const remotePlan = remote.updatedPlan
    ? normalizeClientUpdatedPlan(remote.updatedPlan, basePlan)
    : null;

  if (remotePlan) {
    if (shouldRemoteUpdatedPlanReplaceLocal(local.updatedPlan, remotePlan, basePlan)) {
      next = {
        ...next,
        updatedPlan: remotePlan,
        updatedPlanStatus: "done",
      };
      changed = true;
    } else if (!local.updatedPlan) {
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

function simulateBrowserTimelineMerge(localThread, remotePayload, basePlan) {
  const sanitized = sanitizeThreadsUpdatedPlansFromStorage(
    [localThread],
    basePlan,
  )[0];
  return mergeRemoteThread(sanitized, remotePayload, basePlan);
}

function simulatePersistUpdatedPlan(plan, basePlan) {
  return normalizeClientUpdatedPlan(plan, basePlan);
}

module.exports = {
  simulateBrowserTimelineMerge,
  simulatePersistUpdatedPlan,
  shouldRemoteUpdatedPlanReplaceLocal,
  isLocalUpdatedPlanStale,
};
