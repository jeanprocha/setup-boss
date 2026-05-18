"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject } = require("./build-execution-session");
const { subtaskExecutionFilename, orderedSubtaskRows } = require("./build-subtask-execution-state");
const {
  executionResultFilename,
  isValidExecutionResultDoc,
  EXECUTION_RESULTS_REL,
} = require("./run-subtask-executor");
const { patchValidationFilename, isValidPatchValidationDoc } = require("./validate-execution-patch");
const { architectHandoffFilename, isValidArchitectHandoffDoc } = require("./build-architect-handoff");

const REVIEW_PHASE = "4.6";

/**
 * @param {string} subtaskId
 */
function executionReviewFilename(subtaskId) {
  const id = String(subtaskId || "").trim();
  return /^\d{3}$/.test(id) ? `${id}-execution-review.json` : "";
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 * @param {Record<string, unknown>} fields
 */
function mergeSubtaskReviewFields(execDir, subtaskId, fields) {
  const fn = subtaskExecutionFilename(subtaskId);
  const fp = path.join(execDir, "subtasks", fn);
  const doc = readJsonObject(fp);
  if (!doc) return;
  const d = /** @type {Record<string, unknown>} */ (doc);
  for (const [k, v] of Object.entries(fields)) {
    d[k] = v;
  }
  fs.writeFileSync(fp, JSON.stringify(d, null, 2), "utf-8");
}

/**
 * @param {unknown} doc
 * @returns {boolean}
 */
function isValidExecutionReviewDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) return false;
  if (String(d.phase || "") !== REVIEW_PHASE) return false;
  if (!/^\d{3}$/.test(String(d.subtask_id || "").trim())) return false;
  const st = String(d.status || "");
  if (st !== "review_completed" && st !== "review_failed") return false;
  const rs = String(d.review_state || "");
  if (rs !== "approved" && rs !== "rejected" && rs !== "blocked") return false;
  if (typeof d.reviewed_at !== "string" || !d.reviewed_at.trim()) return false;
  const dec = d.decision;
  if (!dec || typeof dec !== "object" || Array.isArray(dec)) return false;
  const de = /** @type {Record<string, unknown>} */ (dec);
  const res = String(de.result || "");
  if (res !== "approved" && res !== "rejected" && res !== "blocked") return false;
  if (typeof de.requires_correction !== "boolean") return false;
  if (typeof de.blocking !== "boolean") return false;
  if (res !== rs) return false;
  const ch = d.checks;
  if (!ch || typeof ch !== "object" || Array.isArray(ch)) return false;
  const ck = /** @type {Record<string, unknown>} */ (ch);
  for (const k of [
    "patch_validation_passed",
    "allowed_scope_respected",
    "acceptance_criteria_present",
    "execution_completed",
  ]) {
    if (typeof ck[k] !== "boolean") return false;
  }
  if (!Array.isArray(d.warnings) || !Array.isArray(d.errors)) return false;
  if (typeof d.review_summary !== "string") return false;
  return true;
}

/**
 * @param {string} ex
 * @param {string} st
 * @param {boolean} force
 * @param {string} sid
 * @param {string} execDir
 * @returns {boolean}
 */
function shouldRunExecutionReview(ex, st, force, sid, execDir) {
  if (ex === "reviewing") return true;
  const rvFn = executionReviewFilename(sid);
  const rvPath = path.join(execDir, "results", rvFn || "");
  const rvPrev = rvFn && fs.existsSync(rvPath) ? readJsonObject(rvPath) : null;

  if (ex === "patch_validated" || ex === "patch_validation_failed" || ex === "execution_failed") {
    if (force) return true;
    if (rvPrev && isValidExecutionReviewDoc(rvPrev) && String(/** @type {Record<string, unknown>} */ (rvPrev).review_state) === "approved") {
      return false;
    }
    return true;
  }
  if (ex === "review_completed" || st === "review_completed") {
    if (force) return true;
    if (rvPrev && isValidExecutionReviewDoc(rvPrev) && String(/** @type {Record<string, unknown>} */ (rvPrev).review_state) === "approved") {
      return false;
    }
    return true;
  }
  if (ex === "review_failed" || st === "review_failed") {
    if (force) return true;
    if (rvPrev && isValidExecutionReviewDoc(rvPrev)) return false;
    return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>|null} ho
 * @returns {{ ok: boolean, reason?: string }}
 */
function structuralAcceptanceFromHandoff(ho) {
  if (!ho || !isValidArchitectHandoffDoc(ho)) {
    return { ok: false, reason: "architect-handoff inválido ou ausente." };
  }
  const ac = ho.acceptance_criteria;
  if (!Array.isArray(ac)) {
    return { ok: false, reason: "acceptance_criteria deve ser array no handoff." };
  }
  if (ac.length === 0) {
    return { ok: false, reason: "acceptance_criteria não pode ser vazio quando definido." };
  }
  return { ok: true };
}

/**
 * @param {Record<string, unknown>|null} res
 * @returns {{ ok: boolean, reason?: string }}
 */
function structuralExecutionResult(res) {
  if (!res || !isValidExecutionResultDoc(res)) {
    return { ok: false, reason: "execution-result inválido ou ausente." };
  }
  if (typeof res.execution_summary !== "string" || !String(res.execution_summary).trim()) {
    return { ok: false, reason: "execution_summary em falta ou vazio." };
  }
  return { ok: true };
}

/**
 * @param {Record<string, unknown>|null} pv
 * @param {{ needsPatchFile: boolean }} ctx
 * @returns {{ ok: boolean, reason?: string }}
 */
function structuralPatchValidation(pv, ctx) {
  if (!ctx.needsPatchFile) {
    return { ok: true };
  }
  if (!pv || !isValidPatchValidationDoc(pv)) {
    return { ok: false, reason: "patch-validation inválido ou ausente." };
  }
  if (typeof pv.validation_summary !== "string" || !String(pv.validation_summary).trim()) {
    return { ok: false, reason: "validation_summary em falta ou vazio." };
  }
  return { ok: true };
}

/**
 * @param {{
 *   execDir: string,
 *   loaded: { orderDoc: Record<string, unknown> },
 *   force: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 *   outputDirAbs?: string,
 *   lifecycleCtx?: { outputDirAbs: string, loaded: { orderDoc: Record<string, unknown> } },
 * }} p
 * @returns {{
 *   artifacts: string[],
 *   approved_delta: number,
 *   rejected_delta: number,
 *   blocked_delta: number,
 *   review_failed_events: number,
 * }}
 */
function runExecutionReviewPhase(p) {
  const { execDir, loaded, force, events, iso } = p;
  const outputDirAbsForCk =
    p.lifecycleCtx && p.lifecycleCtx.outputDirAbs
      ? p.lifecycleCtx.outputDirAbs
      : p.outputDirAbs != null
        ? String(p.outputDirAbs)
        : path.dirname(execDir);
  const resultsDir = path.join(execDir, "results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const rows = orderedSubtaskRows(loaded.orderDoc);
  /** @type {string[]} */
  const artifacts = [];
  let approved_delta = 0;
  let rejected_delta = 0;
  let blocked_delta = 0;
  let review_failed_events = 0;

  for (const row of rows) {
    const sid = row.subtask_id;
    const stPath = path.join(execDir, "subtasks", subtaskExecutionFilename(sid));
    const subDoc = readJsonObject(stPath);
    if (!subDoc) continue;
    const ex = String(subDoc.execution_state || "");
    const st = String(subDoc.status || "");

    if (!shouldRunExecutionReview(ex, st, force, sid, execDir)) {
      const rvFnSync = executionReviewFilename(sid);
      const rvPathSync = path.join(execDir, "results", rvFnSync || "");
      const rvSync = rvFnSync && fs.existsSync(rvPathSync) ? readJsonObject(rvPathSync) : null;
      if (
        !force &&
        (ex === "patch_validated" || ex === "patch_validation_failed" || ex === "execution_failed") &&
        rvSync &&
        isValidExecutionReviewDoc(rvSync) &&
        String(/** @type {Record<string, unknown>} */ (rvSync).review_state) === "approved"
      ) {
        const ra = String(/** @type {Record<string, unknown>} */ (rvSync).reviewed_at || "").trim() || iso();
        mergeSubtaskReviewFields(execDir, sid, {
          status: "review_completed",
          execution_state: "review_completed",
          phase: REVIEW_PHASE,
          updated_at: iso(),
          review_state: "approved",
          review_completed_at: ra,
          review_decision: {
            result: "approved",
            requires_correction: false,
            blocking: false,
          },
        });
      }
      continue;
    }

    const hfn = architectHandoffFilename(sid);
    const hpath = path.join(execDir, "handoffs", hfn || "");
    const handoff = hfn && fs.existsSync(hpath) ? readJsonObject(hpath) : null;

    const resFn = executionResultFilename(sid);
    const resPath = path.join(resultsDir, resFn || "");
    const execRes = resFn && fs.existsSync(resPath) ? readJsonObject(resPath) : null;

    const pvFn = patchValidationFilename(sid);
    const pvPath = path.join(resultsDir, pvFn || "");
    const pvDoc = pvFn && fs.existsSync(pvPath) ? readJsonObject(pvPath) : null;

    const needsPatchFile = ex !== "execution_failed" && st !== "execution_failed";

    mergeSubtaskReviewFields(execDir, sid, {
      status: "reviewing",
      execution_state: "reviewing",
      phase: REVIEW_PHASE,
      updated_at: iso(),
    });

    const { tryApplyMiniActivityReviewStarted } = require("../../../core/update-execution-runtime-state");
    tryApplyMiniActivityReviewStarted(outputDirAbsForCk, {
      subtaskId: sid,
      subtaskRef: sid,
      reason: "execution_review_started",
    });

    events.push({
      type: "execution_review_started",
      recorded_at: iso(),
      payload: {
        subtask_id: sid,
        review_state: "pending",
        decision: { result: "pending", requires_correction: false, blocking: false },
        warnings_count: 0,
        errors_count: 0,
      },
    });

    /** @type {string[]} */
    const warnings = [];
    /** @type {string[]} */
    const errors = [];

    const acHo = structuralAcceptanceFromHandoff(handoff);
    if (!acHo.ok && acHo.reason) errors.push(acHo.reason);

    const acRes = structuralExecutionResult(execRes);
    if (!acRes.ok && acRes.reason) errors.push(acRes.reason);

    const acPv = structuralPatchValidation(pvDoc, { needsPatchFile });
    if (!acPv.ok && acPv.reason) errors.push(acPv.reason);

    const structuralBlocked = errors.length > 0;

    let patchPassed = false;
    let allowedScopeOk = false;
    let execCompleted = false;
    let pvErrorsLen = 0;
    let pvWarnLen = 0;

    if (!structuralBlocked && execRes && isValidExecutionResultDoc(execRes)) {
      execCompleted = String(execRes.status) === "completed";
      const val = execRes.validation && typeof execRes.validation === "object" && !Array.isArray(execRes.validation)
        ? /** @type {Record<string, unknown>} */ (execRes.validation)
        : null;
      allowedScopeOk = !!(val && val.allowed_scope_respected === true);
      if (execRes.status === "failed") {
        errors.push("execution-result: execução falhou.");
      } else if (execCompleted && !allowedScopeOk) {
        errors.push("execution-result: allowed_scope_respected deve ser true para aprovação.");
      }
    }

    if (!structuralBlocked && needsPatchFile) {
      if (pvDoc && isValidPatchValidationDoc(pvDoc)) {
        pvErrorsLen = Array.isArray(pvDoc.errors) ? pvDoc.errors.length : 0;
        pvWarnLen = Array.isArray(pvDoc.warnings) ? pvDoc.warnings.length : 0;
        patchPassed = String(pvDoc.validation_state) === "passed";
        if (!patchPassed) {
          errors.push("patch-validation: validation_state não é passed.");
        }
        if (pvErrorsLen > 0) {
          errors.push(`patch-validation: ${pvErrorsLen} erro(s) registado(s).`);
        }
      } else {
        errors.push("patch-validation.json em falta para este estado de subtask.");
      }
    }

    if (!structuralBlocked && execRes && isValidExecutionResultDoc(execRes) && execCompleted) {
      const val = execRes.validation && typeof execRes.validation === "object" && !Array.isArray(execRes.validation)
        ? /** @type {Record<string, unknown>} */ (execRes.validation)
        : null;
      const unexpected = val && Array.isArray(val.unexpected_files) ? val.unexpected_files.length : 0;
      if (unexpected > 0) {
        errors.push("execution-result: ficheiros inesperados fora do scope permitido.");
      }
    }

    const acceptancePresent = acHo.ok;

    /** @type {{ result: string, requires_correction: boolean, blocking: boolean }} */
    let decision = { result: "blocked", requires_correction: false, blocking: true };
    /** @type {"approved"|"rejected"|"blocked"} */
    let review_state = "blocked";
    /** @type {"review_completed"|"review_failed"} */
    let outStatus = "review_failed";
    /** @type {Record<string, boolean>} */
    const checks = {
      patch_validation_passed: patchPassed,
      allowed_scope_respected: allowedScopeOk,
      acceptance_criteria_present: acceptancePresent,
      execution_completed: execCompleted,
    };

    if (structuralBlocked) {
      decision = { result: "blocked", requires_correction: false, blocking: true };
      review_state = "blocked";
      outStatus = "review_failed";
      blocked_delta += 1;
      review_failed_events += 1;
    } else if (!execCompleted || String(execRes?.status) === "failed") {
      decision = { result: "rejected", requires_correction: false, blocking: false };
      review_state = "rejected";
      outStatus = "review_failed";
      rejected_delta += 1;
      review_failed_events += 1;
    } else if (!allowedScopeOk || !patchPassed || errors.length > 0) {
      decision = { result: "rejected", requires_correction: false, blocking: false };
      review_state = "rejected";
      outStatus = "review_failed";
      rejected_delta += 1;
      review_failed_events += 1;
    } else {
      decision = { result: "approved", requires_correction: false, blocking: false };
      review_state = "approved";
      outStatus = "review_completed";
      approved_delta += 1;
    }

    const reviewedAt = iso();
    const summaryParts = [
      `Review MVP (${review_state}).`,
      `patch_validation_passed=${checks.patch_validation_passed}`,
      `execution_completed=${checks.execution_completed}`,
    ];
    const reviewDoc = {
      version: 1,
      phase: REVIEW_PHASE,
      subtask_id: sid,
      status: outStatus === "review_completed" ? "review_completed" : "review_failed",
      review_state,
      reviewed_at: reviewedAt,
      decision: {
        result: decision.result,
        requires_correction: decision.requires_correction,
        blocking: decision.blocking,
      },
      checks,
      warnings,
      errors,
      review_summary: summaryParts.join(" "),
    };

    const rvFn = executionReviewFilename(sid);
    const rvPath = path.join(resultsDir, rvFn || "");
    if (rvFn) {
      fs.writeFileSync(rvPath, JSON.stringify(reviewDoc, null, 2), "utf-8");
      artifacts.push(`${EXECUTION_RESULTS_REL}/${rvFn}`.replace(/\\/g, "/"));
    }

    const terminalEx = outStatus === "review_completed" ? "review_completed" : "review_failed";
    mergeSubtaskReviewFields(execDir, sid, {
      status: terminalEx,
      execution_state: terminalEx,
      phase: REVIEW_PHASE,
      updated_at: reviewedAt,
      review_state,
      review_completed_at: reviewedAt,
      review_decision: { ...decision },
    });

    const rvRel = rvFn
      ? `${EXECUTION_RESULTS_REL}/${rvFn}`.replace(/\\/g, "/")
      : null;
    const corrRel = `execution/results/${sid}-correction-loop.json`;
    const { tryApplyMiniActivityReviewOutcome } = require("../../../core/update-execution-runtime-state");
    const reviewOutcome =
      outStatus === "review_completed"
        ? "approved"
        : review_state === "blocked"
          ? "blocked"
          : "rejected";
    tryApplyMiniActivityReviewOutcome(
      outputDirAbsForCk,
      { subtaskId: sid },
      reviewOutcome,
      {
        reason:
          outStatus === "review_completed"
            ? "execution_review_approved"
            : "execution_review_failed",
        subtaskRef: sid,
        reviewSummary: reviewDoc.review_summary,
        reviewArtifactRef: rvRel,
        correctionRef: corrRel,
      },
    );

    const warnCount = warnings.length + pvWarnLen;
    const errCount = errors.length;

    if (outStatus === "review_completed") {
      events.push({
        type: "execution_review_completed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          review_state,
          decision: reviewDoc.decision,
          warnings_count: warnCount,
          errors_count: errCount,
        },
      });
    } else {
      events.push({
        type: "execution_review_failed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          review_state,
          decision: reviewDoc.decision,
          warnings_count: warnCount,
          errors_count: errCount,
        },
      });
    }

    if (p.lifecycleCtx && p.lifecycleCtx.loaded) {
      const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
      saveExecutionCheckpoint({
        execDir,
        outputDirAbs: outputDirAbsForCk,
        loaded: p.lifecycleCtx.loaded,
        subtaskId: sid,
        lifecycleState: "running",
        recoveryState: outStatus === "review_completed" ? "post_execution_review" : "post_execution_review_failed",
        events,
        iso,
      });
    }
  }

  try {
    const { refreshMiniActivityDependencyGates } = require("../../../core/update-execution-runtime-state");
    refreshMiniActivityDependencyGates(outputDirAbsForCk, {
      reason: "post_review_dependency_refresh",
    });
  } catch {
    /* não bloquear execução */
  }

  return { artifacts, approved_delta, rejected_delta, blocked_delta, review_failed_events };
}

module.exports = {
  REVIEW_PHASE,
  executionReviewFilename,
  isValidExecutionReviewDoc,
  runExecutionReviewPhase,
  shouldRunExecutionReview,
};
