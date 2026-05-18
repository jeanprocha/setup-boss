"use strict";

const fs = require("fs");
const path = require("path");

const SUBTASK_PHASE = "4.5";

/** @type {ReadonlySet<string>} */
const SUBTASK_EXECUTION_LIFECYCLE = new Set([
  "pending",
  "handoff_preparing",
  "handoff_ready",
  "executing",
  "execution_completed",
  "validating_patch",
  "patch_validated",
  "patch_validation_failed",
  "execution_failed",
  "reviewing",
  "review_completed",
  "review_failed",
  "correcting",
  "retrying",
  "correction_completed",
  "correction_failed",
  "retry_exhausted",
  "preparing",
  "ready",
  "completed",
  "failed",
]);

const EXECUTION_SUBTASKS_REL = "execution/subtasks";

/**
 * @param {string} subtaskId
 */
function subtaskExecutionFilename(subtaskId) {
  const id = String(subtaskId || "").trim();
  return /^\d{3}$/.test(id) ? `${id}-execution.json` : "";
}

/**
 * @param {Record<string, unknown>} orderDoc
 * @returns {{ subtask_id: string, position: number, title: string, depends_on: string[] }[]}
 */
function orderedSubtaskRows(orderDoc) {
  const ordered = Array.isArray(orderDoc.ordered_subtasks) ? orderDoc.ordered_subtasks : [];
  /** @type {{ subtask_id: string, position: number, title: string, depends_on: string[] }[]} */
  const out = [];
  let i = 0;
  for (const row of ordered) {
    if (!row || typeof row !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const sid = String(r.subtask_id || "").trim();
    if (!/^\d{3}$/.test(sid)) continue;
    const pos = Number(r.position);
    const title = String(r.title != null ? r.title : "").trim();
    const depRaw = Array.isArray(r.depends_on) ? r.depends_on : [];
    const depends_on = depRaw
      .map((x) => String(x != null ? x : "").trim())
      .filter((x) => /^\d{3}$/.test(x));
    const expectedPos = i + 1;
    const position = Number.isInteger(pos) && pos > 0 ? pos : expectedPos;
    i += 1;
    out.push({ subtask_id: sid, position, title, depends_on });
  }
  return out;
}

/**
 * @param {string} rootAbs
 * @param {string} strategySubtaskRel
 */
function readStrategySubtaskSummary(rootAbs, strategySubtaskRel) {
  const p = path.join(rootAbs, String(strategySubtaskRel || "").replace(/\//g, path.sep));
  if (!fs.existsSync(p)) {
    return { title: "", shared_context_refs: /** @type {string[]} */ ([]) };
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) {
      return { title: "", shared_context_refs: [] };
    }
    const d = /** @type {Record<string, unknown>} */ (j);
    const title = String(d.title != null ? d.title : "").trim();
    const scr = Array.isArray(d.shared_context_refs)
      ? d.shared_context_refs.map((x) => String(x != null ? x : "").trim()).filter(Boolean)
      : [];
    return { title, shared_context_refs: scr };
  } catch {
    return { title: "", shared_context_refs: [] };
  }
}

/**
 * @param {{
 *   subtask_id: string,
 *   title: string,
 *   position: number,
 *   depends_on: string[],
 *   shared_context_refs: string[],
 *   now: string,
 * }} p
 */
function buildDefaultSubtaskExecutionDoc(p) {
  const now = p.now || new Date().toISOString();
  return {
    version: 1,
    phase: SUBTASK_PHASE,
    subtask_id: p.subtask_id,
    title: p.title,
    status: "pending",
    execution_state: "pending",
    created_at: now,
    updated_at: now,
    attempts: 0,
    position: p.position,
    depends_on: [...p.depends_on],
    artifacts: [],
    shared_context_refs: [...p.shared_context_refs],
    rollback_state: "none",
    snapshot_created_at: null,
    rollback_completed_at: null,
  };
}

/**
 * @param {unknown} doc
 * @param {{ subtask_id: string, position: number, depends_on: string[] }} expected
 * @returns {boolean}
 */
function isPreservableSubtaskExecutionDoc(doc, expected) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) return false;
  const ph = String(d.phase || "");
  if (ph !== SUBTASK_PHASE && ph !== "4.6" && ph !== "4.7" && ph !== "4.8" && ph !== "4.9" && ph !== "4.10" && ph !== "4.11" && ph !== "4.4" && ph !== "4.3" && ph !== "4.2")
    return false;
  if (String(d.subtask_id || "") !== expected.subtask_id) return false;
  if (Number(d.position) !== expected.position) return false;
  const st = String(d.status || "");
  const ex = String(d.execution_state || "");
  if (!SUBTASK_EXECUTION_LIFECYCLE.has(st) || !SUBTASK_EXECUTION_LIFECYCLE.has(ex)) return false;
  const deps = Array.isArray(d.depends_on)
    ? d.depends_on.map((x) => String(x != null ? x : "").trim())
    : [];
  if (deps.length !== expected.depends_on.length) return false;
  for (let i = 0; i < deps.length; i++) {
    if (deps[i] !== expected.depends_on[i]) return false;
  }
  return true;
}

/**
 * @param {Record<string, unknown>} doc
 */
function aggregateBucketForSubtask(doc) {
  const ex = String(doc.execution_state || "");
  if (ex === "preparing") return "pending";
  if (ex === "pending") return "pending";
  if (ex === "handoff_preparing") return "pending";
  if (ex === "executing") return "ready";
  if (ex === "handoff_ready") return "ready";
  if (ex === "ready") return "ready";
  if (ex === "execution_completed") return "ready";
  if (ex === "validating_patch") return "ready";
  if (ex === "patch_validated") return "completed";
  if (ex === "review_completed") return "completed";
  if (ex === "correction_completed") return "completed";
  if (ex === "reviewing") return "ready";
  if (ex === "correcting" || ex === "retrying") return "ready";
  if (ex === "completed") return "completed";
  if (ex === "patch_validation_failed") return "failed";
  if (ex === "review_failed") return "failed";
  if (ex === "correction_failed" || ex === "retry_exhausted") return "failed";
  if (ex === "execution_failed") return "failed";
  if (ex === "failed") return "failed";
  return null;
}

/**
 * @param {{ subtask_id: string, doc: Record<string, unknown> }[]} ordered
 * @returns {{ current_subtask: string|null, completed_subtasks: number, failed_subtasks: number, subtask_states: Record<string, number> }}
 */
function computeSessionAggregatesFromSubtasks(ordered) {
  /** @type {Record<string, number>} */
  const subtask_states = { pending: 0, ready: 0, completed: 0, failed: 0 };
  let completed_subtasks = 0;
  let failed_subtasks = 0;
  /** @type {string|null} */
  let current_subtask = null;

  for (const { doc } of ordered) {
    const b = aggregateBucketForSubtask(doc);
    if (b && subtask_states[b] != null) {
      subtask_states[b] += 1;
    }
    const exs = String(doc.execution_state || "");
    if (
      exs === "completed" ||
      exs === "patch_validated" ||
      exs === "review_completed" ||
      exs === "correction_completed"
    ) {
      completed_subtasks += 1;
    }
    if (
      exs === "failed" ||
      exs === "execution_failed" ||
      exs === "patch_validation_failed" ||
      exs === "review_failed" ||
      exs === "correction_failed" ||
      exs === "retry_exhausted"
    ) {
      failed_subtasks += 1;
    }
  }

  for (const { subtask_id, doc } of ordered) {
    const ex = String(doc.execution_state || "");
    if (
      ex === "pending" ||
      ex === "preparing" ||
      ex === "ready" ||
      ex === "handoff_preparing" ||
      ex === "handoff_ready" ||
      ex === "executing" ||
      ex === "execution_completed" ||
      ex === "validating_patch" ||
      ex === "reviewing" ||
      ex === "correcting" ||
      ex === "retrying"
    ) {
      current_subtask = subtask_id;
      break;
    }
  }

  return {
    current_subtask,
    completed_subtasks,
    failed_subtasks,
    subtask_states,
  };
}

module.exports = {
  SUBTASK_PHASE,
  SUBTASK_EXECUTION_LIFECYCLE,
  EXECUTION_SUBTASKS_REL,
  subtaskExecutionFilename,
  orderedSubtaskRows,
  readStrategySubtaskSummary,
  buildDefaultSubtaskExecutionDoc,
  isPreservableSubtaskExecutionDoc,
  computeSessionAggregatesFromSubtasks,
};
