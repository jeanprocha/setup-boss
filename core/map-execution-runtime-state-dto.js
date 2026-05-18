"use strict";

/** @param {unknown} raw */
function mapOperationalHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const e = /** @type {Record<string, unknown>} */ (item);
      const type = String(e.type || "").trim();
      if (!type) return null;
      return {
        type,
        at: e.at != null ? String(e.at) : "",
        reason: e.reason != null ? String(e.reason) : null,
      };
    })
    .filter((x) => x && x.at);
}

/** @param {unknown} raw */
function mapTransitionHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const t = /** @type {Record<string, unknown>} */ (item);
      return {
        at: t.at != null ? String(t.at) : "",
        from: String(t.from || ""),
        to: String(t.to || ""),
        reason: t.reason != null ? String(t.reason) : null,
      };
    })
    .filter((x) => x && x.at);
}

/**
 * Projeção read-only de execution-runtime-state → DTO API/frontend.
 *
 * @param {Record<string, unknown>|null|undefined} state
 */
function mapExecutionRuntimeStateDto(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return null;
  }

  const miniActivities = Array.isArray(state.miniActivities)
    ? state.miniActivities
        .map((raw) => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
          const m = /** @type {Record<string, unknown>} */ (raw);
          const status = String(m.status || "pending");
          return {
            miniActivityId: String(m.miniActivityId || ""),
            miniTaskId: String(m.miniTaskId || m.miniActivityId || ""),
            subtaskId: m.subtaskId != null ? String(m.subtaskId) : null,
            order: typeof m.order === "number" ? m.order : 1,
            title: String(m.title || ""),
            objective: m.objective != null ? String(m.objective) : null,
            scopeSummary: m.scopeSummary != null ? String(m.scopeSummary) : null,
            dependsOnMiniActivityIds: Array.isArray(m.dependsOnMiniActivityIds)
              ? m.dependsOnMiniActivityIds.map((x) => String(x))
              : [],
            completionCriteria: Array.isArray(m.completionCriteria)
              ? m.completionCriteria.map((x) => String(x))
              : [],
            status,
            reviewState: String(m.reviewState || "none"),
            reviewStatus:
              m.reviewStatus != null ? String(m.reviewStatus) : null,
            reviewSummary:
              m.reviewSummary != null ? String(m.reviewSummary) : null,
            reviewArtifactRef:
              m.reviewArtifactRef != null ? String(m.reviewArtifactRef) : null,
            correctionRequired: m.correctionRequired === true,
            correctionRef:
              m.correctionRef != null ? String(m.correctionRef) : null,
            correctionPhase: String(m.correctionPhase || "none"),
            reviewedAt: m.reviewedAt != null ? String(m.reviewedAt) : null,
            progress:
              m.progress && typeof m.progress === "object"
                ? {
                    percent:
                      typeof /** @type {Record<string, unknown>} */ (m.progress).percent ===
                      "number"
                        ? /** @type {Record<string, unknown>} */ (m.progress).percent
                        : 0,
                    step:
                      /** @type {Record<string, unknown>} */ (m.progress).step != null
                        ? String(/** @type {Record<string, unknown>} */ (m.progress).step)
                        : null,
                  }
                : { percent: 0, step: null },
            linkedSubtaskExecutionRel:
              m.linkedSubtaskExecutionRel != null
                ? String(m.linkedSubtaskExecutionRel)
                : null,
            operationalHistory: mapOperationalHistory(m.operationalHistory),
            transitionHistory: mapTransitionHistory(m.transitionHistory),
          };
        })
        .filter((x) => x && x.miniActivityId)
    : [];

  const trace =
    state.traceability && typeof state.traceability === "object"
      ? /** @type {Record<string, unknown>} */ (state.traceability)
      : {};

  return {
    version: typeof state.version === "number" ? state.version : 1,
    runId: String(state.runId || ""),
    materializedAt: state.materializedAt != null ? String(state.materializedAt) : null,
    updatedAt: state.updatedAt != null ? String(state.updatedAt) : null,
    legacy: state.legacy === true,
    orderingMode: String(state.orderingMode || "linear"),
    aggregatedStatus: String(state.aggregatedStatus || "pending"),
    currentMiniActivityId:
      state.currentMiniActivityId != null
        ? String(state.currentMiniActivityId)
        : null,
    traceability: {
      strategySha256:
        trace.strategySha256 != null ? String(trace.strategySha256) : null,
      planVersion: trace.planVersion != null ? String(trace.planVersion) : null,
      sourcePlanVersion:
        trace.sourcePlanVersion != null ? String(trace.sourcePlanVersion) : null,
      sourcePlanSha256:
        trace.sourcePlanSha256 != null ? String(trace.sourcePlanSha256) : null,
      sourcePlanRef: trace.sourcePlanRef != null ? String(trace.sourcePlanRef) : null,
      sourceCommentId:
        trace.sourceCommentId != null ? String(trace.sourceCommentId) : null,
      sourcePlanId: trace.sourcePlanId != null ? String(trace.sourcePlanId) : null,
      oesVersion: typeof trace.oesVersion === "number" ? trace.oesVersion : 1,
    },
    miniActivities,
  };
}

module.exports = {
  mapExecutionRuntimeStateDto,
};
