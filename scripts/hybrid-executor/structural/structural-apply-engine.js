"use strict";

const fs = require("fs");
const path = require("path");
const { applyPatchToContent } = require("../../patch-content");
const { isControlledStructuralApplyActive } = require("../feature-flags");
const { postValidateStructuralResult } = require("./structural-post-validate");
const { createStructuralRollbackBuffer } = require("./structural-rollback-buffer");

function safeWriteJson(outputDir, name, data, outputFs) {
  const fp = path.join(outputDir, name);

  try {
    if (outputFs && typeof outputFs.writeJson === "function") outputFs.writeJson(fp, data);
    else fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

function classifyCorruption(reasons) {
  /** @type {string[]} */
  const cats = [];
  const list = Array.isArray(reasons) ? reasons : [];

  for (const r of list) {
    const s = String(r);
    if (s.includes("ast_reparse_failed")) cats.push("ast_reparse");
    else if (s.includes("ast_invalid")) cats.push("ast_shape");
    else if (s.includes("formatter_drift")) cats.push("formatter_drift");
    else if (s.includes("post_validate")) cats.push("post_validate_other");
    else if (s.length) cats.push("other");
  }

  return [...new Set(cats)];
}

function aggregateCorruptionMetrics(steps) {
  /** @type {Record<string, number>} */
  const m = {
    ast_reparse: 0,
    ast_shape: 0,
    formatter_drift: 0,
    other: 0,
  };

  for (const s of steps) {
    if (s && s.accepted_structural) continue;
    const cats = classifyCorruption(s.validate?.reasons);
    for (const c of cats) {
      if (c === "ast_reparse") m.ast_reparse += 1;
      else if (c === "ast_shape") m.ast_shape += 1;
      else if (c === "formatter_drift") m.formatter_drift += 1;
      else m.other += 1;
    }
  }

  return m;
}

function buildTransitionsFromSteps(steps) {
  return steps.map((s) => ({
    apply_sequence: s.apply_sequence ?? null,
    patch_index: s.patch_index,
    path: s.path,
    sequence_same_file: s.sequence_same_file ?? 0,
    fallback_transition: s.fallback_transition || "unknown",
    final_mode: s.final_mode,
  }));
}

function createStructuralApplySession() {
  return {
    rollbackBuffer: createStructuralRollbackBuffer(),
    /** @type {object[]} */
    steps: [],
    startedAt: new Date().toISOString(),
  };
}

/**
 * Apply estrutural controlado (Fase 4.9.5): reparse + validação + drift; falha → fallback textual.
 * @param {{
 *   before: string,
 *   structuralAfter: string,
 *   change: { search: string, replace: string },
 *   planEntry: object|null,
 *   relativePath: string,
 *   patchIndex: number,
 *   sequenceSameFile?: number,
 *   session: { rollbackBuffer: object, steps: object[] }|null,
 *   postValidateStructuralResult?: typeof postValidateStructuralResult,
 * }} ctx
 */
function runControlledStructuralApply(ctx) {
  const textualAfter = applyPatchToContent(
    ctx.before,
    ctx.change.search,
    ctx.change.replace,
  );

  if (!isControlledStructuralApplyActive()) {
    return {
      accepted: true,
      after: ctx.structuralAfter,
      final_mode: "structural",
      controlled_apply_layer: "skipped_flag_off",
      validate: null,
    };
  }

  const validateFn =
    typeof ctx.postValidateStructuralResult === "function"
      ? ctx.postValidateStructuralResult
      : postValidateStructuralResult;

  const attemptRef = ctx.session?.rollbackBuffer?.recordAttempt({
    path: ctx.relativePath,
    patch_index: ctx.patchIndex,
    sequence_same_file: ctx.sequenceSameFile ?? 0,
    before_length: String(ctx.before).length,
  });

  const validate = validateFn({
    before: ctx.before,
    after: ctx.structuralAfter,
    planEntry: ctx.planEntry,
    relativePath: ctx.relativePath,
  });

  const seqFile = ctx.sequenceSameFile ?? 0;
  const applySeq = attemptRef?.apply_sequence ?? null;

  const step = {
    patch_index: ctx.patchIndex,
    path: ctx.relativePath,
    apply_sequence: applySeq,
    sequence_same_file: seqFile,
    controlled_apply_active: true,
    validate,
    accepted_structural: !!validate.ok,
    final_mode: validate.ok ? "structural" : "textual",
    fallback_transition: validate.ok
      ? "structural_committed_after_post_validate"
      : "structural_to_textual_post_validate",
    corruption_categories: validate.ok ? [] : classifyCorruption(validate.reasons),
  };

  if (!validate.ok) {
    ctx.session?.rollbackBuffer?.recordRollback({
      path: ctx.relativePath,
      patch_index: ctx.patchIndex,
      reasons: validate.reasons || [],
      final_mode: "textual",
      apply_sequence: applySeq,
      fallback_transition: "structural_to_textual_post_validate",
    });
    ctx.session?.steps.push(step);

    return {
      accepted: false,
      after: textualAfter,
      final_mode: "textual",
      controlled_apply_layer: "rejected_validation",
      validate,
      fallback_reason_codes: validate.reasons || ["post_structural_validate_failed"],
      fallback_trigger: "post_structural_validate",
    };
  }

  ctx.session?.steps.push(step);

  return {
    accepted: true,
    after: ctx.structuralAfter,
    final_mode: "structural",
    controlled_apply_layer: "committed_after_validation",
    validate,
  };
}

/**
 * @param {{
 *   outputDir: string,
 *   outputFs?: { writeJson?: Function }|null,
 *   session: { steps: object[], rollbackBuffer: object, startedAt?: string }|null,
 *   finishedAt: string,
 *   durationMs: number,
 * }} o
 */
function writeStructuralApplyArtifacts(o) {
  const session = o.session;

  if (!session) return;

  const steps = session.steps;
  /** @type {Record<string, number[]>} */
  const patchIndicesByPath = {};

  for (const s of steps) {
    if (!s.path) continue;
    if (!patchIndicesByPath[s.path]) patchIndicesByPath[s.path] = [];
    patchIndicesByPath[s.path].push(s.patch_index);
  }

  const applyPayload = {
    schema_version: 2,
    phase: "4.9.5.1",
    controlled_apply_reported: true,
    started_at: session.startedAt || "",
    finished_at: o.finishedAt,
    duration_ms: o.durationMs,
    summary: {
      steps: steps.length,
      structural_committed: steps.filter((s) => s.accepted_structural).length,
      textual_after_reject: steps.filter((s) => !s.accepted_structural).length,
      corruption_metrics: aggregateCorruptionMetrics(steps),
    },
    diagnostics: {
      apply_ordering: steps.map((s) => ({
        apply_sequence: s.apply_sequence,
        patch_index: s.patch_index,
        path: s.path,
        sequence_same_file: s.sequence_same_file,
      })),
      patch_indices_by_path: patchIndicesByPath,
      fallback_transitions: buildTransitionsFromSteps(steps),
    },
    per_step: steps.map((s) => ({
      apply_sequence: s.apply_sequence,
      patch_index: s.patch_index,
      path: s.path,
      sequence_same_file: s.sequence_same_file,
      accepted_structural: s.accepted_structural,
      final_mode: s.final_mode,
      fallback_transition: s.fallback_transition,
      corruption_categories: s.corruption_categories || [],
      validate_ok: !!(s.validate && s.validate.ok),
      validate_reasons: s.validate?.reasons || [],
    })),
  };

  const postValidatePayload = {
    schema_version: 2,
    phase: "4.9.5.1",
    generated_at: o.finishedAt,
    summary: {
      rejected_steps: steps.filter((s) => !s.accepted_structural).length,
      corruption_metrics: aggregateCorruptionMetrics(steps),
    },
    entries: steps.map((s) => ({
      apply_sequence: s.apply_sequence,
      patch_index: s.patch_index,
      path: s.path,
      sequence_same_file: s.sequence_same_file,
      ok: !!(s.validate && s.validate.ok),
      reasons: s.validate?.reasons || [],
      parse_error: s.validate?.parse_error || null,
      ast_ok: s.validate?.ast_ok,
      corruption_categories: s.corruption_categories || [],
      fallback_transition: s.fallback_transition,
    })),
  };

  const rollbackPayload = session.rollbackBuffer
    ? session.rollbackBuffer.buildReport()
    : { schema_version: 2, phase: "4.9.5.1", rollbacks: [], attempts: [], sequencing: { apply_order: [] } };

  safeWriteJson(o.outputDir, "structural-apply-results.json", applyPayload, o.outputFs || null);
  safeWriteJson(o.outputDir, "structural-post-validate.json", postValidatePayload, o.outputFs || null);
  safeWriteJson(o.outputDir, "structural-rollback-report.json", rollbackPayload, o.outputFs || null);
}

module.exports = {
  createStructuralApplySession,
  runControlledStructuralApply,
  writeStructuralApplyArtifacts,
  classifyCorruption,
  aggregateCorruptionMetrics,
};
