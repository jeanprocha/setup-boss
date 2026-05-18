"use strict";

const fs = require("fs");
const path = require("path");

const { readJsonObject } = require("./build-execution-session");
const { subtaskExecutionFilename, orderedSubtaskRows } = require("./build-subtask-execution-state");
const { pathHasWildcard } = require("./build-architect-handoff");
const {
  executionResultFilename,
  isValidExecutionResultDoc,
  EXECUTION_RESULTS_REL,
} = require("./run-subtask-executor");

const PATCH_PHASE = "4.5";

/**
 * @param {string} subtaskId
 */
function patchValidationFilename(subtaskId) {
  const id = String(subtaskId || "").trim();
  return /^\d{3}$/.test(id) ? `${id}-patch-validation.json` : "";
}

/**
 * @param {string} rel
 * @returns {string|null} erro ou null
 */
function validatePathShape(rel) {
  const t = String(rel || "").trim().replace(/\\/g, "/");
  if (!t) return "PATH_EMPTY";
  if (pathHasWildcard(t)) return "PATH_WILDCARD";
  if (t.includes("/../") || t.startsWith("../") || t.endsWith("/..") || t === "..") {
    return "PATH_TRAVERSAL";
  }
  const parts = t.split("/");
  if (parts.some((p) => p === "..")) return "PATH_TRAVERSAL";
  if (path.isAbsolute(t) || /^[a-zA-Z]:\//.test(t)) return "PATH_ABSOLUTE";
  return null;
}

/**
 * @param {unknown[]} arr
 * @returns {boolean}
 */
function arrayHasDuplicatePaths(arr) {
  if (!Array.isArray(arr)) return false;
  const trimmed = arr.map((x) => String(x != null ? x : "").trim()).filter(Boolean);
  return new Set(trimmed).size !== trimmed.length;
}

/**
 * @param {unknown[]} arr
 * @param {string} label
 * @returns {{ ok: boolean, normalized: string[], errors: string[], warnings: string[] }}
 */
function normalizePathArray(arr, label) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  if (!Array.isArray(arr)) {
    return { ok: false, normalized: [], errors: [`${label}: não é array.`], warnings };
  }
  /** @type {string[]} */
  const normalized = [];
  for (const x of arr) {
    const raw = String(x != null ? x : "").trim().replace(/\\/g, "/");
    if (!raw.trim()) {
      continue;
    }
    const err = validatePathShape(raw);
    if (err) {
      errors.push(`${label}: ${err} (${JSON.stringify(x)})`);
      continue;
    }
    normalized.push(raw);
  }
  return { ok: errors.length === 0, normalized, errors, warnings };
}

/**
 * @param {{
 *   executionResult: Record<string, unknown>,
 * }} p
 * @returns {{
 *   ok: boolean,
 *   checks: Record<string, boolean>,
 *   errors: string[],
 *   warnings: string[],
 *   modified: string[],
 *   allowed: string[],
 * }}
 */
function evaluatePatchAgainstRules(p) {
  const res = p.executionResult;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  const modRaw = Array.isArray(res.modified_files) ? res.modified_files : [];
  const allowRaw = Array.isArray(res.allowed_files) ? res.allowed_files : [];

  const modN = normalizePathArray(modRaw, "modified_files");
  const allowN = normalizePathArray(allowRaw, "allowed_files");
  errors.push(...modN.errors, ...allowN.errors);
  warnings.push(...modN.warnings, ...allowN.warnings);

  const allowSet = new Set(allowN.normalized);
  /** @type {string[]} */
  const outside = [];
  for (const m of modN.normalized) {
    if (!allowSet.has(m)) outside.push(m);
  }

  const unexpected_files_detected = outside.length > 0;
  const wildcard_detected =
    modRaw.some((x) => pathHasWildcard(String(x != null ? x : ""))) ||
    allowRaw.some((x) => pathHasWildcard(String(x != null ? x : "")));
  const empty_paths_detected =
    modRaw.some((x) => !String(x != null ? x : "").trim()) || allowRaw.some((x) => !String(x != null ? x : "").trim());
  const duplicate_paths_detected = arrayHasDuplicatePaths(modRaw) || arrayHasDuplicatePaths(allowRaw);

  const allowed_scope_respected = !unexpected_files_detected;

  if (unexpected_files_detected) {
    errors.push(`modified_files fora de allowed_files: ${outside.join(", ")}`);
  }
  if (wildcard_detected) {
    errors.push("wildcard detetado em paths.");
  }
  if (empty_paths_detected) {
    errors.push("path vazio detetado.");
  }
  if (duplicate_paths_detected) {
    errors.push("paths duplicados detetados.");
  }

  const checks = {
    allowed_scope_respected,
    unexpected_files_detected,
    wildcard_detected,
    empty_paths_detected,
    duplicate_paths_detected,
  };

  const ok =
    errors.length === 0 &&
    modN.ok &&
    allowN.ok &&
    allowed_scope_respected &&
    !wildcard_detected &&
    !empty_paths_detected &&
    !duplicate_paths_detected;

  return {
    ok,
    checks,
    errors,
    warnings,
    modified: modN.normalized,
    allowed: allowN.normalized,
  };
}

/**
 * @param {Record<string, unknown>|null} doc
 * @returns {boolean}
 */
function isValidPatchValidationDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) return false;
  if (String(d.phase || "") !== PATCH_PHASE) return false;
  if (!/^\d{3}$/.test(String(d.subtask_id || "").trim())) return false;
  const vs = String(d.validation_state || "");
  if (vs !== "passed" && vs !== "failed") return false;
  const st = String(d.status || "");
  if (vs === "passed" && st !== "validated") return false;
  if (vs === "failed" && st !== "validation_failed") return false;
  if (!Array.isArray(d.allowed_files)) return false;
  if (!Array.isArray(d.modified_files)) return false;
  if (typeof d.validation_summary !== "string") return false;
  const ch = d.checks;
  if (!ch || typeof ch !== "object" || Array.isArray(ch)) return false;
  const c = /** @type {Record<string, unknown>} */ (ch);
  const keys = [
    "allowed_scope_respected",
    "unexpected_files_detected",
    "wildcard_detected",
    "empty_paths_detected",
    "duplicate_paths_detected",
  ];
  for (const k of keys) {
    if (typeof c[k] !== "boolean") return false;
  }
  if (!Array.isArray(d.warnings)) return false;
  if (!Array.isArray(d.errors)) return false;
  return true;
}

/**
 * @param {string} execDir
 * @param {string} subtaskId
 * @param {Record<string, unknown>} patch
 */
function mergeSubtaskValidationFields(execDir, subtaskId, patch) {
  const fn = subtaskExecutionFilename(subtaskId);
  const fp = path.join(execDir, "subtasks", fn);
  const doc = readJsonObject(fp);
  if (!doc) return;
  const d = /** @type {Record<string, unknown>} */ (doc);
  Object.assign(d, patch);
  fs.writeFileSync(fp, JSON.stringify(d, null, 2), "utf-8");
}

/**
 * @param {string} ex
 * @param {string} st
 * @param {boolean} force
 */
function shouldRunPatchValidation(ex, st, force) {
  if (ex === "execution_failed" || ex === "failed" || st === "execution_failed" || st === "failed") {
    return false;
  }
  if (ex === "patch_validated" && !force) return false;
  if (ex === "patch_validation_failed" && !force) return false;
  if (ex === "execution_completed" && st === "execution_completed") return true;
  if (ex === "validating_patch" && st === "validating_patch") return true;
  if (force && (ex === "patch_validated" || ex === "patch_validation_failed")) return true;
  return false;
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
 * @returns {{ artifacts: string[], validated_delta: number, failed_delta: number, warnings_total: number, errors_total: number }}
 */
function runPatchValidationPhase(p) {
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
  let validated_delta = 0;
  let failed_delta = 0;
  let warnings_total = 0;
  let errors_total = 0;

  for (const row of rows) {
    const sid = row.subtask_id;
    const stPath = path.join(execDir, "subtasks", subtaskExecutionFilename(sid));
    const subDoc = readJsonObject(stPath);
    if (!subDoc) continue;
    const ex = String(subDoc.execution_state || "");
    const st = String(subDoc.status || "");

    if (!shouldRunPatchValidation(ex, st, force)) {
      continue;
    }

    const resFn = executionResultFilename(sid);
    const resPath = path.join(resultsDir, resFn || "");
    const execRes = resFn && fs.existsSync(resPath) ? readJsonObject(resPath) : null;
    const validExec = isValidExecutionResultDoc(execRes) && String(execRes.status) === "completed";

    const pvFn = patchValidationFilename(sid);
    const pvPath = path.join(resultsDir, pvFn || "");

    const t0 = iso();
    mergeSubtaskValidationFields(execDir, sid, {
      status: "validating_patch",
      execution_state: "validating_patch",
      phase: PATCH_PHASE,
      updated_at: t0,
    });

    events.push({
      type: "patch_validation_started",
      recorded_at: iso(),
      payload: {
        subtask_id: sid,
        validation_state: "running",
        warnings_count: 0,
        errors_count: 0,
      },
    });

    /** @type {string[]} */
    let evalErrors = [];
    /** @type {string[]} */
    let evalWarnings = [];
    /** @type {Record<string, boolean>} */
    let checks = {
      allowed_scope_respected: true,
      unexpected_files_detected: false,
      wildcard_detected: false,
      empty_paths_detected: false,
      duplicate_paths_detected: false,
    };
    let ok = true;

    try {
      if (validExec && execRes) {
        const ev = evaluatePatchAgainstRules({ executionResult: /** @type {Record<string, unknown>} */ (execRes) });
        evalErrors = ev.errors;
        evalWarnings = ev.warnings;
        checks = /** @type {Record<string, boolean>} */ ({
          allowed_scope_respected: ev.checks.allowed_scope_respected,
          unexpected_files_detected: ev.checks.unexpected_files_detected,
          wildcard_detected: ev.checks.wildcard_detected,
          empty_paths_detected: ev.checks.empty_paths_detected,
          duplicate_paths_detected: ev.checks.duplicate_paths_detected,
        });
        ok = ev.ok;
      } else {
        ok = false;
        evalErrors.push("execution-result.json inválido ou execução não concluída com sucesso.");
        checks = {
          allowed_scope_respected: false,
          unexpected_files_detected: true,
          wildcard_detected: false,
          empty_paths_detected: false,
          duplicate_paths_detected: false,
        };
      }
    } catch (e) {
      ok = false;
      evalErrors.push(e instanceof Error ? e.message : String(e));
    }

    warnings_total += evalWarnings.length;
    errors_total += evalErrors.length;

    const validatedAt = iso();
    const pvf = patchValidationFilename(sid);
    const relArt = `${EXECUTION_RESULTS_REL}/${pvf}`.replace(/\\/g, "/");

    const resDoc = /** @type {Record<string, unknown>} */ (validExec && execRes ? execRes : {});

    if (ok) {
      const summary = `Patch validado: ${(resDoc.modified_files && Array.isArray(resDoc.modified_files) ? resDoc.modified_files.length : 0) || 0} ficheiro(s) modificado(s).`;
      const doc = {
        version: 1,
        phase: PATCH_PHASE,
        subtask_id: sid,
        status: "validated",
        validation_state: "passed",
        validated_at: validatedAt,
        allowed_files: Array.isArray(resDoc.allowed_files)
          ? resDoc.allowed_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
          : [],
        modified_files: Array.isArray(resDoc.modified_files)
          ? resDoc.modified_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
          : [],
        validation_summary: summary,
        checks,
        warnings: evalWarnings,
        errors: evalErrors,
      };
      fs.writeFileSync(pvPath, JSON.stringify(doc, null, 2), "utf-8");
      artifacts.push(relArt);

      mergeSubtaskValidationFields(execDir, sid, {
        status: "patch_validated",
        execution_state: "patch_validated",
        phase: PATCH_PHASE,
        updated_at: validatedAt,
        validation_state: "passed",
        validation_completed_at: validatedAt,
      });

      validated_delta += 1;

      events.push({
        type: "patch_validation_completed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          validation_state: "passed",
          warnings_count: evalWarnings.length,
          errors_count: evalErrors.length,
        },
      });

      if (p.lifecycleCtx && p.lifecycleCtx.loaded) {
        const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
        saveExecutionCheckpoint({
          execDir,
          outputDirAbs: outputDirAbsForCk,
          loaded: p.lifecycleCtx.loaded,
          subtaskId: sid,
          lifecycleState: "running",
          recoveryState: "post_patch_validation",
          events,
          iso,
        });
      }
    } else {
      const summary = `Validação do patch falhou: ${evalErrors.join("; ") || "erro desconhecido"}.`;
      const doc = {
        version: 1,
        phase: PATCH_PHASE,
        subtask_id: sid,
        status: "validation_failed",
        validation_state: "failed",
        validated_at: validatedAt,
        allowed_files: Array.isArray(resDoc.allowed_files)
          ? resDoc.allowed_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
          : [],
        modified_files: Array.isArray(resDoc.modified_files)
          ? resDoc.modified_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
          : [],
        validation_summary: summary,
        checks,
        warnings: evalWarnings,
        errors: evalErrors,
      };
      fs.writeFileSync(pvPath, JSON.stringify(doc, null, 2), "utf-8");
      artifacts.push(relArt);

      mergeSubtaskValidationFields(execDir, sid, {
        status: "patch_validation_failed",
        execution_state: "patch_validation_failed",
        phase: PATCH_PHASE,
        updated_at: validatedAt,
        validation_state: "failed",
        validation_completed_at: validatedAt,
      });

      failed_delta += 1;

      events.push({
        type: "patch_validation_failed",
        recorded_at: iso(),
        payload: {
          subtask_id: sid,
          validation_state: "failed",
          warnings_count: evalWarnings.length,
          errors_count: evalErrors.length,
        },
      });

      if (p.lifecycleCtx && p.lifecycleCtx.loaded) {
        const { saveExecutionCheckpoint } = require("./manage-execution-lifecycle");
        saveExecutionCheckpoint({
          execDir,
          outputDirAbs: outputDirAbsForCk,
          loaded: p.lifecycleCtx.loaded,
          subtaskId: sid,
          lifecycleState: "running",
          recoveryState: "post_patch_validation_failed",
          events,
          iso,
        });
      }

      const { tryAutoRollbackAfterFailure } = require("./manage-execution-rollback");
      const { architectHandoffFilename } = require("./build-architect-handoff");
      const hfnRb = architectHandoffFilename(sid);
      const hoRb = hfnRb ? readJsonObject(path.join(execDir, "handoffs", hfnRb)) : null;
      const allowedRb =
        hoRb && Array.isArray(hoRb.allowed_files)
          ? hoRb.allowed_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
          : [];
      const modifiedRb =
        validExec && execRes && Array.isArray(execRes.modified_files)
          ? execRes.modified_files.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"))
          : [];
      tryAutoRollbackAfterFailure({
        outputDirAbs: outputDirAbsForCk,
        execDir,
        subtaskId: sid,
        trigger: "patch_validation_failed",
        modified_files: modifiedRb,
        allowed_files: allowedRb,
        events,
        iso,
      });
    }
  }

  return { artifacts, validated_delta, failed_delta, warnings_total, errors_total };
}

module.exports = {
  PATCH_PHASE,
  PATCH_RESULTS_REL: EXECUTION_RESULTS_REL,
  patchValidationFilename,
  validatePathShape,
  normalizePathArray,
  evaluatePatchAgainstRules,
  isValidPatchValidationDoc,
  runPatchValidationPhase,
  shouldRunPatchValidation,
  arrayHasDuplicatePaths,
};
