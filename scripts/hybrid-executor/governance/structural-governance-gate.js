"use strict";

const fs = require("fs");
const path = require("path");

const { applyPatchToContent } = require("../../patch-content");
const { isStructuralGovernanceEnabled, getStructuralGovernanceLowConfidenceMode } = require("../feature-flags");
const { STRUCTURAL_BLOCKER_CODES } = require("./structural-blocker-codes");
const { assessStructuralRisk, aggregateStructuralRunRisk } = require("./structural-risk-assessor");

function safeWriteJson(outputDir, name, data, outputFs) {
  const fp = path.join(outputDir, name);

  try {
    if (outputFs && typeof outputFs.writeJson === "function") outputFs.writeJson(fp, data);
    else fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

/**
 * Replace textual agressivo: search não vazio e substituição vazia (ou só espaços).
 */
function isDeleteLikePatch(change) {
  if (!change || typeof change !== "object") return false;
  const s = String(change.search ?? "");
  const r = String(change.replace ?? "").trim();

  return s.length > 0 && r.length === 0;
}

/**
 * Superfície import/export (MVP): alterações em ImportDeclaration com remoção de texto.
 */
function isExportOrImportStructuralSurface(planEntry) {
  const k = String(planEntry?.node_kind ?? "");

  return k === "ImportDeclaration" || k === "ExportNamedDeclaration" || k === "ExportDefaultDeclaration";
}

/**
 * Heurística MVP: remoção no interior do span do nó escolhido.
 */
function isNodeSpanDeletion(planEntry, change) {
  const ns = planEntry?.node_span;

  if (
    !ns ||
    typeof ns.start !== "number" ||
    typeof ns.end !== "number" ||
    ns.end <= ns.start ||
    !change
  ) {
    return false;
  }

  const inner = String(change._before_for_governance ?? "");
  if (!inner) return false;

  const slice = inner.slice(ns.start, ns.end);

  try {
    const afterInner = applyPatchToContent(slice, change.search, change.replace);

    return String(afterInner ?? "").trim().length === 0 && String(slice).trim().length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * Pré-apply: escalar para textual sem tentar structural.
 * @param {object|null} planEntry
 * @param {object} change
 * @param {string} before
 */
function evaluateGovernanceStructuralPreemption(planEntry, change, before) {
  if (!isStructuralGovernanceEnabled() || !planEntry || planEntry.op !== "replace_node") {
    return { forceTextual: false, codes: [], reasons: [] };
  }

  const ch = { ...change, _before_for_governance: before };
  /** @type {string[]} */
  const codes = [];
  /** @type {string[]} */
  const reasons = [];

  if (isDeleteLikePatch(change)) {
    codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE);
    reasons.push("delete_like_replace_empty");
  }

  if (isExportOrImportStructuralSurface(planEntry) && isDeleteLikePatch(change)) {
    if (!codes.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE)) {
      codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE);
    }
    reasons.push("import_export_surface_delete_like");
  }

  if (isNodeSpanDeletion(planEntry, ch)) {
    if (!codes.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE)) {
      codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE);
    }
    reasons.push("mvp_span_would_empty");
  }

  return {
    forceTextual: codes.length > 0,
    codes,
    reasons,
  };
}

function reasonsImplyFormatterDrift(reasons) {
  const r = Array.isArray(reasons) ? reasons : [];

  return r.some((x) => String(x).includes("formatter_drift"));
}

function reasonsImplyAstCorrupt(reasons) {
  const r = Array.isArray(reasons) ? reasons : [];

  return r.some((x) => {
    const s = String(x);

    return s.includes("ast_invalid") || s.includes("ast_reparse_failed") || s.includes("ast_reparse");
  });
}

/**
 * Extrai blockers MVP a partir de uma linha de telemetria híbrida (4.9.4+).
 * @param {object} row
 * @param {{ run_distinct_files?: number, min_score_required?: number }} runCtx
 */
function extractStructuralBlockersFromHybridRow(row, runCtx) {
  /** @type {string[]} */
  const codes = [];
  const distinct =
    typeof runCtx?.run_distinct_files === "number" ? runCtx.run_distinct_files : 0;

  if (distinct >= 2) {
    codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_MULTI_FILE_CASCADE);
  }

  const gate = row?.gate_snapshot;
  const br = Array.isArray(gate?.block_reasons) ? gate.block_reasons : [];

  if (br.includes("confidence_below_threshold")) {
    codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_LOW_CONFIDENCE);
  }

  const score = typeof gate?.confidence_score === "number" ? gate.confidence_score : null;
  const minReq = typeof runCtx?.min_score_required === "number" ? runCtx.min_score_required : null;

  if (
    score !== null &&
    minReq !== null &&
    score < minReq &&
    !codes.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_LOW_CONFIDENCE)
  ) {
    codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_LOW_CONFIDENCE);
  }

  const validate = row?.controlled_structural_apply?.validate;
  const reasons = Array.isArray(validate?.reasons) ? validate.reasons : [];

  if (!validate?.ok && reasons.length) {
    if (reasonsImplyAstCorrupt(reasons)) codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_AST_CORRUPT);
    if (reasonsImplyFormatterDrift(reasons)) {
      codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_FORMATTER_DRIFT);
    }
  }

  const fb = Array.isArray(row?.fallback_reason_codes) ? row.fallback_reason_codes : [];

  if (
    fb.includes("structural_apply_error") ||
    String(row?.fallback_reason || "").includes("structural_apply_error")
  ) {
    if (!codes.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_AST_CORRUPT)) {
      codes.push(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_AST_CORRUPT);
    }
  }

  if (
    row?.governance_preempt?.codes &&
    Array.isArray(row.governance_preempt.codes)
  ) {
    for (const c of row.governance_preempt.codes) {
      if (c && !codes.includes(c)) codes.push(c);
    }
  }

  return [...new Set(codes)];
}

/**
 * @param {object} row — linha hybridTelemetryOut
 * @param {object} runCtx
 */
function buildPatchGovernanceDecision(row, runCtx) {
  const mode = getStructuralGovernanceLowConfidenceMode();
  const minReq =
    typeof row?.gate_snapshot?.min_score_required === "number"
      ? row.gate_snapshot.min_score_required
      : runCtx?.min_score_required ?? null;

  const blockers = extractStructuralBlockersFromHybridRow(row, {
    ...runCtx,
    min_score_required: minReq,
  });

  const lowConf = blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_LOW_CONFIDENCE);

  const risk = assessStructuralRisk({
    blockerCodes: blockers,
    lowConfidenceMode: mode,
    lowConfidencePresent: lowConf,
    distinctFilesCount: runCtx?.run_distinct_files ?? 0,
    astCorruptHigh: blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_AST_CORRUPT),
    formatterDriftHigh: blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_FORMATTER_DRIFT),
    deleteOrExportHigh: blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE),
    multiFileHigh: (runCtx?.run_distinct_files ?? 0) >= 3,
  });

  const preempted = row?.fallback_trigger === "governance_escalation";

  return {
    patch_index: row?.patch_index ?? null,
    path: row?.path ?? null,
    execution_mode_used: row?.execution_mode_used ?? null,
    blockers,
    risk,
    governance: {
      preempted_structural: !!preempted,
      low_confidence_mode: mode,
      applies_structural_governance: isStructuralGovernanceEnabled(),
    },
  };
}

function aggregatePatchGovernanceDecisions(decisions, runHints) {
  const allBlockers = new Set();

  for (const d of decisions) {
    for (const b of d.blockers || []) allBlockers.add(b);
  }

  const textual = decisions.filter((d) => d.execution_mode_used === "textual").length;
  const ratio = decisions.length ? textual / decisions.length : 0;

  const runRisk = aggregateStructuralRunRisk(
    decisions.map((d) => d.risk),
    { textual_ratio: ratio },
  );

  return {
    patch_count: decisions.length,
    blocker_codes_union: [...allBlockers],
    textual_fallback_ratio: ratio,
    aggregate_risk: runRisk,
    excessive_fallback_warning: ratio >= 0.5,
    run_hints: runHints || null,
  };
}

/**
 * @param {object[]} rows — hybridTelemetryOut
 * @param {object} [meta]
 * @param {number} [meta.run_distinct_files]
 * @param {number} [meta.min_score_required]
 */
function runStructuralGovernancePipeline(rows, meta) {
  const runCtx = {
    run_distinct_files: meta?.run_distinct_files,
    min_score_required: meta?.min_score_required,
  };

  const decisions = (Array.isArray(rows) ? rows : []).map((r) =>
    buildPatchGovernanceDecision(r, runCtx),
  );
  const aggregate = aggregatePatchGovernanceDecisions(decisions, meta || null);

  return {
    schema_version: 1,
    phase: "4.9.6",
    generated_at: new Date().toISOString(),
    enabled: isStructuralGovernanceEnabled(),
    per_patch: decisions,
    aggregate,
  };
}

function writeStructuralGovernanceArtifacts(o) {
  if (!isStructuralGovernanceEnabled()) return;
  if (!o?.outputDir) return;

  const rows = Array.isArray(o.rows) ? o.rows : [];
  const pipeline = runStructuralGovernancePipeline(rows, {
    run_distinct_files: o.runDistinctFiles,
    min_score_required: o.minScoreRequired,
  });

  safeWriteJson(o.outputDir, "structural-governance-report.json", pipeline, o.outputFs || null);

  const riskOnly = {
    schema_version: 1,
    phase: "4.9.6",
    generated_at: new Date().toISOString(),
    enabled: pipeline.enabled,
    aggregate_risk: pipeline.aggregate,
    per_patch_risk: pipeline.per_patch.map((p) => ({
      patch_index: p.patch_index,
      path: p.path,
      risk: p.risk,
      blockers: p.blockers,
    })),
  };

  safeWriteJson(o.outputDir, "structural-risk-analysis.json", riskOnly, o.outputFs || null);
}

module.exports = {
  isDeleteLikePatch,
  evaluateGovernanceStructuralPreemption,
  extractStructuralBlockersFromHybridRow,
  buildPatchGovernanceDecision,
  aggregatePatchGovernanceDecisions,
  runStructuralGovernancePipeline,
  writeStructuralGovernanceArtifacts,
  STRUCTURAL_BLOCKER_CODES,
};
