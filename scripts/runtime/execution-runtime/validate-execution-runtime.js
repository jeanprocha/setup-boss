"use strict";

const fs = require("fs");
const path = require("path");

const {
  loadHandoffAndOrderForExecution,
  readJsonObject,
} = require("./build-execution-session");
const {
  orderedSubtaskRows,
  subtaskExecutionFilename,
  isPreservableSubtaskExecutionDoc,
  computeSessionAggregatesFromSubtasks,
  SUBTASK_EXECUTION_LIFECYCLE,
  EXECUTION_SUBTASKS_REL,
} = require("./build-subtask-execution-state");
const {
  HANDOFFS_REL,
  architectHandoffFilename,
  isValidArchitectHandoffDoc,
} = require("./build-architect-handoff");
const {
  EXECUTION_RESULTS_REL,
  executionResultFilename,
  isValidExecutionResultDoc,
  sumModifiedFilesFromResults,
} = require("./run-subtask-executor");
const {
  patchValidationFilename,
  isValidPatchValidationDoc,
} = require("./validate-execution-patch");
const {
  executionReviewFilename,
  isValidExecutionReviewDoc,
} = require("./run-execution-review");
const {
  correctionLoopFilename,
  CORRECTION_PHASE,
  MAX_ATTEMPTS,
} = require("./run-correction-runtime");
const {
  GLOBAL_LIFECYCLE_STATES,
  LIFECYCLE_FILENAME,
  summarizeLifecycleFromEvents,
} = require("./manage-execution-lifecycle");
const {
  rollbackStatePath,
  snapshotFilePath,
  ROLLBACK_DIRNAME,
  ROLLBACK_STATE_FILENAME,
  ROLLBACK_STATE_VALUES,
} = require("./manage-execution-rollback");
const {
  OBSERVABILITY_FILE,
  OBS_PHASE,
  OBS_STATUS,
  isRoughIsoTimestamp,
} = require("./build-execution-observability");
const {
  MVP_EXECUTION_PHASE,
  isAcceptedBundlePhase,
  isLegacyBundlePhase,
} = require("./execution-mvp-contract");

const EXECUTION_DIRNAME = "execution";
const SESSION_FILE = "execution-session.json";
const DIAGNOSTICS_FILE = "execution-diagnostics.json";
const LIFECYCLE_FILE = LIFECYCLE_FILENAME;
const HANDOFFS_DIRNAME = "handoffs";
const RESULTS_DIRNAME = "results";

/**
 * @param {string[]} arr
 * @returns {string[]}
 */
function dedupeStrings(arr) {
  return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
}

/** @type {ReadonlySet<string>} */
const MVP_SESSION_STATUS = new Set([
  "executor_mvp_idle",
  "executor_mvp_step_succeeded",
  "executor_mvp_step_failed",
]);

/** @type {ReadonlySet<string>} */
const EXECUTION_LIFECYCLE_STATES = new Set(["pending", "preparing", "completed", "failed"]);

/** @type {ReadonlySet<string>} */
const CORRECTION_LOOP_STATUS = new Set(["idle", "correction_completed", "correction_failed", "retry_exhausted"]);

/** @type {ReadonlySet<string>} */
const CORRECTION_STATE_VALUES = new Set([
  "none",
  "correcting",
  "retrying",
  "retry_completed",
  "retry_exhausted",
  "correction_failed",
]);

/**
 * @param {Record<string, unknown>|null} loop
 * @param {string} sid
 * @param {Record<string, unknown>|null} subDoc
 * @param {string} loopFilename
 * @returns {string[]}
 */
function validateCorrectionLoopAgainstSubtask(loop, sid, subDoc, loopFilename) {
  /** @type {string[]} */
  const errors = [];
  const label = `${EXECUTION_RESULTS_REL}/${loopFilename}`;
  if (!loop || typeof loop !== "object" || Array.isArray(loop)) {
    errors.push(`${label}: JSON inválido.`);
    return errors;
  }
  const l = /** @type {Record<string, unknown>} */ (loop);
  if (Number(l.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(l.phase || "") !== CORRECTION_PHASE) {
    errors.push(`${label}: phase deve ser '${CORRECTION_PHASE}'.`);
  }
  if (String(l.subtask_id || "").trim() !== sid) {
    errors.push(`${label}: subtask_id incoerente.`);
  }
  const max = Number(l.max_attempts);
  if (!Number.isInteger(max) || max !== MAX_ATTEMPTS) {
    errors.push(`${label}: max_attempts deve ser ${MAX_ATTEMPTS}.`);
  }
  const att = Number(l.attempt);
  if (!Number.isInteger(att) || att < 0 || att > MAX_ATTEMPTS) {
    errors.push(`${label}: attempt inválido.`);
  }
  const status = String(l.status || "");
  if (!CORRECTION_LOOP_STATUS.has(status)) {
    errors.push(`${label}: status inválido.`);
  }
  const cs = String(l.correction_state || "");
  if (!CORRECTION_STATE_VALUES.has(cs)) {
    errors.push(`${label}: correction_state inválido.`);
  }
  if (typeof l.retry_allowed !== "boolean") {
    errors.push(`${label}: retry_allowed deve ser boolean.`);
  }
  if (typeof l.requires_retry !== "boolean") {
    errors.push(`${label}: requires_retry deve ser boolean.`);
  }
  if (status === "retry_exhausted" && l.retry_allowed === true) {
    errors.push(`${label}: retry_exhausted requer retry_allowed=false.`);
  }
  if (status === "correction_completed" && l.retry_allowed !== true) {
    errors.push(`${label}: correction_completed requer retry_allowed=true.`);
  }
  if (!Array.isArray(l.warnings) || !Array.isArray(l.errors)) {
    errors.push(`${label}: warnings/errors devem ser arrays.`);
  }
  if (subDoc) {
    const subAtt = Number(subDoc.correction_attempts);
    const ex = String(subDoc.execution_state || "");
    if (status === "correction_completed" && ex === "review_completed") {
      if (!Number.isInteger(subAtt) || subAtt < 1 || subAtt > MAX_ATTEMPTS) {
        errors.push(`${label}: correction_attempts na subtask incoerente com correction_completed.`);
      }
    }
  }
  return errors;
}

/**
 * @param {string} outputDirAbs
 * @param {{ skipObservability?: boolean }} [opts]
 * @returns {{ errors: string[], warnings: string[], checked_artifacts: number, checked_subtasks: number }}
 */
function validateExecutionRuntimeDetailed(outputDirAbs, opts) {
  const skipObservability = opts && opts.skipObservability === true;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const root = path.resolve(String(outputDirAbs || ""));
  const execDir = path.join(root, EXECUTION_DIRNAME);
  const sessionPath = path.join(execDir, SESSION_FILE);
  const diagPath = path.join(execDir, DIAGNOSTICS_FILE);

  if (!fs.existsSync(execDir) || !fs.statSync(execDir).isDirectory()) {
    errors.push(`Pasta ${EXECUTION_DIRNAME}/ em falta.`);
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: 0 };
  }

  if (!fs.existsSync(sessionPath)) {
    errors.push(`${EXECUTION_DIRNAME}/${SESSION_FILE} em falta.`);
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: 0 };
  }

  if (!fs.existsSync(diagPath)) {
    errors.push(`${EXECUTION_DIRNAME}/${DIAGNOSTICS_FILE} em falta.`);
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: 0 };
  }

  const subtasksDir = path.join(execDir, "subtasks");
  if (!fs.existsSync(subtasksDir) || !fs.statSync(subtasksDir).isDirectory()) {
    errors.push(`${EXECUTION_SUBTASKS_REL}/ em falta.`);
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: 0 };
  }

  const handoffsDir = path.join(execDir, HANDOFFS_DIRNAME);
  if (!fs.existsSync(handoffsDir) || !fs.statSync(handoffsDir).isDirectory()) {
    errors.push(`${HANDOFFS_REL}/ em falta.`);
  }

  const resultsDir = path.join(execDir, RESULTS_DIRNAME);
  if (!fs.existsSync(resultsDir) || !fs.statSync(resultsDir).isDirectory()) {
    errors.push(`${EXECUTION_RESULTS_REL}/ em falta.`);
  }

  const rollbackDir = path.join(execDir, ROLLBACK_DIRNAME);
  if (!fs.existsSync(rollbackDir) || !fs.statSync(rollbackDir).isDirectory()) {
    errors.push(`execution/${ROLLBACK_DIRNAME}/ em falta.`);
  }
  const rollbackStateFile = rollbackStatePath(execDir);
  if (!fs.existsSync(rollbackStateFile)) {
    errors.push(`execution/${ROLLBACK_DIRNAME}/${ROLLBACK_STATE_FILENAME} em falta.`);
  }

  const session = readJsonObject(sessionPath);
  if (!session) {
    errors.push(`${SESSION_FILE}: JSON inválido.`);
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: 0 };
  }

  const diag = readJsonObject(diagPath);
  if (!diag) {
    errors.push(`${DIAGNOSTICS_FILE}: JSON inválido.`);
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: 0 };
  }

  const execState = String(session.execution_state || "");
  if (!EXECUTION_LIFECYCLE_STATES.has(execState)) {
    errors.push(`execution_state inválido: ${execState || "(vazio)"}.`);
  }

  const loaded = loadHandoffAndOrderForExecution(root);
  if (!loaded.ok) {
    errors.push(
      loaded.error && loaded.error.message ? String(loaded.error.message) : "Handoff inválido.",
    );
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: 0 };
  }

  const expectedCount = loaded.subtaskRels.length;

  const sessionPhase = String(session.phase || "").trim();
  if (!isAcceptedBundlePhase(sessionPhase)) {
    errors.push(
      `execution-session.json: phase inválida '${sessionPhase || "(vazio)"}' (esperado ${MVP_EXECUTION_PHASE} ou legado 4.10).`,
    );
  } else if (isLegacyBundlePhase(sessionPhase)) {
    warnings.push(
      "execution-session.json: bundle na fase 4.10 legada; executar `npm run execute -- --run <id>` para alinhar a 4.11.",
    );
  }

  const sessStatus = String(session.status || "");
  if (!MVP_SESSION_STATUS.has(sessStatus)) {
    errors.push(`execution-session.json: status MVP inválido: ${sessStatus || "(vazio)"}.`);
  }

  const prep = Number(session.prepared_subtasks);
  const hready = Number(session.handoff_ready_subtasks);
  if (!Number.isInteger(prep) || prep !== expectedCount) {
    errors.push("execution-session.json: prepared_subtasks incoerente.");
  }
  if (!Number.isInteger(hready) || hready < 0 || hready > expectedCount) {
    errors.push("execution-session.json: handoff_ready_subtasks inválido.");
  }

  const runSub = Number(session.running_subtasks);
  if (!Number.isInteger(runSub) || runSub !== 0) {
    errors.push("execution-session.json: running_subtasks deve ser 0.");
  }

  const exComp = Number(session.execution_completed_subtasks);
  const exFail = Number(session.execution_failed_subtasks);
  const valSess = Number(session.validated_subtasks);
  const pvfSess = Number(session.patch_validation_failed_subtasks);
  const reviewedSess = Number(session.reviewed_subtasks);
  const approvedSess = Number(session.approved_subtasks);
  const rejectedSess = Number(session.rejected_subtasks);
  const blockedSess = Number(session.blocked_subtasks);
  if (!Number.isInteger(exComp) || exComp < 0 || exComp > expectedCount) {
    errors.push("execution-session.json: execution_completed_subtasks inválido.");
  }
  if (!Number.isInteger(exFail) || exFail < 0 || exFail > expectedCount) {
    errors.push("execution-session.json: execution_failed_subtasks inválido.");
  }
  if (!Number.isInteger(valSess) || valSess < 0 || valSess > expectedCount) {
    errors.push("execution-session.json: validated_subtasks inválido.");
  }
  if (!Number.isInteger(pvfSess) || pvfSess < 0 || pvfSess > expectedCount) {
    errors.push("execution-session.json: patch_validation_failed_subtasks inválido.");
  }
  if (!Number.isInteger(reviewedSess) || reviewedSess < 0 || reviewedSess > expectedCount) {
    errors.push("execution-session.json: reviewed_subtasks inválido.");
  }
  if (!Number.isInteger(approvedSess) || approvedSess < 0 || approvedSess > expectedCount) {
    errors.push("execution-session.json: approved_subtasks inválido.");
  }
  if (!Number.isInteger(rejectedSess) || rejectedSess < 0 || rejectedSess > expectedCount) {
    errors.push("execution-session.json: rejected_subtasks inválido.");
  }
  if (!Number.isInteger(blockedSess) || blockedSess < 0 || blockedSess > expectedCount) {
    errors.push("execution-session.json: blocked_subtasks inválido.");
  }
  if (approvedSess + rejectedSess + blockedSess !== reviewedSess) {
    errors.push("execution-session.json: reviewed_subtasks incoerente com approved/rejected/blocked.");
  }
  const corrAttemptsTot = Number(session.correction_attempts_total);
  const corrCorrected = Number(session.corrected_subtasks);
  const corrFailed = Number(session.correction_failed_subtasks);
  const corrExhausted = Number(session.retry_exhausted_subtasks);
  if (!Number.isInteger(corrAttemptsTot) || corrAttemptsTot < 0) {
    errors.push("execution-session.json: correction_attempts_total inválido.");
  }
  if (!Number.isInteger(corrCorrected) || corrCorrected < 0 || corrCorrected > expectedCount) {
    errors.push("execution-session.json: corrected_subtasks inválido.");
  }
  if (!Number.isInteger(corrFailed) || corrFailed < 0 || corrFailed > expectedCount) {
    errors.push("execution-session.json: correction_failed_subtasks inválido.");
  }
  if (!Number.isInteger(corrExhausted) || corrExhausted < 0 || corrExhausted > expectedCount) {
    errors.push("execution-session.json: retry_exhausted_subtasks inválido.");
  }
  if (typeof session.rollback_enabled !== "boolean") {
    errors.push("execution-session.json: rollback_enabled deve ser boolean.");
  }
  const rbo = Number(session.rollback_operations);
  const rbf = Number(session.rollback_failures);
  const ssc = Number(session.snapshots_created);
  if (!Number.isInteger(rbo) || rbo < 0) {
    errors.push("execution-session.json: rollback_operations inválido.");
  }
  if (!Number.isInteger(rbf) || rbf < 0) {
    errors.push("execution-session.json: rollback_failures inválido.");
  }
  if (!Number.isInteger(ssc) || ssc < 0) {
    errors.push("execution-session.json: snapshots_created inválido.");
  }
  const n = Number(session.subtask_count);
  if (!Number.isInteger(n) || n < 0 || n !== expectedCount) {
    errors.push(
      `subtask_count incoerente (session=${n}, handoff=${expectedCount}).`,
    );
  }

  const total = Number(session.total_subtasks);
  if (!Number.isInteger(total) || total !== expectedCount) {
    errors.push(`total_subtasks incoerente (session=${total}, esperado=${expectedCount}).`);
  }

  const rbDisk = readJsonObject(rollbackStatePath(execDir));
  if (!rbDisk || Number(rbDisk.version) !== 1) {
    errors.push(`execution/${ROLLBACK_DIRNAME}/${ROLLBACK_STATE_FILENAME}: JSON inválido ou version ≠ 1.`);
  } else {
    if (!isAcceptedBundlePhase(String(rbDisk.phase || ""))) {
      errors.push(
        `execution/${ROLLBACK_DIRNAME}/${ROLLBACK_STATE_FILENAME}: phase inválida (esperado ${MVP_EXECUTION_PHASE} ou legado 4.10).`,
      );
    } else if (isLegacyBundlePhase(String(rbDisk.phase || ""))) {
      warnings.push(`execution/${ROLLBACK_DIRNAME}/${ROLLBACK_STATE_FILENAME}: phase 4.10 legada.`);
    }
    if (typeof rbDisk.rollback_enabled !== "boolean") {
      errors.push(`execution/${ROLLBACK_DIRNAME}/${ROLLBACK_STATE_FILENAME}: rollback_enabled deve ser boolean.`);
    }
    if (Number(rbDisk.rollback_operations) !== rbo) {
      errors.push("execution-session.json vs rollback-state.json: rollback_operations incoerente.");
    }
    if (Number(rbDisk.rollback_failures) !== rbf) {
      errors.push("execution-session.json vs rollback-state.json: rollback_failures incoerente.");
    }
    if (Number(rbDisk.snapshots_created) !== ssc) {
      errors.push("execution-session.json vs rollback-state.json: snapshots_created incoerente.");
    }
  }

  const rows = orderedSubtaskRows(loaded.orderDoc);
  if (rows.length !== expectedCount) {
    errors.push("execution-order.json: número de linhas difere do handoff.");
  }

  /** @type {{ subtask_id: string, doc: Record<string, unknown> }[]} */
  const orderedDocs = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const expectedPos = idx + 1;
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (!fn) {
      errors.push(`subtask_id inválido na ordem: ${row.subtask_id}.`);
      continue;
    }
    const fp = path.join(subtasksDir, fn);
    if (!fs.existsSync(fp)) {
      errors.push(`${EXECUTION_SUBTASKS_REL}/${fn} em falta.`);
      continue;
    }
    const doc = readJsonObject(fp);
    if (!doc) {
      errors.push(`${fn}: JSON inválido.`);
      continue;
    }
    if (String(doc.subtask_id || "") !== row.subtask_id) {
      errors.push(`${fn}: subtask_id incoerente.`);
    }
    const pos = Number(doc.position);
    if (!Number.isInteger(pos) || pos !== expectedPos) {
      errors.push(`${fn}: position deve ser ${expectedPos} (ordem linear).`);
    }
    const st = String(doc.status || "");
    const ex = String(doc.execution_state || "");
    if (!SUBTASK_EXECUTION_LIFECYCLE.has(st)) {
      errors.push(`${fn}: status inválido.`);
    }
    if (!SUBTASK_EXECUTION_LIFECYCLE.has(ex)) {
      errors.push(`${fn}: execution_state inválido.`);
    }
    if (st !== ex) {
      errors.push(`${fn}: status e execution_state devem coincidir.`);
    }

    if (doc.lifecycle_updated_at != null && typeof doc.lifecycle_updated_at !== "string") {
      errors.push(`${fn}: lifecycle_updated_at inválido.`);
    }
    if (doc.recovery_state != null && typeof doc.recovery_state !== "string") {
      errors.push(`${fn}: recovery_state inválido.`);
    }

    const ph = String(doc.phase || "");
    if (ph !== "4.5" && ph !== "4.6" && ph !== "4.7" && ph !== "4.8" && ph !== "4.9" && ph !== "4.10" && ph !== "4.11" && ph !== "4.4" && ph !== "4.3") {
      errors.push(`${fn}: phase inválida.`);
    }

    if (doc.rollback_state != null && typeof doc.rollback_state === "string") {
      const rsb = String(doc.rollback_state).trim();
      if (!ROLLBACK_STATE_VALUES.has(rsb)) {
        errors.push(`${fn}: rollback_state inválido.`);
      }
    }

    const expected = {
      subtask_id: row.subtask_id,
      position: expectedPos,
      depends_on: row.depends_on,
    };
    if (!isPreservableSubtaskExecutionDoc(doc, expected)) {
      errors.push(`${fn}: campos desalinhados com execution-order ou contrato.`);
    }

    const hfn = architectHandoffFilename(row.subtask_id);
    if (!hfn) {
      errors.push(`handoff: subtask_id inválido: ${row.subtask_id}.`);
    } else {
      const hfp = path.join(handoffsDir, hfn);
      if (!fs.existsSync(hfp)) {
        errors.push(`${HANDOFFS_REL}/${hfn} em falta.`);
      } else {
        const ho = readJsonObject(hfp);
        const hoValid = isValidArchitectHandoffDoc(ho);
        if (!hoValid) {
          errors.push(`${hfn}: architect-handoff inválido.`);
        } else if (String(/** @type {Record<string, unknown>} */ (ho).subtask_id) !== row.subtask_id) {
          errors.push(`${hfn}: subtask_id incoerente.`);
        } else {
          const hod = /** @type {Record<string, unknown>} */ (ho);
          if (ex === "handoff_ready") {
            if (st !== "handoff_ready") {
              errors.push(`${fn}: handoff_ready esperado.`);
            }
          } else if (ex === "patch_validated") {
            errors.push(`${fn}: estado patch_validated não deve persistir após runtime (re-executar npm run execute).`);
          } else if (ex === "patch_validation_failed") {
            if (st !== "patch_validation_failed") {
              errors.push(`${fn}: patch_validation_failed esperado.`);
            }
            const rfn = executionResultFilename(row.subtask_id);
            const rfp = path.join(resultsDir, rfn || "");
            if (!rfn || !fs.existsSync(rfp)) {
              errors.push(`${EXECUTION_RESULTS_REL}/${rfn || "?"} em falta (patch_validation_failed).`);
            } else {
              const res = readJsonObject(rfp);
              if (!isValidExecutionResultDoc(res)) {
                errors.push(`${rfn}: execution-result inválido.`);
              }
            }
            const pvn = patchValidationFilename(row.subtask_id);
            const pvp = path.join(resultsDir, pvn || "");
            if (!pvn || !fs.existsSync(pvp)) {
              errors.push(`${EXECUTION_RESULTS_REL}/${pvn || "?"} (patch-validation) em falta.`);
            } else {
              const pv = readJsonObject(pvp);
              if (!isValidPatchValidationDoc(pv) || String(/** @type {Record<string, unknown>} */ (pv).validation_state) !== "failed") {
                errors.push(`${pvn}: patch-validation deve estar failed.`);
              }
            }
          } else if (ex === "review_completed") {
            if (st !== "review_completed") {
              errors.push(`${fn}: review_completed esperado.`);
            }
            const vstate = String(doc.validation_state || "");
            if (vstate !== "passed") {
              errors.push(`${fn}: validation_state deve ser 'passed'.`);
            }
            const rs = String(doc.review_state || "");
            if (rs !== "approved") {
              errors.push(`${fn}: review_state deve ser 'approved'.`);
            }
            const rdec = doc.review_decision && typeof doc.review_decision === "object" && !Array.isArray(doc.review_decision)
              ? /** @type {Record<string, unknown>} */ (doc.review_decision)
              : null;
            if (!rdec || String(rdec.result || "") !== "approved") {
              errors.push(`${fn}: review_decision.result deve ser 'approved'.`);
            }
            const rfn = executionResultFilename(row.subtask_id);
            const rfp = path.join(resultsDir, rfn || "");
            if (!rfn || !fs.existsSync(rfp)) {
              errors.push(`${EXECUTION_RESULTS_REL}/${rfn || "?"} em falta.`);
            } else {
              const res = readJsonObject(rfp);
              if (!isValidExecutionResultDoc(res) || String(/** @type {Record<string, unknown>} */ (res).status) !== "completed") {
                errors.push(`${rfn}: execution-result inválido ou não concluído.`);
              } else {
                const ac = Array.isArray(hod.acceptance_criteria) ? hod.acceptance_criteria : [];
                if (!ac.length) {
                  errors.push(`${hfn}: acceptance_criteria deve existir e ser não vazio.`);
                }
                if (typeof /** @type {Record<string, unknown>} */ (res).execution_summary !== "string"
                  || !String(/** @type {Record<string, unknown>} */ (res).execution_summary).trim()) {
                  errors.push(`${rfn}: execution_summary estrutural em falta.`);
                }
                const allowed = Array.isArray(hod.allowed_files) ? hod.allowed_files : [];
                const allowSet = new Set(allowed.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/")));
                const mod = Array.isArray(/** @type {Record<string, unknown>} */ (res).modified_files)
                  ? /** @type {unknown[]} */ (/** @type {Record<string, unknown>} */ (res).modified_files)
                  : [];
                for (const m of mod) {
                  const rel = String(m != null ? m : "").trim().replace(/\\/g, "/");
                  if (!rel) {
                    errors.push(`${rfn}: modified_files inválido.`);
                    break;
                  }
                  if (!allowSet.has(rel)) {
                    errors.push(`${rfn}: modified_files fora de allowed_files.`);
                    break;
                  }
                }
                const val = /** @type {Record<string, unknown>} */ (res).validation;
                if (val && val.allowed_scope_respected === true) {
                  const un = Array.isArray(val.unexpected_files) ? val.unexpected_files : [];
                  if (un.length) {
                    errors.push(`${rfn}: unexpected_files deve estar vazio quando allowed_scope_respected=true.`);
                  }
                }
              }
            }
            const pvn = patchValidationFilename(row.subtask_id);
            const pvp = path.join(resultsDir, pvn || "");
            if (!pvn || !fs.existsSync(pvp)) {
              errors.push(`${EXECUTION_RESULTS_REL}/${pvn || "?"} (patch-validation) em falta.`);
            } else {
              const pv = readJsonObject(pvp);
              if (!isValidPatchValidationDoc(pv)) {
                errors.push(`${pvn}: patch-validation inválido.`);
              } else {
                const pvd = /** @type {Record<string, unknown>} */ (pv);
                if (String(pvd.validation_state) !== "passed") {
                  errors.push(`${pvn}: validation_state incoerente.`);
                }
                if (typeof pvd.validation_summary !== "string" || !String(pvd.validation_summary).trim()) {
                  errors.push(`${pvn}: validation_summary estrutural em falta.`);
                }
                const ch = pvd.checks && typeof pvd.checks === "object" && !Array.isArray(pvd.checks)
                  ? /** @type {Record<string, unknown>} */ (pvd.checks)
                  : null;
                if (
                  !ch ||
                  ch.allowed_scope_respected !== true ||
                  ch.unexpected_files_detected !== false ||
                  ch.wildcard_detected !== false ||
                  ch.empty_paths_detected !== false ||
                  ch.duplicate_paths_detected !== false
                ) {
                  errors.push(`${pvn}: checks incoerentes para validation_state passed.`);
                }
                if (!Array.isArray(pvd.warnings) || !Array.isArray(pvd.errors)) {
                  errors.push(`${pvn}: warnings/errors devem ser arrays.`);
                }
              }
            }
            const rvn = executionReviewFilename(row.subtask_id);
            const rvp = path.join(resultsDir, rvn || "");
            if (!rvn || !fs.existsSync(rvp)) {
              errors.push(`${EXECUTION_RESULTS_REL}/${rvn || "?"} (execution-review) em falta.`);
            } else {
              const rv = readJsonObject(rvp);
              if (!isValidExecutionReviewDoc(rv)) {
                errors.push(`${rvn}: execution-review inválido.`);
              } else {
                const rvd = /** @type {Record<string, unknown>} */ (rv);
                if (String(rvd.status) !== "review_completed" || String(rvd.review_state) !== "approved") {
                  errors.push(`${rvn}: status/review_state incoerente com subtask review_completed.`);
                }
                const dec = rvd.decision && typeof rvd.decision === "object" && !Array.isArray(rvd.decision)
                  ? /** @type {Record<string, unknown>} */ (rvd.decision)
                  : null;
                if (!dec || dec.blocking === true || dec.requires_correction === true || String(dec.result) !== "approved") {
                  errors.push(`${rvn}: decision incoerente para aprovação.`);
                }
                const ck = rvd.checks && typeof rvd.checks === "object" && !Array.isArray(rvd.checks)
                  ? /** @type {Record<string, unknown>} */ (rvd.checks)
                  : null;
                if (
                  !ck ||
                  ck.patch_validation_passed !== true ||
                  ck.allowed_scope_respected !== true ||
                  ck.acceptance_criteria_present !== true ||
                  ck.execution_completed !== true
                ) {
                  errors.push(`${rvn}: checks devem ser todos true para aprovação.`);
                }
              }
            }
          } else if (ex === "review_failed") {
            if (st !== "review_failed") {
              errors.push(`${fn}: review_failed esperado.`);
            }
            const rvn = executionReviewFilename(row.subtask_id);
            const rvp = path.join(resultsDir, rvn || "");
            if (!rvn || !fs.existsSync(rvp)) {
              errors.push(`${EXECUTION_RESULTS_REL}/${rvn || "?"} (execution-review) em falta.`);
            } else {
              const rv = readJsonObject(rvp);
              if (!isValidExecutionReviewDoc(rv)) {
                errors.push(`${rvn}: execution-review inválido.`);
              } else {
                const rvd = /** @type {Record<string, unknown>} */ (rv);
                if (String(rvd.status) !== "review_failed") {
                  errors.push(`${rvn}: status deve ser review_failed.`);
                }
                const rsArt = String(rvd.review_state || "");
                const rsSub = String(doc.review_state || "");
                if (rsArt !== rsSub) {
                  errors.push(`${rvn}: review_state difere do subtask.`);
                }
                const dec = rvd.decision && typeof rvd.decision === "object" && !Array.isArray(rvd.decision)
                  ? /** @type {Record<string, unknown>} */ (rvd.decision)
                  : null;
                const rdec = doc.review_decision && typeof doc.review_decision === "object" && !Array.isArray(doc.review_decision)
                  ? /** @type {Record<string, unknown>} */ (doc.review_decision)
                  : null;
                if (!dec || String(dec.result || "") !== rsArt) {
                  errors.push(`${rvn}: decision.result incoerente com review_state.`);
                }
                if (!rdec || String(rdec.result || "") !== rsArt) {
                  errors.push(`${fn}: review_decision incoerente com review_state.`);
                }
              }
            }
          } else if (ex === "execution_failed") {
            if (st !== "execution_failed") {
              errors.push(`${fn}: execution_failed esperado.`);
            }
            const rfn = executionResultFilename(row.subtask_id);
            const rfp = path.join(resultsDir, rfn || "");
            if (!rfn || !fs.existsSync(rfp)) {
              errors.push(`${EXECUTION_RESULTS_REL}/${rfn || "?"} em falta (failed).`);
            } else {
              const res = readJsonObject(rfp);
              if (!isValidExecutionResultDoc(res) || String(/** @type {Record<string, unknown>} */ (res).status) !== "failed") {
                errors.push(`${rfn}: execution-result inválido ou não falhou.`);
              }
            }
          } else if (ex === "executing" || ex === "execution_completed" || ex === "validating_patch" || ex === "reviewing" || ex === "correcting" || ex === "retrying") {
            errors.push(`${fn}: estado '${ex}' não deve persistir após runtime.`);
          } else if (ex === "pending") {
            if (st !== "pending") {
              errors.push(`${fn}: pending esperado.`);
            }
          } else {
            errors.push(`${fn}: execution_state não suportado no runtime MVP (fase 4.11): ${ex}.`);
          }
        }
      }
    }

    const clfn = correctionLoopFilename(row.subtask_id);
    const clp = path.join(resultsDir, clfn || "");
    if (!clfn || !fs.existsSync(clp)) {
      errors.push(`${EXECUTION_RESULTS_REL}/${clfn || "?"} (correction-loop) em falta.`);
    } else {
      const cl = readJsonObject(clp);
      errors.push(...validateCorrectionLoopAgainstSubtask(cl, row.subtask_id, doc, clfn));
    }

    orderedDocs.push({ subtask_id: row.subtask_id, doc });
  }

  const ents = fs.existsSync(subtasksDir) ? fs.readdirSync(subtasksDir) : [];
  const extra = ents.filter((e) => /^\d{3}-execution\.json$/i.test(e) && !rows.some((r) => subtaskExecutionFilename(r.subtask_id) === e));
  if (extra.length) {
    errors.push(`Ficheiros extra em ${EXECUTION_SUBTASKS_REL}/: ${extra.join(", ")}.`);
  }

  const hoEnts = fs.existsSync(handoffsDir) ? fs.readdirSync(handoffsDir) : [];
  const hoExtra = hoEnts.filter(
    (e) =>
      /^\d{3}-architect-handoff\.json$/i.test(e) &&
      !rows.some((r) => architectHandoffFilename(r.subtask_id) === e),
  );
  if (hoExtra.length) {
    errors.push(`Ficheiros extra em ${HANDOFFS_REL}/: ${hoExtra.join(", ")}.`);
  }
  const hoBad = hoEnts.filter((e) => !/^\d{3}-architect-handoff\.json$/i.test(e));
  if (hoBad.length) {
    errors.push(`${HANDOFFS_REL}/: ficheiros não reconhecidos: ${hoBad.join(", ")}.`);
  }

  const resEnts = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir) : [];
  const resExtra = resEnts.filter((e) => {
    if (/^\d{3}-execution-result\.json$/i.test(e)) {
      return !rows.some((r) => executionResultFilename(r.subtask_id) === e);
    }
    if (/^\d{3}-patch-validation\.json$/i.test(e)) {
      return !rows.some((r) => patchValidationFilename(r.subtask_id) === e);
    }
    if (/^\d{3}-execution-review\.json$/i.test(e)) {
      return !rows.some((r) => executionReviewFilename(r.subtask_id) === e);
    }
    if (/^\d{3}-correction-loop\.json$/i.test(e)) {
      return !rows.some((r) => correctionLoopFilename(r.subtask_id) === e);
    }
    return false;
  });
  if (resExtra.length) {
    errors.push(`Ficheiros extra em ${EXECUTION_RESULTS_REL}/: ${resExtra.join(", ")}.`);
  }
  const resBad = resEnts.filter(
    (e) =>
      !/^\d{3}-execution-result\.json$/i.test(e) &&
      !/^\d{3}-patch-validation\.json$/i.test(e) &&
      !/^\d{3}-execution-review\.json$/i.test(e) &&
      !/^\d{3}-correction-loop\.json$/i.test(e),
  );
  if (resBad.length) {
    errors.push(`${EXECUTION_RESULTS_REL}/: ficheiros não reconhecidos: ${resBad.join(", ")}.`);
  }

  let diskHandoffReady = 0;
  let diskExecCompleted = 0;
  let diskExecFailed = 0;
  let diskValidated = 0;
  let diskPatchValFail = 0;
  let diskReviewed = 0;
  let diskApproved = 0;
  let diskRejected = 0;
  let diskBlocked = 0;
  for (const { doc } of orderedDocs) {
    const ex = String(doc.execution_state || "");
    if (ex === "handoff_ready") diskHandoffReady += 1;
    if (ex === "execution_failed" || ex === "failed") diskExecFailed += 1;
    if (ex === "patch_validated" || ex === "review_completed") diskValidated += 1;
    if (ex === "review_completed" || ex === "review_failed") diskReviewed += 1;
    if (ex === "review_completed") diskApproved += 1;
    if (ex === "review_failed") {
      const rd = doc.review_decision && typeof doc.review_decision === "object" && !Array.isArray(doc.review_decision)
        ? /** @type {Record<string, unknown>} */ (doc.review_decision)
        : null;
      const res = rd ? String(rd.result || "") : "";
      if (res === "rejected") diskRejected += 1;
      if (res === "blocked") diskBlocked += 1;
    }
  }
  for (const row of rows) {
    const pvn = patchValidationFilename(row.subtask_id);
    const pvp = path.join(resultsDir, pvn || "");
    const pv = pvn && fs.existsSync(pvp) ? readJsonObject(pvp) : null;
    if (pv && String(/** @type {Record<string, unknown>} */ (pv).validation_state) === "failed") {
      diskPatchValFail += 1;
    }
  }
  for (const row of rows) {
    const rfn = executionResultFilename(row.subtask_id);
    const rfp = path.join(resultsDir, rfn || "");
    const res = rfn && fs.existsSync(rfp) ? readJsonObject(rfp) : null;
    if (res && String(/** @type {Record<string, unknown>} */ (res).status) === "completed") {
      diskExecCompleted += 1;
    }
  }
  if (diskHandoffReady !== hready) {
    errors.push("execution-session.json: handoff_ready_subtasks incoerente com ficheiros de subtask.");
  }
  if (diskExecCompleted !== exComp) {
    errors.push("execution-session.json: execution_completed_subtasks incoerente com execution-result concluídos.");
  }
  if (diskExecFailed !== exFail) {
    errors.push("execution-session.json: execution_failed_subtasks incoerente com ficheiros de subtask.");
  }
  if (diskValidated !== valSess) {
    errors.push("execution-session.json: validated_subtasks incoerente com ficheiros de subtask.");
  }
  if (diskPatchValFail !== pvfSess) {
    errors.push("execution-session.json: patch_validation_failed_subtasks incoerente com ficheiros de subtask.");
  }
  if (diskReviewed !== reviewedSess) {
    errors.push("execution-session.json: reviewed_subtasks incoerente com ficheiros de subtask.");
  }
  if (diskApproved !== approvedSess) {
    errors.push("execution-session.json: approved_subtasks incoerente com ficheiros de subtask.");
  }
  if (diskRejected !== rejectedSess) {
    errors.push("execution-session.json: rejected_subtasks incoerente com ficheiros de subtask.");
  }
  if (diskBlocked !== blockedSess) {
    errors.push("execution-session.json: blocked_subtasks incoerente com ficheiros de subtask.");
  }

  if (diskExecCompleted > 0 || diskValidated > 0 || diskReviewed > 0) {
    const lc = session.last_completed_subtask;
    if (lc == null || !String(lc).trim() || !/^\d{3}$/.test(String(lc).trim())) {
      errors.push("execution-session.json: last_completed_subtask inválido.");
    }
  }

  const agg = computeSessionAggregatesFromSubtasks(orderedDocs);
  if (Number(session.completed_subtasks) !== agg.completed_subtasks) {
    errors.push("execution-session.json: completed_subtasks incoerente com ficheiros de subtask.");
  }
  if (Number(session.failed_subtasks) !== agg.failed_subtasks) {
    errors.push("execution-session.json: failed_subtasks incoerente com ficheiros de subtask.");
  }
  const cur = session.current_subtask == null ? null : String(session.current_subtask);
  const aggCur = agg.current_subtask == null ? null : String(agg.current_subtask);
  if (cur !== aggCur) {
    errors.push("execution-session.json: current_subtask incoerente com ficheiros de subtask.");
  }
  const ss = session.subtask_states;
  if (!ss || typeof ss !== "object" || Array.isArray(ss)) {
    errors.push("execution-session.json: subtask_states deve ser objeto.");
  } else {
    for (const k of ["pending", "ready", "completed", "failed"]) {
      if (Number(ss[k]) !== agg.subtask_states[k]) {
        errors.push(`execution-session.json: subtask_states.${k} incoerente.`);
      }
    }
  }

  const lifecyclePath = path.join(execDir, LIFECYCLE_FILE);
  if (!fs.existsSync(lifecyclePath)) {
    errors.push(`execution/${LIFECYCLE_FILE} em falta.`);
  } else {
    const lf = readJsonObject(lifecyclePath);
    if (!lf || Number(lf.version) !== 1) {
      errors.push(`${LIFECYCLE_FILE}: JSON inválido ou version ≠ 1.`);
    } else {
      if (!isAcceptedBundlePhase(String(lf.phase || ""))) {
        errors.push(`${LIFECYCLE_FILE}: phase inválida (esperado ${MVP_EXECUTION_PHASE} ou legado 4.10).`);
      } else if (isLegacyBundlePhase(String(lf.phase || ""))) {
        warnings.push(`${LIFECYCLE_FILE}: phase 4.10 legada.`);
      }
      const gls = String(lf.lifecycle_state || "");
      if (!GLOBAL_LIFECYCLE_STATES.has(gls)) {
        errors.push(`${LIFECYCLE_FILE}: lifecycle_state inválido.`);
      }
      const cat = lf.completed_at;
      if (gls === "completed" || gls === "failed") {
        if (cat == null || typeof cat !== "string" || !String(cat).trim()) {
          errors.push(`${LIFECYCLE_FILE}: completed_at obrigatório quando lifecycle_state é terminal.`);
        }
      } else if (cat != null && typeof cat === "string" && String(cat).trim()) {
        errors.push(`${LIFECYCLE_FILE}: completed_at deve ser null enquanto lifecycle não terminal.`);
      }
      const rec = lf.recovery && typeof lf.recovery === "object" && !Array.isArray(lf.recovery)
        ? /** @type {Record<string, unknown>} */ (lf.recovery)
        : null;
      if (!rec) {
        errors.push(`${LIFECYCLE_FILE}: recovery em falta.`);
      } else {
        const rc = Number(rec.resume_count);
        if (!Number.isInteger(rc) || rc < 0) {
          errors.push(`${LIFECYCLE_FILE}: recovery.resume_count inválido.`);
        }
        if (typeof rec.recovered_from_previous_session !== "boolean") {
          errors.push(`${LIFECYCLE_FILE}: recovery.recovered_from_previous_session deve ser boolean.`);
        }
        if (rec.last_resume_at != null && typeof rec.last_resume_at !== "string") {
          errors.push(`${LIFECYCLE_FILE}: recovery.last_resume_at inválido.`);
        }
      }
      const lcp = lf.last_checkpoint && typeof lf.last_checkpoint === "object" && !Array.isArray(lf.last_checkpoint)
        ? /** @type {Record<string, unknown>} */ (lf.last_checkpoint)
        : null;
      if (!lcp) {
        errors.push(`${LIFECYCLE_FILE}: last_checkpoint em falta.`);
      } else {
        const sidc = lcp.subtask_id;
        if (sidc != null && String(sidc).trim() !== "" && !/^\d{3}$/.test(String(sidc).trim())) {
          errors.push(`${LIFECYCLE_FILE}: last_checkpoint.subtask_id inválido.`);
        }
        if (lcp.state != null && typeof lcp.state !== "string") {
          errors.push(`${LIFECYCLE_FILE}: last_checkpoint.state inválido.`);
        }
        if (lcp.timestamp != null && typeof lcp.timestamp !== "string") {
          errors.push(`${LIFECYCLE_FILE}: last_checkpoint.timestamp inválido.`);
        }
      }
      const sessLc = String(session.lifecycle_state || "");
      if (!GLOBAL_LIFECYCLE_STATES.has(sessLc)) {
        errors.push("execution-session.json: lifecycle_state inválido.");
      } else if (sessLc !== gls) {
        errors.push("execution-session.json: lifecycle_state incoerente com execution-lifecycle.json.");
      }
      if (typeof session.interrupted !== "boolean") {
        errors.push("execution-session.json: interrupted deve ser boolean.");
      }
      if (typeof session.resumed !== "boolean") {
        errors.push("execution-session.json: resumed deve ser boolean.");
      }
      const lcs = session.last_checkpoint_subtask;
      if (lcs != null && (typeof lcs !== "string" || !/^\d{3}$/.test(String(lcs).trim()))) {
        errors.push("execution-session.json: last_checkpoint_subtask inválido.");
      }
      const lcpi =
        lcp && lcp.subtask_id != null && /^\d{3}$/.test(String(lcp.subtask_id).trim())
          ? String(lcp.subtask_id).trim()
          : null;
      if (lcpi != null && lcs != null && lcpi !== String(lcs).trim()) {
        errors.push("execution-session.json: last_checkpoint_subtask incoerente com execution-lifecycle.json.");
      }
    }
  }

  if (Number(diag.version) !== 1) {
    errors.push("execution-diagnostics.json: version deve ser 1.");
  }

  if (!Array.isArray(diag.events)) {
    errors.push("execution-diagnostics.json: events deve ser array.");
  }

  const sum = diag.summary && typeof diag.summary === "object" && !Array.isArray(diag.summary)
    ? /** @type {Record<string, unknown>} */ (diag.summary)
    : null;
  if (!sum) {
    errors.push("execution-diagnostics.json: summary em falta.");
    return { errors, warnings: dedupeStrings(warnings), checked_artifacts: 0, checked_subtasks: expectedCount };
  }

  if (Number(sum.total_subtasks) !== expectedCount) {
    errors.push("execution-diagnostics.json: summary.total_subtasks incoerente.");
  }
  if (Number(sum.completed_subtasks) !== agg.completed_subtasks) {
    errors.push("execution-diagnostics.json: summary.completed_subtasks incoerente.");
  }
  if (Number(sum.failed_subtasks) !== agg.failed_subtasks) {
    errors.push("execution-diagnostics.json: summary.failed_subtasks incoerente.");
  }
  const pend = Number(sum.pending_subtasks);
  if (!Number.isInteger(pend) || pend !== (agg.subtask_states.pending || 0)) {
    errors.push("execution-diagnostics.json: summary.pending_subtasks incoerente.");
  }

  if (Number(sum.prepared_subtasks) !== prep) {
    errors.push("execution-diagnostics.json: summary.prepared_subtasks incoerente com session.");
  }
  if (Number(sum.handoff_ready_subtasks) !== hready) {
    errors.push("execution-diagnostics.json: summary.handoff_ready_subtasks incoerente com session.");
  }

  if (Number(sum.running_subtasks) !== runSub) {
    errors.push("execution-diagnostics.json: summary.running_subtasks incoerente com session.");
  }
  if (Number(sum.execution_completed_subtasks) !== exComp) {
    errors.push("execution-diagnostics.json: summary.execution_completed_subtasks incoerente com session.");
  }
  if (Number(sum.execution_failed_subtasks) !== exFail) {
    errors.push("execution-diagnostics.json: summary.execution_failed_subtasks incoerente com session.");
  }
  const modDisk = sumModifiedFilesFromResults(root);
  if (Number(sum.modified_files_total) !== modDisk) {
    errors.push("execution-diagnostics.json: summary.modified_files_total incoerente.");
  }

  let expWarnTot = 0;
  let expErrTot = 0;
  for (const row of rows) {
    const pvn = patchValidationFilename(row.subtask_id);
    const pvp = path.join(resultsDir, pvn || "");
    const pv = pvn && fs.existsSync(pvp) ? readJsonObject(pvp) : null;
    if (pv && Array.isArray(pv.warnings)) expWarnTot += pv.warnings.length;
    if (pv && Array.isArray(pv.errors)) expErrTot += pv.errors.length;
  }
  if (Number(sum.validated_subtasks) !== valSess) {
    errors.push("execution-diagnostics.json: summary.validated_subtasks incoerente com session.");
  }
  if (Number(sum.failed_validations) !== pvfSess) {
    errors.push("execution-diagnostics.json: summary.failed_validations incoerente com session.");
  }
  if (Number(sum.warnings_total) !== expWarnTot) {
    errors.push("execution-diagnostics.json: summary.warnings_total incoerente com patch-validation.json.");
  }
  if (Number(sum.errors_total) !== expErrTot) {
    errors.push("execution-diagnostics.json: summary.errors_total incoerente com patch-validation.json.");
  }

  if (Number(sum.approved_subtasks) !== approvedSess) {
    errors.push("execution-diagnostics.json: summary.approved_subtasks incoerente com session.");
  }
  if (Number(sum.rejected_subtasks) !== rejectedSess) {
    errors.push("execution-diagnostics.json: summary.rejected_subtasks incoerente com session.");
  }
  if (Number(sum.blocked_subtasks) !== blockedSess) {
    errors.push("execution-diagnostics.json: summary.blocked_subtasks incoerente com session.");
  }
  const expReviewFailures = rejectedSess + blockedSess;
  if (Number(sum.review_failures) !== expReviewFailures) {
    errors.push("execution-diagnostics.json: summary.review_failures incoerente com session.");
  }

  if (sum.corrected_subtasks == null || sum.correction_failures == null || sum.retry_exhausted == null || sum.correction_attempts_total == null) {
    errors.push("execution-diagnostics.json: summary correction fields em falta.");
  } else {
    if (Number(sum.corrected_subtasks) !== corrCorrected) {
      errors.push("execution-diagnostics.json: summary.corrected_subtasks incoerente com session.");
    }
    if (Number(sum.correction_failures) !== corrFailed) {
      errors.push("execution-diagnostics.json: summary.correction_failures incoerente com session.");
    }
    if (Number(sum.retry_exhausted) !== corrExhausted) {
      errors.push("execution-diagnostics.json: summary.retry_exhausted incoerente com session.");
    }
    if (Number(sum.correction_attempts_total) !== corrAttemptsTot) {
      errors.push("execution-diagnostics.json: summary.correction_attempts_total incoerente com session.");
    }
  }

  if (
    sum.rollback_operations == null ||
    sum.rollback_failures == null ||
    sum.snapshots_created == null ||
    sum.restored_files_total == null ||
    sum.rollback_enabled == null
  ) {
    errors.push("execution-diagnostics.json: summary rollback fields em falta.");
  } else {
    if (Number(sum.rollback_operations) !== rbo) {
      errors.push("execution-diagnostics.json: summary.rollback_operations incoerente com session.");
    }
    if (Number(sum.rollback_failures) !== rbf) {
      errors.push("execution-diagnostics.json: summary.rollback_failures incoerente com session.");
    }
    if (Number(sum.snapshots_created) !== ssc) {
      errors.push("execution-diagnostics.json: summary.snapshots_created incoerente com session.");
    }
    if (Boolean(sum.rollback_enabled) !== Boolean(session.rollback_enabled)) {
      errors.push("execution-diagnostics.json: summary.rollback_enabled incoerente com session.");
    }
  }

  if (Array.isArray(diag.events)) {
    const ls = summarizeLifecycleFromEvents(
      /** @type {{ type: string, recorded_at?: string, payload?: Record<string, unknown> }[]} */ (diag.events),
    );
    for (const k of ["recovery_count", "interrupted_sessions", "resumed_sessions", "checkpoints_saved"]) {
      if (sum[k] != null && Number(ls[/** @type {"recovery_count"|"interrupted_sessions"|"resumed_sessions"|"checkpoints_saved"} */ (k)]) !== Number(sum[k])) {
        errors.push(`execution-diagnostics.json: summary.${k} incoerente com eventos de lifecycle.`);
      }
    }
  }

  if (!skipObservability) {
    const obsPath = path.join(execDir, OBSERVABILITY_FILE);
    if (!fs.existsSync(obsPath)) {
      errors.push(`execution/${OBSERVABILITY_FILE} em falta.`);
    } else {
      const obs = readJsonObject(obsPath);
      if (!obs || typeof obs !== "object" || Array.isArray(obs)) {
        errors.push(`${OBSERVABILITY_FILE}: JSON inválido.`);
      } else {
        const o = /** @type {Record<string, unknown>} */ (obs);
        if (Number(o.version) !== 1) {
          errors.push(`${OBSERVABILITY_FILE}: version deve ser 1.`);
        }
        if (String(o.phase || "") !== OBS_PHASE) {
          errors.push(`${OBSERVABILITY_FILE}: phase deve ser '${OBS_PHASE}'.`);
        }
        if (String(o.status || "") !== OBS_STATUS) {
          errors.push(`${OBSERVABILITY_FILE}: status deve ser '${OBS_STATUS}'.`);
        }
        if (typeof o.generated_at !== "string" || !String(o.generated_at).trim()) {
          errors.push(`${OBSERVABILITY_FILE}: generated_at inválido.`);
        }
        const rs = o.runtime_summary && typeof o.runtime_summary === "object" && !Array.isArray(o.runtime_summary)
          ? /** @type {Record<string, unknown>} */ (o.runtime_summary)
          : null;
        if (!rs) {
          errors.push(`${OBSERVABILITY_FILE}: runtime_summary em falta.`);
        } else {
          if (String(rs.execution_state || "") !== String(session.execution_state || "")) {
            errors.push(`${OBSERVABILITY_FILE}: runtime_summary.execution_state incoerente com session.`);
          }
          if (Number(rs.total_subtasks) !== expectedCount) {
            errors.push(`${OBSERVABILITY_FILE}: runtime_summary.total_subtasks incoerente.`);
          }
          if (Number(rs.completed_subtasks) !== Number(session.completed_subtasks)) {
            errors.push(`${OBSERVABILITY_FILE}: runtime_summary.completed_subtasks incoerente com session.`);
          }
          if (Number(rs.failed_subtasks) !== Number(session.failed_subtasks)) {
            errors.push(`${OBSERVABILITY_FILE}: runtime_summary.failed_subtasks incoerente com session.`);
          }
          if (Number(rs.corrected_subtasks) !== Number(session.corrected_subtasks)) {
            errors.push(`${OBSERVABILITY_FILE}: runtime_summary.corrected_subtasks incoerente com session.`);
          }
          if (Number(rs.rollback_operations) !== rbo) {
            errors.push(`${OBSERVABILITY_FILE}: runtime_summary.rollback_operations incoerente com session.`);
          }
          const expResume = Number(sum.resumed_sessions != null ? sum.resumed_sessions : 0) || 0;
          if (Number(rs.resume_operations) !== expResume) {
            errors.push(`${OBSERVABILITY_FILE}: runtime_summary.resume_operations incoerente com diagnostics.summary.`);
          }
        }
        if (!Array.isArray(o.timeline)) {
          errors.push(`${OBSERVABILITY_FILE}: timeline deve ser array.`);
        } else {
          let prevTs = "";
          for (let ti = 0; ti < o.timeline.length; ti++) {
            const row = o.timeline[ti];
            if (!row || typeof row !== "object" || Array.isArray(row)) {
              errors.push(`${OBSERVABILITY_FILE}: timeline[${ti}] inválido.`);
              break;
            }
            const tr = /** @type {Record<string, unknown>} */ (row);
            const ts = String(tr.timestamp || "");
            if (!isRoughIsoTimestamp(ts)) {
              errors.push(`${OBSERVABILITY_FILE}: timeline[${ti}].timestamp inválido.`);
            }
            if (prevTs && ts < prevTs) {
              errors.push(`${OBSERVABILITY_FILE}: timeline não está ordenada cronologicamente.`);
              break;
            }
            prevTs = ts;
            if (typeof tr.event !== "string" || !String(tr.event).trim()) {
              errors.push(`${OBSERVABILITY_FILE}: timeline[${ti}].event inválido.`);
            }
            if (tr.subtask_id != null && (typeof tr.subtask_id !== "string" || !/^\d{3}$/.test(String(tr.subtask_id)))) {
              errors.push(`${OBSERVABILITY_FILE}: timeline[${ti}].subtask_id inválido.`);
            }
            if (typeof tr.state !== "string") {
              errors.push(`${OBSERVABILITY_FILE}: timeline[${ti}].state deve ser string.`);
            }
          }
        }
        const od = o.diagnostics && typeof o.diagnostics === "object" && !Array.isArray(o.diagnostics)
          ? /** @type {Record<string, unknown>} */ (o.diagnostics)
          : null;
        if (!od) {
          errors.push(`${OBSERVABILITY_FILE}: diagnostics em falta.`);
        } else {
          if (!Array.isArray(od.warnings) || !Array.isArray(od.errors)) {
            errors.push(`${OBSERVABILITY_FILE}: diagnostics.warnings/errors devem ser arrays.`);
          }
          const evTot = Number(od.events_total);
          const diagEvLen = Array.isArray(diag.events) ? diag.events.length : 0;
          if (!Number.isInteger(evTot) || evTot !== diagEvLen) {
            errors.push(`${OBSERVABILITY_FILE}: diagnostics.events_total incoerente com execution-diagnostics.json.`);
          }
        }
        if (!Array.isArray(o.artifacts)) {
          errors.push(`${OBSERVABILITY_FILE}: artifacts deve ser array.`);
        } else {
          for (const rel of o.artifacts) {
            if (typeof rel !== "string" || !rel.trim()) continue;
            const ap = path.join(root, rel.replace(/\//g, path.sep));
            try {
              if (!fs.existsSync(ap)) {
                /* artefacto opcional ignorado */
              }
            } catch {
              /* ignorar */
            }
          }
        }
        if (!Array.isArray(o.subtasks)) {
          errors.push(`${OBSERVABILITY_FILE}: subtasks deve ser array.`);
        } else if (o.subtasks.length !== expectedCount) {
          errors.push(`${OBSERVABILITY_FILE}: subtasks incoerente com número de subtasks esperado.`);
        }
        if (session.observability_ready !== true) {
          errors.push("execution-session.json: observability_ready deve ser true.");
        }
        const det = Number(session.diagnostics_events_total);
        const tet = Number(session.timeline_events_total);
        const tlLen = Array.isArray(o.timeline) ? o.timeline.length : 0;
        if (!Number.isInteger(det) || det !== (Array.isArray(diag.events) ? diag.events.length : 0)) {
          errors.push("execution-session.json: diagnostics_events_total incoerente com execution-diagnostics.json.");
        }
        if (!Number.isInteger(tet) || tet !== tlLen) {
          errors.push("execution-session.json: timeline_events_total incoerente com execution-observability.json.");
        }
      }
    }
  }

  const completedHo = Array.isArray(diag.events)
    ? diag.events.filter((ev) => ev && typeof ev === "object" && String(/** @type {Record<string, unknown>} */ (ev).type) === "architect_handoff_completed").length
    : 0;
  if (expectedCount > 0 && completedHo === 0) {
    errors.push("execution-diagnostics.json: falta evento architect_handoff_completed.");
  }

  if (Array.isArray(diag.events) && diag.events.length > 0) {
    const sigCount = new Map();
    for (const ev of diag.events) {
      const sig = JSON.stringify(ev);
      sigCount.set(sig, (sigCount.get(sig) || 0) + 1);
    }
    let dup = 0;
    for (const c of sigCount.values()) {
      if (c > 1) dup += c - 1;
    }
    if (dup > 0) {
      warnings.push(`execution-diagnostics.json: ${dup} evento(s) duplicado(s) (mesma carga JSON).`);
    }
  }

  const intr = session.interrupted === true;
  const sessLc = String(session.lifecycle_state || "");
  if (intr && sessLc === "completed") {
    warnings.push("execution-session.json: interrupted=true com lifecycle_state=completed — confirmar recovery.");
  }
  const retryExh = Number(session.retry_exhausted_subtasks) || 0;
  if (retryExh > 0 && intr && sessLc !== "failed" && sessLc !== "interrupted") {
    warnings.push("execution-session.json: retry_exhausted_subtasks>0 com interrupted e lifecycle não terminal/falha.");
  }

  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    if (!fn) continue;
    const fp = path.join(subtasksDir, fn);
    const doc = readJsonObject(fp);
    const ex = doc ? String(doc.execution_state || "") : "";
    if (ex !== "review_completed") continue;
    const rfn = executionResultFilename(row.subtask_id);
    const res = rfn && fs.existsSync(path.join(resultsDir, rfn)) ? readJsonObject(path.join(resultsDir, rfn)) : null;
    const mod = res && Array.isArray(res.modified_files) ? res.modified_files.map((x) => String(x || "").trim().replace(/\\/g, "/")).filter(Boolean) : [];
    const sp = snapshotFilePath(execDir, row.subtask_id);
    const snap = sp && fs.existsSync(sp) ? readJsonObject(sp) : null;
    const tracked = snap && Array.isArray(snap.tracked_files)
      ? new Set(snap.tracked_files.map((x) => String(x || "").trim().replace(/\\/g, "/")))
      : null;
    if (tracked && mod.length) {
      for (const m of mod) {
        if (!tracked.has(m)) {
          warnings.push(`integrity: ${rfn}: modified_files contém '${m}' fora do snapshot tracked_files (subtask ${row.subtask_id}).`);
          break;
        }
      }
    }
  }

  for (const row of rows) {
    const clfn = correctionLoopFilename(row.subtask_id);
    const clp = path.join(resultsDir, clfn || "");
    const rvn = executionReviewFilename(row.subtask_id);
    const rvp = path.join(resultsDir, rvn || "");
    if (!clfn || !rvn || !fs.existsSync(clp) || !fs.existsSync(rvp)) continue;
    const cl = readJsonObject(clp);
    const rv = readJsonObject(rvp);
    if (!cl || !rv) continue;
    const rvSt = String(/** @type {Record<string, unknown>} */ (rv).status || "");
    const clSt = String(/** @type {Record<string, unknown>} */ (cl).status || "");
    if (rvSt === "review_failed" && clSt === "correction_completed") {
      warnings.push(`integrity: ${rvn} review_failed mas ${clfn} correction_completed (verificar sequência).`);
    }
  }

  let checked_artifacts = 0;
  const artifactPaths = [
    sessionPath,
    diagPath,
    path.join(execDir, LIFECYCLE_FILE),
    rollbackStateFile,
  ];
  for (const ap of artifactPaths) {
    if (fs.existsSync(ap)) checked_artifacts += 1;
  }
  if (!skipObservability) {
    const op = path.join(execDir, OBSERVABILITY_FILE);
    if (fs.existsSync(op)) checked_artifacts += 1;
  }
  checked_artifacts += rows.length * 5;

  return {
    errors,
    warnings: dedupeStrings(warnings),
    checked_artifacts,
    checked_subtasks: expectedCount,
  };
}

/**
 * @param {string} outputDirAbs
 * @param {{ skipObservability?: boolean }} [opts]
 * @returns {string[]}
 */
function validateExecutionRuntime(outputDirAbs, opts) {
  return validateExecutionRuntimeDetailed(outputDirAbs, opts).errors;
}

/**
 * @param {string} outputDirAbs
 * @param {{ skipObservability?: boolean }} [opts]
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateExecutionRuntimeResult(outputDirAbs, opts) {
  const d = validateExecutionRuntimeDetailed(outputDirAbs, opts);
  return { ok: d.errors.length === 0, errors: d.errors, warnings: d.warnings };
}

module.exports = {
  EXECUTION_DIRNAME,
  SESSION_FILE,
  DIAGNOSTICS_FILE,
  EXECUTION_LIFECYCLE_STATES,
  MVP_EXECUTION_PHASE,
  validateExecutionRuntime,
  validateExecutionRuntimeDetailed,
  validateExecutionRuntimeResult,
};
