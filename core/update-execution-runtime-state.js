"use strict";

const fs = require("fs");
const path = require("path");

const {
  EXECUTION_RUNTIME_STATE_REL,
  MINI_ACTIVITY_STATUSES,
  loadExecutionRuntimeState,
  depsSatisfied,
} = require("./materialize-execution-runtime-from-oes");

/** @type {ReadonlySet<string>} */
const REVIEW_STATUSES = new Set([
  "pending",
  "running",
  "approved",
  "rejected",
  "blocked",
]);

/** @type {ReadonlySet<string>} */
const CORRECTION_PHASES = new Set([
  "none",
  "correction_required",
  "correction_running",
]);

/** @type {ReadonlySet<string>} */
const OPERATIONAL_EVENT_TYPES = new Set([
  "review_started",
  "review_approved",
  "review_rejected",
  "review_blocked",
  "correction_started",
  "correction_completed",
  "correction_failed",
  "review_retried",
]);

/** @type {ReadonlyMap<string, ReadonlySet<string>>} */
const ALLOWED_TRANSITIONS = new Map([
  ["pending", new Set(["ready", "blocked_by_dependency", "failed", "skipped"])],
  ["ready", new Set(["running", "blocked_by_dependency", "failed", "skipped"])],
  [
    "blocked_by_dependency",
    new Set(["ready", "pending", "failed", "skipped"]),
  ],
  ["running", new Set(["review", "failed", "completed"])],
  ["review", new Set(["completed", "failed", "running"])],
  ["completed", new Set(["skipped"])],
  ["failed", new Set(["ready", "skipped"])],
  ["skipped", new Set()],
]);

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function asStringList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "").trim()).filter(Boolean);
}

/**
 * @param {Record<string, unknown>[]} miniActivities
 */
function computeAggregatedStatus(miniActivities) {
  if (!miniActivities.length) return "not_materialized";
  if (
    miniActivities.every(
      (m) =>
        String(m.status) === "completed" || String(m.status) === "skipped",
    )
  ) {
    return "completed";
  }
  if (miniActivities.some((m) => String(m.status) === "running")) {
    return "running";
  }
  if (miniActivities.some((m) => String(m.status) === "review")) {
    return "review";
  }
  if (miniActivities.some((m) => String(m.status) === "failed")) {
    return "failed";
  }
  if (miniActivities.some((m) => String(m.status) === "ready")) {
    return "ready";
  }
  return "pending";
}

/**
 * @param {Record<string, unknown>[]} miniActivities
 */
function pickCurrentMiniActivityId(miniActivities) {
  const running = miniActivities.find((m) => String(m.status) === "running");
  if (running) return String(running.miniActivityId);
  const correcting = miniActivities.find(
    (m) =>
      String(m.status) === "review" &&
      String(m.correctionPhase || "") === "correction_running",
  );
  if (correcting) return String(correcting.miniActivityId);
  const review = miniActivities.find((m) => String(m.status) === "review");
  if (review) return String(review.miniActivityId);
  const ready = miniActivities
    .filter((m) => String(m.status) === "ready")
    .sort((a, b) => Number(a.order) - Number(b.order))[0];
  if (ready) return String(ready.miniActivityId);
  return null;
}

/**
 * @param {string} from
 * @param {string} to
 */
function isTransitionAllowed(from, to) {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS.get(from);
  return allowed ? allowed.has(to) : false;
}

/**
 * @param {Record<string, unknown>} ma
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {string} iso
 * @param {string} reason
 * @param {{ miniTaskId?: string, executionRef?: string|null, subtaskRef?: string|null }} [meta]
 */
function appendTransition(ma, fromStatus, toStatus, iso, reason, meta = {}) {
  if (fromStatus === toStatus) return;
  const history = Array.isArray(ma.transitionHistory)
    ? /** @type {Record<string, unknown>[]} */ (ma.transitionHistory)
    : [];
  /** @type {Record<string, unknown>} */
  const entry = {
    at: iso,
    from: fromStatus,
    to: toStatus,
    reason: reason || null,
    miniTaskId:
      meta.miniTaskId != null
        ? String(meta.miniTaskId)
        : String(ma.miniTaskId || ma.miniActivityId || ""),
  };
  if (meta.executionRef) entry.executionRef = String(meta.executionRef);
  if (meta.subtaskRef) entry.subtaskRef = String(meta.subtaskRef);
  history.push(entry);
  ma.transitionHistory = history.slice(-80);
  ma.updatedAt = iso;
}

/**
 * @param {Record<string, unknown>} ma
 * @param {{ type: string, reason?: string, artifactRef?: string|null, miniTaskId?: string, subtaskRef?: string|null }} event
 * @param {string} iso
 */
function appendOperationalEvent(ma, event, iso) {
  const type = String(event.type || "").trim();
  if (!OPERATIONAL_EVENT_TYPES.has(type)) return;
  const history = Array.isArray(ma.operationalHistory)
    ? /** @type {Record<string, unknown>[]} */ (ma.operationalHistory)
    : [];
  /** @type {Record<string, unknown>} */
  const entry = {
    type,
    at: iso,
    reason: event.reason != null ? String(event.reason) : null,
    miniTaskId: String(
      event.miniTaskId != null
        ? event.miniTaskId
        : ma.miniTaskId || ma.miniActivityId || "",
    ),
  };
  if (event.artifactRef) entry.artifactRef = String(event.artifactRef);
  if (event.subtaskRef) entry.subtaskRef = String(event.subtaskRef);
  history.push(entry);
  ma.operationalHistory = history.slice(-80);
  ma.updatedAt = iso;
}

/**
 * @param {Record<string, unknown>} ma
 * @param {Record<string, unknown>} review
 */
function applyReviewFields(ma, review) {
  if (review.reviewStatus != null) {
    const rs = String(review.reviewStatus);
    if (REVIEW_STATUSES.has(rs)) ma.reviewStatus = rs;
  }
  if (review.reviewSummary !== undefined) {
    ma.reviewSummary =
      review.reviewSummary != null ? String(review.reviewSummary) : null;
  }
  if (review.reviewArtifactRef !== undefined) {
    ma.reviewArtifactRef =
      review.reviewArtifactRef != null
        ? String(review.reviewArtifactRef)
        : null;
  }
  if (typeof review.correctionRequired === "boolean") {
    ma.correctionRequired = review.correctionRequired;
  }
  if (review.correctionPhase != null) {
    const cp = String(review.correctionPhase);
    if (CORRECTION_PHASES.has(cp)) ma.correctionPhase = cp;
  }
  if (review.reviewedAt !== undefined) {
    ma.reviewedAt =
      review.reviewedAt != null ? String(review.reviewedAt) : null;
  }
}

/**
 * @param {Record<string, unknown>} ma
 * @param {Record<string, unknown>} correction
 */
function applyCorrectionFields(ma, correction) {
  if (correction.correctionRef !== undefined) {
    ma.correctionRef =
      correction.correctionRef != null
        ? String(correction.correctionRef)
        : null;
  }
  if (correction.correctionPhase != null) {
    const cp = String(correction.correctionPhase);
    if (CORRECTION_PHASES.has(cp)) ma.correctionPhase = cp;
  }
  if (typeof correction.correctionRequired === "boolean") {
    ma.correctionRequired = correction.correctionRequired;
  }
}

/**
 * @param {string} outputDirAbs
 * @param {{ miniActivityId?: string, miniTaskId?: string, subtaskId?: string }} ref
 * @param {{
 *   review?: Record<string, unknown>,
 *   correction?: Record<string, unknown>,
 *   event?: { type: string, reason?: string, artifactRef?: string|null, subtaskRef?: string|null },
 *   now?: string,
 * }} patch
 */
function patchMiniActivityOperational(outputDirAbs, ref, patch) {
  const root = path.resolve(String(outputDirAbs || ""));
  const loaded = loadExecutionRuntimeState(root);
  if (!loaded.ok || !loaded.state) {
    return { ok: false, code: "state_missing", legacy: true };
  }

  const now = patch.now || new Date().toISOString();
  const state = /** @type {Record<string, unknown>} */ ({
    ...loaded.state,
    miniActivities: (
      /** @type {Record<string, unknown>[]} */ (loaded.state.miniActivities) || []
    ).map((m) => ({ ...m })),
  });

  const ma = findMiniActivity(state, ref);
  if (!ma) {
    return {
      ok: false,
      code: "mini_activity_not_found",
      message: "miniActivity não encontrada no execution-runtime-state.",
    };
  }

  const miniTaskId = String(ma.miniTaskId || ma.miniActivityId || "");
  if (patch.review) applyReviewFields(ma, patch.review);
  if (patch.correction) applyCorrectionFields(ma, patch.correction);
  if (patch.event) {
    appendOperationalEvent(
      ma,
      {
        ...patch.event,
        miniTaskId,
        subtaskRef:
          patch.event.subtaskRef ??
          (ma.subtaskId != null ? String(ma.subtaskId) : null),
      },
      now,
    );
  }

  const miniActivities = /** @type {Record<string, unknown>[]} */ (
    state.miniActivities
  );
  state.updatedAt = now;
  state.aggregatedStatus = computeAggregatedStatus(miniActivities);
  state.currentMiniActivityId = pickCurrentMiniActivityId(miniActivities);

  const statePath = path.join(root, EXECUTION_RUNTIME_STATE_REL);
  writeStateAtomic(statePath, state);

  return {
    ok: true,
    state,
    miniActivityId: String(ma.miniActivityId),
    status: String(ma.status),
  };
}

/**
 * @param {string} outputDirAbs
 * @param {{ subtaskId: string, subtaskRef?: string, reason?: string, reviewArtifactRef?: string|null }} p
 */
function tryApplyMiniActivityReviewStarted(outputDirAbs, p) {
  const loaded = loadExecutionRuntimeState(outputDirAbs);
  const ma =
    loaded.ok && loaded.state
      ? findMiniActivity(loaded.state, { subtaskId: p.subtaskId })
      : null;
  const isRetry = Boolean(
    ma &&
      (ma.correctionRequired === true ||
        ma.correctionRef ||
        String(ma.correctionPhase || "") !== "none"),
  );
  const eventType = isRetry ? "review_retried" : "review_started";

  return tryTransitionMiniActivity(
    outputDirAbs,
    { subtaskId: p.subtaskId },
    "review",
    {
      reason: p.reason || "execution_review_started",
      subtaskRef: p.subtaskRef ?? p.subtaskId,
      review: {
        reviewStatus: "running",
        reviewSummary: null,
        reviewArtifactRef: p.reviewArtifactRef ?? null,
        correctionRequired: isRetry ? true : false,
        correctionPhase: isRetry ? "none" : "none",
      },
      event: {
        type: eventType,
        reason: p.reason || eventType,
        artifactRef: p.reviewArtifactRef ?? null,
        subtaskRef: p.subtaskRef ?? p.subtaskId,
      },
    },
  );
}

/**
 * @param {string} outputDirAbs
 * @param {{ miniActivityId?: string, miniTaskId?: string, subtaskId?: string }} ref
 * @param {"approved"|"rejected"|"blocked"} outcome
 * @param {{
 *   reason?: string,
 *   now?: string,
 *   subtaskRef?: string,
 *   reviewSummary?: string|null,
 *   reviewArtifactRef?: string|null,
 *   correctionRef?: string|null,
 * }} opts
 */
function applyMiniActivityReviewOutcome(outputDirAbs, ref, outcome, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const reviewPayload = {
    reviewSummary: opts.reviewSummary ?? null,
    reviewArtifactRef: opts.reviewArtifactRef ?? null,
    reviewedAt: now,
  };

  if (outcome === "approved") {
    return transitionMiniActivity(outputDirAbs, ref, "completed", {
      reason: opts.reason || "execution_review_approved",
      now,
      subtaskRef: opts.subtaskRef,
      review: {
        ...reviewPayload,
        reviewStatus: "approved",
        correctionRequired: false,
        correctionPhase: "none",
      },
      event: {
        type: "review_approved",
        reason: opts.reason || "execution_review_approved",
        artifactRef: opts.reviewArtifactRef ?? null,
        subtaskRef: opts.subtaskRef,
      },
    });
  }

  if (outcome === "blocked") {
    return transitionMiniActivity(outputDirAbs, ref, "failed", {
      reason: opts.reason || "execution_review_blocked",
      now,
      subtaskRef: opts.subtaskRef,
      review: {
        ...reviewPayload,
        reviewStatus: "blocked",
        correctionRequired: false,
        correctionPhase: "none",
      },
      event: {
        type: "review_blocked",
        reason: opts.reason || "execution_review_blocked",
        artifactRef: opts.reviewArtifactRef ?? null,
        subtaskRef: opts.subtaskRef,
      },
    });
  }

  const correctionRef =
    opts.correctionRef ||
    (opts.subtaskRef
      ? `execution/results/${opts.subtaskRef}-correction-loop.json`
      : null);

  return patchMiniActivityOperational(
    outputDirAbs,
    ref,
    {
      now,
      review: {
        ...reviewPayload,
        reviewStatus: "rejected",
        correctionRequired: true,
        correctionPhase: "correction_required",
      },
      correction: { correctionRef },
      event: {
        type: "review_rejected",
        reason: opts.reason || "execution_review_rejected",
        artifactRef: opts.reviewArtifactRef ?? null,
        subtaskRef: opts.subtaskRef,
      },
    },
  );
}

/**
 * @param {string} outputDirAbs
 * @param {{ subtaskId: string, correctionRef?: string, reviewArtifactRef?: string|null, reason?: string }} p
 */
function tryApplyMiniActivityCorrectionStarted(outputDirAbs, p) {
  const correctionRef =
    p.correctionRef ||
    `execution/results/${p.subtaskId}-correction-loop.json`;
  return tryPatchMiniActivityOperational(outputDirAbs, { subtaskId: p.subtaskId }, {
    review: {
      correctionPhase: "correction_running",
      correctionRequired: true,
    },
    correction: { correctionRef },
    event: {
      type: "correction_started",
      reason: p.reason || "correction_started",
      artifactRef: correctionRef,
      subtaskRef: p.subtaskId,
    },
  });
}

/**
 * @param {string} outputDirAbs
 * @param {{ subtaskId: string, correctionRef?: string, reason?: string }} p
 */
function tryApplyMiniActivityCorrectionCompleted(outputDirAbs, p) {
  const correctionRef =
    p.correctionRef ||
    `execution/results/${p.subtaskId}-correction-loop.json`;
  return tryPatchMiniActivityOperational(outputDirAbs, { subtaskId: p.subtaskId }, {
    review: { correctionPhase: "none" },
    event: {
      type: "correction_completed",
      reason: p.reason || "correction_completed",
      artifactRef: correctionRef,
      subtaskRef: p.subtaskId,
    },
  });
}

/**
 * @param {string} outputDirAbs
 * @param {{ subtaskId: string, exhausted?: boolean, correctionRef?: string, reason?: string }} p
 */
function tryApplyMiniActivityCorrectionFailed(outputDirAbs, p) {
  const correctionRef =
    p.correctionRef ||
    `execution/results/${p.subtaskId}-correction-loop.json`;
  if (p.exhausted) {
    return tryTransitionMiniActivity(
      outputDirAbs,
      { subtaskId: p.subtaskId },
      "failed",
      {
        reason: p.reason || "correction_retry_exhausted",
        subtaskRef: p.subtaskId,
        review: {
          reviewStatus: "rejected",
          correctionRequired: false,
          correctionPhase: "none",
        },
        event: {
          type: "correction_failed",
          reason: p.reason || "correction_retry_exhausted",
          artifactRef: correctionRef,
          subtaskRef: p.subtaskId,
        },
      },
    );
  }
  return tryPatchMiniActivityOperational(outputDirAbs, { subtaskId: p.subtaskId }, {
    review: {
      correctionPhase: "correction_required",
      correctionRequired: true,
    },
    event: {
      type: "correction_failed",
      reason: p.reason || "correction_failed",
      artifactRef: correctionRef,
      subtaskRef: p.subtaskId,
    },
  });
}

/**
 * @param {string} outputDirAbs
 * @param {{ miniActivityId?: string, miniTaskId?: string, subtaskId?: string }} ref
 * @param {Parameters<typeof patchMiniActivityOperational>[2]} patch
 */
function tryPatchMiniActivityOperational(outputDirAbs, ref, patch) {
  try {
    return patchMiniActivityOperational(outputDirAbs, ref, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: "patch_warning",
      warning: message,
      legacy: true,
    };
  }
}

/**
 * @param {string} outputDirAbs
 * @param {{ miniActivityId?: string, miniTaskId?: string, subtaskId?: string }} ref
 * @param {"approved"|"rejected"|"blocked"} outcome
 * @param {Parameters<typeof applyMiniActivityReviewOutcome>[3]} opts
 */
function tryApplyMiniActivityReviewOutcome(outputDirAbs, ref, outcome, opts) {
  try {
    return applyMiniActivityReviewOutcome(outputDirAbs, ref, outcome, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: "review_outcome_warning",
      warning: message,
      legacy: true,
    };
  }
}

/**
 * @param {Record<string, unknown>} state
 * @param {{ miniActivityId?: string, miniTaskId?: string, subtaskId?: string }} ref
 */
function findMiniActivity(state, ref) {
  const list = Array.isArray(state.miniActivities)
    ? /** @type {Record<string, unknown>[]} */ (state.miniActivities)
    : [];
  const byId = ref.miniActivityId != null ? String(ref.miniActivityId).trim() : "";
  const byTask = ref.miniTaskId != null ? String(ref.miniTaskId).trim() : "";
  const bySub = ref.subtaskId != null ? String(ref.subtaskId).trim() : "";

  return (
    list.find((m) => byId && String(m.miniActivityId) === byId) ||
    list.find((m) => byTask && String(m.miniTaskId || m.miniActivityId) === byTask) ||
    list.find((m) => bySub && String(m.subtaskId || "") === bySub) ||
    null
  );
}

/**
 * @param {string} statePath
 * @param {Record<string, unknown>} state
 */
function writeStateAtomic(statePath, state) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, statePath);
}

/**
 * @param {string} outputDirAbs
 * @param {{ miniActivityId?: string, miniTaskId?: string, subtaskId?: string }} ref
 * @param {string} toStatus
 * @param {{
 *   reason?: string,
 *   now?: string,
 *   executionRef?: string|null,
 *   subtaskRef?: string|null,
 *   review?: {
 *     reviewStatus?: string,
 *     reviewSummary?: string|null,
 *     reviewArtifactRef?: string|null,
 *     correctionRequired?: boolean,
 *     correctionPhase?: string,
 *     reviewedAt?: string|null,
 *   },
 *   correction?: { correctionRef?: string|null, correctionPhase?: string },
 *   event?: { type: string, reason?: string, artifactRef?: string|null, subtaskRef?: string|null },
 *   skipDependencyCheck?: boolean,
 * }} [opts]
 */
function transitionMiniActivity(outputDirAbs, ref, toStatus, opts = {}) {
  const root = path.resolve(String(outputDirAbs || ""));
  const nextStatus = String(toStatus || "").trim();
  if (!MINI_ACTIVITY_STATUSES.has(nextStatus)) {
    return {
      ok: false,
      code: "invalid_status",
      message: `Status inválido: ${nextStatus}`,
    };
  }

  const loaded = loadExecutionRuntimeState(root);
  if (!loaded.ok || !loaded.state) {
    return { ok: false, code: "state_missing", legacy: true };
  }

  const state = /** @type {Record<string, unknown>} */ ({
    ...loaded.state,
    miniActivities: (
      /** @type {Record<string, unknown>[]} */ (loaded.state.miniActivities) || []
    ).map((m) => ({ ...m })),
  });

  const ma = findMiniActivity(state, ref);
  if (!ma) {
    return {
      ok: false,
      code: "mini_activity_not_found",
      message: "miniActivity não encontrada no execution-runtime-state.",
    };
  }

  const now = opts.now || new Date().toISOString();
  const fromStatus = String(ma.status || "pending");
  const miniTaskId = String(ma.miniTaskId || ma.miniActivityId || "");
  const meta = {
    miniTaskId,
    executionRef: opts.executionRef ?? ma.linkedSubtaskExecutionRel ?? null,
    subtaskRef: opts.subtaskRef ?? (ma.subtaskId != null ? String(ma.subtaskId) : null),
  };

  let targetStatus = nextStatus;

  if (
    !opts.skipDependencyCheck &&
    (targetStatus === "ready" || targetStatus === "running")
  ) {
    const miniActivities = /** @type {Record<string, unknown>[]} */ (
      state.miniActivities
    );
    if (!depsSatisfied(miniActivities, String(ma.miniActivityId))) {
      if (targetStatus === "running") {
        return {
          ok: false,
          code: "blocked_by_dependency",
          message: "Dependências não satisfeitas para iniciar execução.",
          miniActivityId: String(ma.miniActivityId),
        };
      }
      targetStatus = "blocked_by_dependency";
    }
  }

  if (fromStatus !== targetStatus && !isTransitionAllowed(fromStatus, targetStatus)) {
    return {
      ok: false,
      code: "invalid_transition",
      message: `Transição não permitida: ${fromStatus} → ${targetStatus}`,
      from: fromStatus,
      to: targetStatus,
    };
  }

  if (fromStatus === targetStatus) {
    let patched = false;
    if (opts.review && typeof opts.review === "object") {
      applyReviewFields(ma, opts.review);
      patched = true;
    }
    if (opts.correction && typeof opts.correction === "object") {
      applyCorrectionFields(ma, opts.correction);
      patched = true;
    }
    if (opts.event && typeof opts.event === "object") {
      appendOperationalEvent(
        ma,
        {
          ...opts.event,
          miniTaskId,
          subtaskRef: opts.event.subtaskRef ?? meta.subtaskRef,
        },
        now,
      );
      patched = true;
    }
    if (!patched) {
      return {
        ok: true,
        noop: true,
        state,
        miniActivityId: String(ma.miniActivityId),
        status: targetStatus,
      };
    }
    state.updatedAt = now;
    state.aggregatedStatus = computeAggregatedStatus(
      /** @type {Record<string, unknown>[]} */ (state.miniActivities),
    );
    state.currentMiniActivityId = pickCurrentMiniActivityId(
      /** @type {Record<string, unknown>[]} */ (state.miniActivities),
    );
    writeStateAtomic(path.join(root, EXECUTION_RUNTIME_STATE_REL), state);
    return {
      ok: true,
      noop: true,
      patched: true,
      state,
      miniActivityId: String(ma.miniActivityId),
      status: targetStatus,
    };
  }

  appendTransition(
    ma,
    fromStatus,
    targetStatus,
    now,
    opts.reason || "executor_transition",
    meta,
  );
  ma.status = targetStatus;

  if (opts.review && typeof opts.review === "object") {
    applyReviewFields(ma, opts.review);
  }
  if (opts.correction && typeof opts.correction === "object") {
    applyCorrectionFields(ma, opts.correction);
  }
  if (opts.event && typeof opts.event === "object") {
    appendOperationalEvent(
      ma,
      {
        ...opts.event,
        miniTaskId,
        subtaskRef: opts.event.subtaskRef ?? meta.subtaskRef,
      },
      now,
    );
  }

  if (targetStatus === "completed") {
    ma.progress = { percent: 100, step: "completed" };
    if (ma.reviewStatus == null) ma.reviewStatus = "approved";
    ma.correctionPhase = "none";
    ma.correctionRequired = false;
  } else if (targetStatus === "running") {
    ma.progress = { percent: 0, step: "executing" };
  } else if (targetStatus === "review") {
    ma.progress = { percent: 0, step: "review" };
  } else if (targetStatus === "failed") {
    ma.progress = { percent: 0, step: "failed" };
  }

  const miniActivities = /** @type {Record<string, unknown>[]} */ (
    state.miniActivities
  );
  state.updatedAt = now;
  state.aggregatedStatus = computeAggregatedStatus(miniActivities);
  state.currentMiniActivityId = pickCurrentMiniActivityId(miniActivities);

  const statePath = path.join(root, EXECUTION_RUNTIME_STATE_REL);
  writeStateAtomic(statePath, state);

  return {
    ok: true,
    noop: false,
    state,
    miniActivityId: String(ma.miniActivityId),
    from: fromStatus,
    to: targetStatus,
  };
}

/**
 * Recalcula `ready` / `blocked_by_dependency` para miniActivities ainda não iniciadas.
 *
 * @param {string} outputDirAbs
 * @param {{ now?: string, reason?: string }} [opts]
 */
function refreshMiniActivityDependencyGates(outputDirAbs, opts = {}) {
  const root = path.resolve(String(outputDirAbs || ""));
  const loaded = loadExecutionRuntimeState(root);
  if (!loaded.ok || !loaded.state) {
    return { ok: false, code: "state_missing", legacy: true };
  }

  const now = opts.now || new Date().toISOString();
  const reason = opts.reason || "dependency_gate_refresh";
  const state = /** @type {Record<string, unknown>} */ ({
    ...loaded.state,
    miniActivities: (
      /** @type {Record<string, unknown>[]} */ (loaded.state.miniActivities) || []
    ).map((m) => ({ ...m })),
  });
  const miniActivities = /** @type {Record<string, unknown>[]} */ (
    state.miniActivities
  );

  const TERMINAL = new Set(["completed", "failed", "skipped", "running", "review"]);
  let changed = 0;

  for (const ma of miniActivities) {
    const prev = String(ma.status || "pending");
    if (TERMINAL.has(prev)) continue;

    const deps = asStringList(ma.dependsOnMiniActivityIds);
    const next = depsSatisfied(miniActivities, String(ma.miniActivityId))
      ? "ready"
      : deps.length
        ? "blocked_by_dependency"
        : "pending";

    if (prev === next) continue;
    if (!isTransitionAllowed(prev, next)) continue;

    appendTransition(ma, prev, next, now, reason, {
      miniTaskId: String(ma.miniTaskId || ma.miniActivityId || ""),
      executionRef: ma.linkedSubtaskExecutionRel
        ? String(ma.linkedSubtaskExecutionRel)
        : null,
      subtaskRef: ma.subtaskId != null ? String(ma.subtaskId) : null,
    });
    ma.status = next;
    changed += 1;
  }

  if (changed === 0) {
    return { ok: true, changed: 0, state: loaded.state };
  }

  state.updatedAt = now;
  state.aggregatedStatus = computeAggregatedStatus(miniActivities);
  state.currentMiniActivityId = pickCurrentMiniActivityId(miniActivities);

  const statePath = path.join(root, EXECUTION_RUNTIME_STATE_REL);
  writeStateAtomic(statePath, state);

  return { ok: true, changed, state };
}

/**
 * Não interrompe o executor em caso de falha.
 *
 * @param {string} outputDirAbs
 * @param {{ miniActivityId?: string, miniTaskId?: string, subtaskId?: string }} ref
 * @param {string} toStatus
 * @param {Parameters<typeof transitionMiniActivity>[3]} [opts]
 */
function tryTransitionMiniActivity(outputDirAbs, ref, toStatus, opts) {
  try {
    return transitionMiniActivity(outputDirAbs, ref, toStatus, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: "transition_warning",
      warning: message,
      legacy: true,
    };
  }
}

/**
 * @param {string} outputDirAbs
 * @param {{ subtaskId: string, toStatus: string, reason?: string, review?: object, executionRef?: string, subtaskRef?: string }} p
 */
function tryTransitionMiniActivityForSubtask(outputDirAbs, p) {
  return tryTransitionMiniActivity(
    outputDirAbs,
    { subtaskId: p.subtaskId },
    p.toStatus,
    {
      reason: p.reason,
      subtaskRef: p.subtaskRef ?? p.subtaskId,
      executionRef: p.executionRef,
      review: p.review,
    },
  );
}

module.exports = {
  ALLOWED_TRANSITIONS,
  REVIEW_STATUSES,
  CORRECTION_PHASES,
  OPERATIONAL_EVENT_TYPES,
  computeAggregatedStatus,
  pickCurrentMiniActivityId,
  transitionMiniActivity,
  patchMiniActivityOperational,
  refreshMiniActivityDependencyGates,
  tryTransitionMiniActivity,
  tryTransitionMiniActivityForSubtask,
  tryApplyMiniActivityReviewStarted,
  tryApplyMiniActivityReviewOutcome,
  applyMiniActivityReviewOutcome,
  tryApplyMiniActivityCorrectionStarted,
  tryApplyMiniActivityCorrectionCompleted,
  tryApplyMiniActivityCorrectionFailed,
  tryPatchMiniActivityOperational,
  findMiniActivity,
  isTransitionAllowed,
  appendOperationalEvent,
};
