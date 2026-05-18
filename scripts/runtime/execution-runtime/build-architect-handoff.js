"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject } = require("./build-execution-session");
const {
  subtaskExecutionFilename,
  readStrategySubtaskSummary,
  EXECUTION_SUBTASKS_REL,
  SUBTASK_PHASE,
} = require("./build-subtask-execution-state");

const HANDOFFS_REL = "execution/handoffs";
const SHARED_CONTEXT_REL = "strategy/shared-runtime-context.json";
const AI_STRATEGY_REL = "strategy/ai-strategy.json";
const COMPLEXITY_REL = "strategy/complexity-analysis.json";

/** @type {ReadonlySet<string>} */
const EXECUTION_CONSTRAINT_IDS = new Set([
  "linear_execution",
  "no_parallelism",
  "isolated_subtask_scope",
  "patch_only_allowed_files",
]);

/**
 * @param {string} subtaskId
 */
function architectHandoffFilename(subtaskId) {
  const id = String(subtaskId || "").trim();
  return /^\d{3}$/.test(id) ? `${id}-architect-handoff.json` : "";
}

/**
 * @param {string} fp
 * @returns {boolean}
 */
function pathHasWildcard(fp) {
  const s = String(fp || "");
  return /[*?\[\]{}]/.test(s) || s.includes("**");
}

/**
 * @param {unknown[]} raw
 * @returns {string[]}
 */
function normalizeAllowedFiles(raw) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const x of raw) {
    const t = String(x != null ? x : "").trim().replace(/\\/g, "/");
    if (!t || pathHasWildcard(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * @param {string} rootAbs
 * @param {string} strategyRel
 * @returns {Record<string, unknown>|null}
 */
function readStrategySubtaskDoc(rootAbs, strategyRel) {
  const p = path.join(rootAbs, String(strategyRel || "").replace(/\//g, path.sep));
  const j = readJsonObject(p);
  return j;
}

/**
 * @param {Record<string, unknown>|null} ai
 */
function pickRecommendedMode(ai) {
  if (!ai) return "basic";
  const m = String(ai.recommended_mode != null ? ai.recommended_mode : "").trim();
  return m || "basic";
}

/**
 * @param {Record<string, unknown>|null} cx
 */
function pickComplexityCompact(cx) {
  if (!cx || typeof cx !== "object") {
    return { overall: null, classification: "", risk: null };
  }
  const scores = cx.scores && typeof cx.scores === "object" && !Array.isArray(cx.scores)
    ? /** @type {Record<string, unknown>} */ (cx.scores)
    : null;
  const overall = scores && scores.overall != null ? Number(scores.overall) : null;
  const risk = scores && scores.risk != null ? Number(scores.risk) : null;
  return {
    overall: Number.isFinite(overall) ? overall : null,
    classification: String(cx.classification != null ? cx.classification : "").trim(),
    risk: Number.isFinite(risk) ? risk : null,
  };
}

/**
 * @param {Record<string, unknown>|null} shared
 */
function sharedRefsFromDoc(shared) {
  if (!shared) return [SHARED_CONTEXT_REL];
  const refs = Array.isArray(shared.context_refs)
    ? shared.context_refs.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/")).filter(Boolean)
    : [];
  const out = refs.length ? [...refs] : [SHARED_CONTEXT_REL];
  const seen = new Set();
  return out.filter((r) => (seen.has(r) ? false : (seen.add(r), true)));
}

/**
 * @param {unknown} doc
 * @returns {boolean}
 */
function isValidArchitectHandoffDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) return false;
  if (String(d.phase || "") !== "4.3") return false;
  if (!/^\d{3}$/.test(String(d.subtask_id || "").trim())) return false;
  if (String(d.execution_mode || "") !== "architect_preparation") return false;
  if (!Array.isArray(d.allowed_files)) return false;
  for (const f of d.allowed_files) {
    const fp = String(f != null ? f : "").trim();
    if (!fp || pathHasWildcard(fp)) return false;
  }
  const ac = d.architect_context;
  if (!ac || typeof ac !== "object" || Array.isArray(ac)) return false;
  const ctx = /** @type {Record<string, unknown>} */ (ac);
  if (typeof ctx.summary !== "string") return false;
  if (!ctx.complexity || typeof ctx.complexity !== "object" || Array.isArray(ctx.complexity)) return false;
  if (!ctx.ai_strategy || typeof ctx.ai_strategy !== "object" || Array.isArray(ctx.ai_strategy)) return false;
  if (!Array.isArray(ctx.execution_constraints)) return false;
  if (ctx.execution_constraints.length !== EXECUTION_CONSTRAINT_IDS.size) return false;
  for (const c of ctx.execution_constraints) {
    if (!EXECUTION_CONSTRAINT_IDS.has(String(c))) return false;
  }
  if (String(d.status || "") !== "prepared") return false;
  if (typeof d.created_at !== "string" || !String(d.created_at).trim()) return false;
  return true;
}

/**
 * @param {string} strategyRel
 * @param {string[]} subtaskRels
 */
function strategyRelForSubtaskId(id, subtaskRels) {
  const suffix = `/${id}.json`;
  const hit = subtaskRels.find((rel) => String(rel).replace(/\\/g, "/").endsWith(suffix));
  return hit != null ? String(hit).replace(/\\/g, "/") : `strategy/subtasks/${id}.json`;
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   execDir: string,
 *   subtaskRels: string[],
 *   force: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 *   rows: { subtask_id: string, title: string, depends_on: string[] }[],
 * }} p
 * @returns {{ artifacts: string[], preparedCount: number, handoffReadyCount: number }}
 */
function buildArchitectHandoffs(p) {
  const { outputDirAbs, execDir, subtaskRels, force, events, iso, rows } = p;
  const handoffsDir = path.join(execDir, "handoffs");
  if (force && fs.existsSync(handoffsDir)) {
    fs.rmSync(handoffsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(handoffsDir, { recursive: true });

  const sharedPath = path.join(outputDirAbs, SHARED_CONTEXT_REL.replace(/\//g, path.sep));
  const aiPath = path.join(outputDirAbs, AI_STRATEGY_REL.replace(/\//g, path.sep));
  const cxPath = path.join(outputDirAbs, COMPLEXITY_REL.replace(/\//g, path.sep));

  const sharedDoc = readJsonObject(sharedPath);
  const aiDoc = readJsonObject(aiPath);
  const cxDoc = readJsonObject(cxPath);

  const globalSharedRefs = sharedRefsFromDoc(sharedDoc);
  const globalRecommendedMode = pickRecommendedMode(aiDoc);
  const cxCompact = pickComplexityCompact(cxDoc);

  /** @type {string[]} */
  const artifacts = [];
  let preparedCount = 0;
  let handoffReadyCount = 0;

  for (const row of rows) {
    const sid = row.subtask_id;
    const strategyRel = strategyRelForSubtaskId(sid, subtaskRels);
    const stDoc = readStrategySubtaskDoc(outputDirAbs, strategyRel);
    const sum = readStrategySubtaskSummary(outputDirAbs, strategyRel);

    const title = String(
      (stDoc && stDoc.title != null ? stDoc.title : "") || sum.title || row.title || "",
    ).trim();
    const goal = String(stDoc && stDoc.goal != null ? stDoc.goal : "").trim();
    const scope = stDoc && stDoc.scope && typeof stDoc.scope === "object" && !Array.isArray(stDoc.scope)
      ? /** @type {Record<string, unknown>} */ (stDoc.scope)
      : null;
    const scopeFiles = scope && Array.isArray(scope.files) ? scope.files : [];
    const allowed_files = normalizeAllowedFiles(scopeFiles);

    const depRaw = stDoc && Array.isArray(stDoc.dependencies) ? stDoc.dependencies : [];
    const dependencies = depRaw
      .map((x) => String(x != null ? x : "").trim())
      .filter((x) => /^\d{3}$/.test(x));

    const scr = Array.isArray(stDoc && stDoc.shared_context_refs)
      ? /** @type {unknown[]} */ (stDoc.shared_context_refs)
      : sum.shared_context_refs;
    const shared_context_refs = Array.isArray(scr)
      ? [...new Set(scr.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/")).filter(Boolean))]
      : [...globalSharedRefs];

    const crit = stDoc && Array.isArray(stDoc.acceptance_criteria) ? stDoc.acceptance_criteria : [];
    const acceptance_criteria = crit
      .map((x) => String(x != null ? x : "").trim())
      .filter(Boolean);

    const summaryText =
      `${title ? `${title}: ` : ""}${goal ? goal.slice(0, 200) : "Subtask sem goal explícito."}`.slice(0, 400);

    const execution_constraints = [
      "linear_execution",
      "no_parallelism",
      "isolated_subtask_scope",
      "patch_only_allowed_files",
    ];

    const subCx =
      stDoc && stDoc.complexity && typeof stDoc.complexity === "object" && !Array.isArray(stDoc.complexity)
        ? /** @type {Record<string, unknown>} */ (stDoc.complexity)
        : null;
    const est = subCx && subCx.estimated_score != null ? Number(subCx.estimated_score) : null;
    const srisk = subCx && subCx.risk != null ? Number(subCx.risk) : null;

    const subAiRaw = stDoc && stDoc.ai_mode != null ? String(stDoc.ai_mode).trim() : "";
    const recommendedMode = subAiRaw || globalRecommendedMode;

    const architect_context = {
      summary: summaryText,
      complexity: {
        overall: Number.isFinite(est) ? est : cxCompact.overall,
        classification: cxCompact.classification || "unknown",
        risk: Number.isFinite(srisk) ? srisk : cxCompact.risk,
      },
      ai_strategy: {
        recommended_mode: recommendedMode,
      },
      execution_constraints,
    };

    const fn = architectHandoffFilename(sid);
    const fp = path.join(handoffsDir, fn);
    const existing = readJsonObject(fp);

    const execFp = path.join(execDir, "subtasks", subtaskExecutionFilename(sid));
    const execDoc = readJsonObject(execFp);
    const execState = execDoc ? String(execDoc.execution_state || "") : "";

    let created_at = iso();
    if (!force && existing && isValidArchitectHandoffDoc(existing) && typeof existing.created_at === "string") {
      created_at = String(existing.created_at);
    }

    const handoffDoc = {
      version: 1,
      phase: "4.3",
      subtask_id: sid,
      title,
      goal: goal || title,
      execution_mode: "architect_preparation",
      allowed_files,
      shared_context_refs,
      dependencies,
      acceptance_criteria: acceptance_criteria.length ? acceptance_criteria : ["Entrega alinhada ao plano refinado."],
      architect_context,
      status: "prepared",
      created_at,
    };

    const preserved =
      !force && existing && isValidArchitectHandoffDoc(existing) && execState === "handoff_ready";

    const needsHandoffReadySync =
      execState === "pending" ||
      execState === "handoff_preparing" ||
      execState === "preparing";

    const skipHandoffMutation =
      !force &&
      existing &&
      isValidArchitectHandoffDoc(existing) &&
      (execState === "execution_completed" ||
        execState === "execution_failed" ||
        execState === "executing" ||
        execState === "completed" ||
        execState === "failed" ||
        execState === "patch_validated" ||
        execState === "patch_validation_failed" ||
        execState === "validating_patch" ||
        execState === "reviewing" ||
        execState === "review_completed" ||
        execState === "review_failed");

    if (preserved) {
      const af = Array.isArray(existing.allowed_files) ? existing.allowed_files.length : 0;
      const aiMode = String(
        existing.architect_context &&
          typeof existing.architect_context === "object" &&
          !Array.isArray(existing.architect_context) &&
          existing.architect_context.ai_strategy &&
          typeof existing.architect_context.ai_strategy === "object"
          ? /** @type {Record<string, unknown>} */ (
              /** @type {Record<string, unknown>} */ (existing.architect_context).ai_strategy
            ).recommended_mode
          : "basic",
      );
      events.push({
        type: "architect_handoff_started",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
      events.push({
        type: "architect_handoff_prepared",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
      events.push({
        type: "architect_handoff_completed",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
    } else if (skipHandoffMutation) {
      const af = Array.isArray(existing.allowed_files) ? existing.allowed_files.length : 0;
      const aiMode = String(
        existing.architect_context &&
          typeof existing.architect_context === "object" &&
          !Array.isArray(existing.architect_context) &&
          existing.architect_context.ai_strategy &&
          typeof existing.architect_context.ai_strategy === "object"
          ? /** @type {Record<string, unknown>} */ (
              /** @type {Record<string, unknown>} */ (existing.architect_context).ai_strategy
            ).recommended_mode
          : "basic",
      );
      events.push({
        type: "architect_handoff_started",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
      events.push({
        type: "architect_handoff_prepared",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
      events.push({
        type: "architect_handoff_completed",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
    } else if (!force && existing && isValidArchitectHandoffDoc(existing) && needsHandoffReadySync) {
      writeSubtaskExecutionPatch(execDir, sid, {
        status: "handoff_ready",
        execution_state: "handoff_ready",
        phase: SUBTASK_PHASE,
        updated_at: iso(),
      });
      const af = Array.isArray(existing.allowed_files) ? existing.allowed_files.length : 0;
      const aiMode = String(
        existing.architect_context &&
          typeof existing.architect_context === "object" &&
          !Array.isArray(existing.architect_context) &&
          existing.architect_context.ai_strategy &&
          typeof existing.architect_context.ai_strategy === "object"
          ? /** @type {Record<string, unknown>} */ (
              /** @type {Record<string, unknown>} */ (existing.architect_context).ai_strategy
            ).recommended_mode
          : "basic",
      );
      events.push({
        type: "architect_handoff_started",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
      events.push({
        type: "architect_handoff_prepared",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
      events.push({
        type: "architect_handoff_completed",
        recorded_at: iso(),
        payload: { subtask_id: sid, allowed_files_count: af, ai_mode: aiMode },
      });
    } else {
      writeSubtaskExecutionPatch(execDir, sid, {
        status: "handoff_preparing",
        execution_state: "handoff_preparing",
        phase: SUBTASK_PHASE,
        updated_at: iso(),
      });

      fs.writeFileSync(fp, JSON.stringify(handoffDoc, null, 2), "utf-8");

      writeSubtaskExecutionPatch(execDir, sid, {
        status: "handoff_ready",
        execution_state: "handoff_ready",
        phase: SUBTASK_PHASE,
        updated_at: iso(),
      });

      const afCount = allowed_files.length;

      events.push({
        type: "architect_handoff_started",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          allowed_files_count: afCount,
          ai_mode: recommendedMode,
        },
      });
      events.push({
        type: "architect_handoff_prepared",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          allowed_files_count: afCount,
          ai_mode: recommendedMode,
        },
      });
      events.push({
        type: "architect_handoff_completed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          allowed_files_count: afCount,
          ai_mode: recommendedMode,
        },
      });
    }

    artifacts.push(`${HANDOFFS_REL}/${fn}`.replace(/\\/g, "/"));
    preparedCount += 1;
    const docAfter = readJsonObject(execFp);
    if (docAfter && String(docAfter.execution_state || "") === "handoff_ready") {
      handoffReadyCount += 1;
    }
  }

  return { artifacts, preparedCount, handoffReadyCount };
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 * @param {{ status: string, execution_state: string, updated_at: string, phase?: string }} upd
 */
function writeSubtaskExecutionPatch(execDir, subtaskId, upd) {
  const fn = subtaskExecutionFilename(subtaskId);
  const fp = path.join(execDir, "subtasks", fn);
  const doc = readJsonObject(fp);
  if (!doc) return;
  const d = /** @type {Record<string, unknown>} */ (doc);
  d.status = upd.status;
  d.execution_state = upd.execution_state;
  d.updated_at = upd.updated_at;
  if (upd.phase != null) d.phase = upd.phase;
  fs.writeFileSync(fp, JSON.stringify(d, null, 2), "utf-8");
}

module.exports = {
  HANDOFFS_REL,
  SHARED_CONTEXT_REL,
  AI_STRATEGY_REL,
  COMPLEXITY_REL,
  EXECUTION_CONSTRAINT_IDS,
  architectHandoffFilename,
  normalizeAllowedFiles,
  pathHasWildcard,
  isValidArchitectHandoffDoc,
  strategyRelForSubtaskId,
  buildArchitectHandoffs,
  writeSubtaskExecutionPatch,
};
