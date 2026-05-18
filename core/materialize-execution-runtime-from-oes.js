"use strict";

const fs = require("fs");
const path = require("path");

const { loadOrBuildOperationalExecutableStrategy } = require("./load-operational-executable-strategy");
const { subtaskExecutionFilename } = require("../scripts/runtime/execution-runtime/build-subtask-execution-state");

const EXECUTION_RUNTIME_STATE_VERSION = 1;
const EXECUTION_RUNTIME_STATE_REL = "execution/execution-runtime-state.json";
const APPROVAL_STATE_REL = "approval-state.json";

/** @type {ReadonlySet<string>} */
const MINI_ACTIVITY_STATUSES = new Set([
  "pending",
  "ready",
  "blocked_by_dependency",
  "running",
  "review",
  "completed",
  "failed",
  "skipped",
]);

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function readJsonObject(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function asStringList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "").trim()).filter(Boolean);
}

/**
 * @param {Record<string, unknown>} scope
 */
function scopeSummaryFromOes(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return null;
  const summary =
    scope.summary != null ? String(scope.summary).trim() : "";
  if (summary) return summary;
  const highlights = asStringList(scope.highlights);
  return highlights.length ? highlights.join(", ") : null;
}

/**
 * @param {string} outputDirAbs
 */
function loadApprovalTraceability(outputDirAbs) {
  const root = path.resolve(outputDirAbs);
  const approval = readJsonObject(path.join(root, APPROVAL_STATE_REL));
  const ctx = readJsonObject(path.join(root, "run-context.json"));

  let sourceCommentId = null;
  const commentsDir = path.join(root, "plan-comments");
  if (fs.existsSync(commentsDir)) {
    try {
      let latestAt = "";
      for (const name of fs.readdirSync(commentsDir)) {
        if (!name.endsWith(".json")) continue;
        const doc = readJsonObject(path.join(commentsDir, name));
        if (!doc || !Array.isArray(doc.threads)) continue;
        for (const t of doc.threads) {
          if (!t || typeof t !== "object") continue;
          const comment = /** @type {Record<string, unknown>} */ (t).comment;
          const created =
            comment && comment.createdAt != null
              ? String(comment.createdAt)
              : "";
          const id =
            comment && comment.id != null ? String(comment.id).trim() : "";
          if (id && created >= latestAt) {
            latestAt = created;
            sourceCommentId = id;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const phase2 =
    ctx && ctx.phase2 && typeof ctx.phase2 === "object"
      ? /** @type {Record<string, unknown>} */ (ctx.phase2)
      : null;
  const approvalCtx =
    phase2 && phase2.approval && typeof phase2.approval === "object"
      ? /** @type {Record<string, unknown>} */ (phase2.approval)
      : null;

  return {
    sourcePlanSha256:
      approval && approval.plan_sha256 != null
        ? String(approval.plan_sha256).trim() || null
        : approvalCtx && approvalCtx.plan_sha256 != null
          ? String(approvalCtx.plan_sha256).trim() || null
          : null,
    sourcePlanRef:
      approval && approval.plan_ref != null
        ? String(approval.plan_ref).trim() || null
        : approvalCtx && approvalCtx.plan_ref != null
          ? String(approvalCtx.plan_ref).trim() || null
          : "task-plan-refined.md",
    sourceCommentId,
    sourcePlanId:
      approvalCtx && approvalCtx.plan_ref != null
        ? String(approvalCtx.plan_ref).trim() || null
        : null,
    approvedAt:
      approval && approval.approved_at != null
        ? String(approval.approved_at)
        : null,
  };
}

/**
 * @param {Record<string, unknown>[]} miniActivities
 * @param {string} miniActivityId
 */
function depsSatisfied(miniActivities, miniActivityId) {
  const byId = new Map(miniActivities.map((m) => [String(m.miniActivityId), m]));
  const row = byId.get(miniActivityId);
  if (!row) return false;
  const deps = asStringList(row.dependsOnMiniActivityIds);
  for (const depId of deps) {
    const dep = byId.get(depId);
    if (!dep) continue;
    if (String(dep.status) !== "completed" && String(dep.status) !== "skipped") {
      return false;
    }
  }
  return true;
}

/**
 * @param {string} execState
 * @param {string} reviewState
 */
function mapSubtaskExecToMiniStatus(execState, reviewState) {
  const s = String(execState || "").toLowerCase();
  const r = String(reviewState || "").toLowerCase();
  if (s.includes("completed") || s === "execution_completed") return "completed";
  if (s.includes("failed") || s.includes("exhausted")) return "failed";
  if (
    s.includes("review") ||
    r === "pending" ||
    r === "in_progress" ||
    s === "reviewing"
  ) {
    return "review";
  }
  if (s.includes("running") || s.includes("executing") || s === "ready") {
    if (s.includes("executing") || s.includes("running")) return "running";
  }
  return null;
}

/**
 * @param {string} outputDirAbs
 * @param {Record<string, unknown>} ma
 */
function readLinkedSubtaskExecution(outputDirAbs, ma) {
  const rel = ma.linkedSubtaskExecutionRel
    ? String(ma.linkedSubtaskExecutionRel).replace(/\\/g, "/")
    : "";
  if (!rel) return null;
  return readJsonObject(path.join(path.resolve(outputDirAbs), rel.replace(/\//g, path.sep)));
}

/**
 * @param {Record<string, unknown>[]} miniActivities
 */
function computeAggregatedStatus(miniActivities) {
  if (!miniActivities.length) return "not_materialized";
  if (miniActivities.every((m) => String(m.status) === "completed" || String(m.status) === "skipped")) {
    return "completed";
  }
  if (miniActivities.some((m) => String(m.status) === "running")) return "running";
  if (miniActivities.some((m) => String(m.status) === "review")) return "review";
  if (miniActivities.some((m) => String(m.status) === "failed")) return "failed";
  if (miniActivities.some((m) => String(m.status) === "ready")) return "ready";
  return "pending";
}

/**
 * @param {Record<string, unknown>[]} miniActivities
 */
function pickCurrentMiniActivityId(miniActivities) {
  const running = miniActivities.find((m) => String(m.status) === "running");
  if (running) return String(running.miniActivityId);
  const review = miniActivities.find((m) => String(m.status) === "review");
  if (review) return String(review.miniActivityId);
  const ready = miniActivities
    .filter((m) => String(m.status) === "ready")
    .sort((a, b) => Number(a.order) - Number(b.order))[0];
  if (ready) return String(ready.miniActivityId);
  return null;
}

/**
 * @param {Record<string, unknown>} ma
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {string} iso
 * @param {string} [reason]
 */
function appendTransition(ma, fromStatus, toStatus, iso, reason) {
  if (fromStatus === toStatus) return;
  const history = Array.isArray(ma.transitionHistory)
    ? /** @type {Record<string, unknown>[]} */ (ma.transitionHistory)
    : [];
  history.push({
    at: iso,
    from: fromStatus,
    to: toStatus,
    reason: reason || null,
  });
  ma.transitionHistory = history.slice(-40);
  ma.updatedAt = iso;
}

/**
 * @param {string} outputDirAbs
 * @param {{ force?: boolean, runId?: string, now?: string }} [opts]
 */
function materializeExecutionRuntimeFromOes(outputDirAbs, opts = {}) {
  const root = path.resolve(String(outputDirAbs || ""));
  const runId = opts.runId != null ? String(opts.runId) : path.basename(root);
  const now = opts.now || new Date().toISOString();
  const statePath = path.join(root, EXECUTION_RUNTIME_STATE_REL);

  const existing = readJsonObject(statePath);
  if (existing && !opts.force && Array.isArray(existing.miniActivities) && existing.miniActivities.length > 0) {
    return {
      ok: true,
      skipped: true,
      path: statePath,
      relPath: EXECUTION_RUNTIME_STATE_REL,
      state: existing,
    };
  }

  const oesResult = loadOrBuildOperationalExecutableStrategy(root, {
    runId,
    writeIfBuilt: false,
  });
  const artifact = oesResult.artifact;
  if (!artifact || !Array.isArray(artifact.miniTasks) || artifact.miniTasks.length === 0) {
    return {
      ok: false,
      code: "oes_unavailable",
      message: "Estratégia executável indisponível para materializar miniActivities.",
      legacy: true,
    };
  }

  const trace = loadApprovalTraceability(root);
  const sorted = [...artifact.miniTasks].sort(
    (a, b) => Number(a.order) - Number(b.order),
  );
  /** @type {Record<string, unknown>[]} */
  const miniActivities = sorted.map((mt) => {
    const miniActivityId = String(mt.id).trim();
    const subtaskId =
      mt.subtaskId != null
        ? String(mt.subtaskId).trim()
        : (() => {
            const m = /^mini-(\d{3})-/i.exec(miniActivityId);
            return m ? m[1] : "";
          })();
    const fn = subtaskId ? subtaskExecutionFilename(subtaskId) : "";
    const linkedSubtaskExecutionRel = fn
      ? path.join("execution", "subtasks", fn).replace(/\\/g, "/")
      : null;

    return {
      miniActivityId,
      miniTaskId: miniActivityId,
      subtaskId: subtaskId || null,
      order: Number(mt.order) > 0 ? Number(mt.order) : 1,
      title: String(mt.title || "").trim(),
      objective: String(mt.objective || "").trim() || null,
      scopeSummary: scopeSummaryFromOes(mt.scope),
      dependsOnMiniActivityIds: asStringList(mt.dependsOnIds),
      completionCriteria: asStringList(mt.completionCriteria).length
        ? asStringList(mt.completionCriteria)
        : asStringList(mt.acceptanceCriteria),
      validationHints: asStringList(mt.validationHints),
      status: "pending",
      reviewState: "none",
      reviewStatus: null,
      reviewSummary: null,
      reviewArtifactRef: null,
      correctionRequired: false,
      correctionRef: null,
      correctionPhase: "none",
      reviewedAt: null,
      progress: { percent: 0, step: null },
      artifacts: [],
      transitionHistory: [],
      operationalHistory: [],
      linkedSubtaskExecutionRel,
      createdAt: now,
      updatedAt: now,
    };
  });

  for (const ma of miniActivities) {
    const deps = asStringList(ma.dependsOnMiniActivityIds);
    if (deps.length === 0) {
      ma.status = "ready";
    } else if (depsSatisfied(miniActivities, String(ma.miniActivityId))) {
      ma.status = "ready";
    } else {
      ma.status = "blocked_by_dependency";
    }
  }

  const state = {
    version: EXECUTION_RUNTIME_STATE_VERSION,
    runId,
    materializedAt: now,
    updatedAt: now,
    legacy: false,
    traceability: {
      strategySha256:
        artifact.approvalState && artifact.approvalState.strategySha256 != null
          ? String(artifact.approvalState.strategySha256)
          : null,
      planVersion: String(artifact.planVersion || "v1"),
      sourcePlanVersion: String(artifact.sourcePlanVersion || artifact.planVersion || "v1"),
      sourcePlanSha256: trace.sourcePlanSha256,
      sourcePlanRef: trace.sourcePlanRef,
      sourceCommentId: trace.sourceCommentId,
      sourcePlanId: trace.sourcePlanId,
      oesVersion: Number(artifact.version) || 1,
      approvedAt: trace.approvedAt,
    },
    orderingMode: String(artifact.orderingMode || "linear"),
    macroOrder: asStringList(artifact.macroOrder),
    aggregatedStatus: computeAggregatedStatus(miniActivities),
    currentMiniActivityId: pickCurrentMiniActivityId(miniActivities),
    miniActivities,
  };

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

  return {
    ok: true,
    skipped: false,
    path: statePath,
    relPath: EXECUTION_RUNTIME_STATE_REL,
    state,
  };
}

/**
 * Sincroniza status das miniActivities com execution/subtasks/* sem alterar o executor.
 *
 * @param {string} outputDirAbs
 * @param {{ now?: string }} [opts]
 */
function syncExecutionRuntimeMiniActivities(outputDirAbs, opts = {}) {
  const root = path.resolve(String(outputDirAbs || ""));
  const statePath = path.join(root, EXECUTION_RUNTIME_STATE_REL);
  const state = readJsonObject(statePath);
  if (!state || !Array.isArray(state.miniActivities) || !state.miniActivities.length) {
    return { ok: false, code: "state_missing", legacy: true };
  }

  const now = opts.now || new Date().toISOString();
  const miniActivities = /** @type {Record<string, unknown>[]} */ (
    state.miniActivities.map((m) => ({ .../** @type {Record<string, unknown>} */ (m) }))
  );

  for (const ma of miniActivities) {
    const prev = String(ma.status || "pending");
    const stDoc = readLinkedSubtaskExecution(root, ma);
    let next = prev;

    if (stDoc) {
      const execState = String(stDoc.execution_state || stDoc.status || "");
      const reviewState = String(stDoc.review_state || "");
      const mapped = mapSubtaskExecToMiniStatus(execState, reviewState);
      if (mapped) {
        next = mapped;
      } else if (prev !== "completed" && prev !== "failed" && prev !== "skipped") {
        next = depsSatisfied(miniActivities, String(ma.miniActivityId))
          ? "ready"
          : "blocked_by_dependency";
      }
    } else if (prev !== "completed" && prev !== "failed" && prev !== "running" && prev !== "review") {
      next = depsSatisfied(miniActivities, String(ma.miniActivityId))
        ? "ready"
        : asStringList(ma.dependsOnMiniActivityIds).length
          ? "blocked_by_dependency"
          : "pending";
    }

    if (!MINI_ACTIVITY_STATUSES.has(next)) next = "pending";
    appendTransition(ma, prev, next, now, stDoc ? "subtask_sync" : "dependency_eval");
    ma.status = next;

    if (stDoc && stDoc.review_state != null) {
      const r = String(stDoc.review_state).toLowerCase();
      ma.reviewState =
        r === "approved" || r === "rejected" || r === "pending" ? r : "none";
    }

    ma.progress = {
      percent: String(ma.status) === "completed" ? 100 : 0,
      step: execStateLabel(stDoc),
    };
  }

  state.miniActivities = miniActivities;
  state.updatedAt = now;
  state.aggregatedStatus = computeAggregatedStatus(miniActivities);
  state.currentMiniActivityId = pickCurrentMiniActivityId(miniActivities);

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  return { ok: true, state, relPath: EXECUTION_RUNTIME_STATE_REL };
}

/**
 * @param {Record<string, unknown>|null} stDoc
 */
function execStateLabel(stDoc) {
  if (!stDoc) return null;
  const s = String(stDoc.execution_state || stDoc.status || "");
  if (!s) return null;
  return s.replace(/_/g, " ");
}

/**
 * @param {string} outputDirAbs
 */
function loadExecutionRuntimeState(outputDirAbs) {
  const root = path.resolve(String(outputDirAbs || ""));
  const statePath = path.join(root, EXECUTION_RUNTIME_STATE_REL);
  const state = readJsonObject(statePath);
  if (!state) {
    return { ok: false, legacy: true, state: null };
  }
  return { ok: true, legacy: false, state, path: statePath, relPath: EXECUTION_RUNTIME_STATE_REL };
}

module.exports = {
  EXECUTION_RUNTIME_STATE_VERSION,
  EXECUTION_RUNTIME_STATE_REL,
  MINI_ACTIVITY_STATUSES,
  materializeExecutionRuntimeFromOes,
  syncExecutionRuntimeMiniActivities,
  loadExecutionRuntimeState,
  depsSatisfied,
  mapSubtaskExecToMiniStatus,
};
