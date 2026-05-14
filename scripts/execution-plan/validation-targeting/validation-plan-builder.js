/**
 * validation-plan.json — Fases 4.10.1 + 4.10.2
 * Consolida artefactos (targets, reconciliation, propagation, hints) e resolve comandos (4.10.2).
 * Não executa validators. Determinístico / replay-safe.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { stableStringify, sha256HexUtf8 } = require("../fingerprint/plan-fingerprint");
const { normalizePath } = require("../normalization/operation-normalizer");
const {
  VALIDATION_TARGETS_FILENAME,
  VALIDATION_MANIFEST_FILENAME,
  VALIDATION_PROPAGATION_MANIFEST_FILENAME,
  VALIDATION_PLAN_FILENAME,
} = require("./constants");
const { loadValidationTargets, loadValidationManifest } = require("./validation-manifest");
const { loadValidationPropagationManifest } = require("./semantic-validation-propagation");
const { readExecutorChangesNormalized } = require("./validation-target-generator");
const {
  resolveValidatorCommands,
  computeValidatorResolutionFingerprint,
  computeValidationPlanIdentityPayload,
  RESOLVER_SCHEMA_CONTRACT,
  RESOLVER_SCHEMA_VERSION,
} = require("./validator-resolver");
const { enrichValidationPlanWithGraphImpact } = require("./graph-aware-plan-enrichment");

const VALIDATION_PLAN_SCHEMA_CONTRACT = "validation-plan/1";

function validationPlanPath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_PLAN_FILENAME);
}

function readExecutorChangesRaw(outputDir) {
  const p = path.join(String(outputDir || ""), "executor-changes.json");
  try {
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function stableSortDependencyHints(hints) {
  if (!Array.isArray(hints)) return [];
  const copy = hints
    .filter((h) => h && typeof h === "object")
    .map((h) => ({
      kind: String(h.kind || ""),
      detail: String(h.detail || ""),
    }));
  copy.sort((a, b) => {
    const k = a.kind.localeCompare(b.kind);
    if (k !== 0) return k;
    return a.detail.localeCompare(b.detail);
  });
  return copy;
}

function histogramScopesFromRows(rows) {
  const h = { file: 0, module: 0, project: 0 };
  for (const r of rows) {
    const s = r && r.validation_scope;
    if (s === "file") h.file += 1;
    else if (s === "module") h.module += 1;
    else if (s === "project") h.project += 1;
  }
  return h;
}

function consolidationKeyForFile(filePath) {
  const f = normalizePath(filePath);
  return f ? `file:${f}` : "";
}

function consolidationKeyForModule(modDir) {
  const d = normalizePath(modDir);
  return d ? `module:${d}` : "";
}

function stableSyntheticTargetId(planId, runId, expansionSource, keyKind, keyPath) {
  const payload = [
    String(planId || ""),
    String(runId || ""),
    String(expansionSource || ""),
    String(keyKind || ""),
    String(keyPath || ""),
  ].join("\u001f");
  const h = crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
  return `vp-${h}`;
}

/**
 * @returns {Map<string, object>}
 */
function buildConsolidatedTargetMap(targetsDoc, propagationDoc, planId, runId) {
  /** @type {Map<string, object>} */
  const map = new Map();

  const rawTargets = targetsDoc && Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];
  const sortedById = [...rawTargets].sort((a, b) =>
    String(a.target_id || "").localeCompare(String(b.target_id || "")),
  );

  for (const t of sortedById) {
    if (!t || typeof t !== "object") continue;
    const file = normalizePath(t.file);
    if (!file) continue;
    const ckey = consolidationKeyForFile(file);
    map.set(ckey, {
      consolidation_key: ckey,
      target_id: String(t.target_id || ""),
      file,
      module_directory: null,
      validation_scope: t.validation_scope,
      primary_reason: t.reason != null ? String(t.reason) : null,
      source_operation_ids: Array.isArray(t.source_operation_ids)
        ? [...t.source_operation_ids].map((x) => String(x)).sort((a, b) => a.localeCompare(b))
        : [],
      reasons_all: Array.isArray(t.metadata && t.metadata.all_reasons)
        ? [...t.metadata.all_reasons].map((x) => String(x)).sort((a, b) => a.localeCompare(b))
        : [],
      inferred_validators: new Set(
        Array.isArray(t.inferred_validators) ? t.inferred_validators.map((x) => String(x)) : [],
      ),
      dependency_hints: stableSortDependencyHints(t.dependency_hints),
      risk_hints: Array.isArray(t.risk_hints)
        ? [...new Set(t.risk_hints.map((x) => String(x)))].sort((a, b) => a.localeCompare(b))
        : [],
      expansion_layers: new Set(["validation_targets"]),
      semantic_classifications: new Set(),
    });
  }

  const expanded =
    propagationDoc && Array.isArray(propagationDoc.expanded_targets)
      ? propagationDoc.expanded_targets
      : [];

  for (const e of expanded) {
    if (!e || typeof e !== "object") continue;
    const src = String(e.expansion_source || "");
    if (src === "original_validation_targeting") continue;

    const ckey =
      e.file != null && String(e.file).trim() !== ""
        ? consolidationKeyForFile(e.file)
        : consolidationKeyForModule(e.module_directory || "");

    if (!ckey) continue;

    const sem = e.semantic_classification != null ? String(e.semantic_classification) : null;
    const validators = Array.isArray(e.inferred_validators)
      ? e.inferred_validators.map((x) => String(x))
      : [];

    const existing = map.get(ckey);
    if (existing) {
      for (const v of validators) existing.inferred_validators.add(v);
      existing.expansion_layers.add("semantic_propagation_shadow");
      if (sem) existing.semantic_classifications.add(sem);
      continue;
    }

    const synthId = stableSyntheticTargetId(
      planId,
      runId,
      src,
      e.file ? "file" : "module",
      e.file || e.module_directory || "",
    );

    map.set(ckey, {
      consolidation_key: ckey,
      target_id: synthId,
      file: e.file != null ? normalizePath(e.file) : null,
      module_directory:
        e.module_directory != null ? normalizePath(String(e.module_directory)) : null,
      validation_scope: e.validation_scope,
      primary_reason: null,
      source_operation_ids: [],
      reasons_all: [],
      inferred_validators: new Set(validators),
      dependency_hints: [],
      risk_hints: [],
      expansion_layers: new Set(["semantic_propagation_shadow"]),
      semantic_classifications: sem ? new Set([sem]) : new Set(),
      surrogate_inference_file:
        e.surrogate_inference_file != null ? normalizePath(String(e.surrogate_inference_file)) : null,
    });
  }

  return map;
}

function mapToSortedRows(map) {
  const rows = [...map.values()].map((row) => ({
    target_id: String(row.target_id || ""),
    consolidation_key: String(row.consolidation_key || ""),
    file: row.file,
    module_directory: row.module_directory,
    surrogate_inference_file: row.surrogate_inference_file != null ? row.surrogate_inference_file : null,
    validation_scope: row.validation_scope,
    primary_reason: row.primary_reason,
    source_operation_ids: row.source_operation_ids,
    reasons_all: row.reasons_all,
    inferred_validators: [...row.inferred_validators].sort((a, b) => a.localeCompare(b)),
    dependency_hints: row.dependency_hints,
    risk_hints: row.risk_hints,
    semantic_classifications: [...row.semantic_classifications].sort((a, b) => a.localeCompare(b)),
    expansion_layers: [...row.expansion_layers].sort((a, b) => a.localeCompare(b)),
  }));

  rows.sort((a, b) => a.consolidation_key.localeCompare(b.consolidation_key));
  return rows;
}

function collectValidatorDescriptors(sortedRows) {
  const ids = new Set();
  for (const r of sortedRows) {
    for (const v of r.inferred_validators) ids.add(String(v));
  }
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  return sorted.map((descriptor_id) => ({
    descriptor_id,
    descriptor_kind: "inferred_tool_label",
    schema: "validation-descriptor/v1",
  }));
}

function snapshotValidationTargetsForFingerprint(targetsDoc) {
  const raw = targetsDoc && Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];
  const rows = [...raw]
    .filter((t) => t && typeof t === "object")
    .map((t) => ({
      target_id: String(t.target_id || ""),
      file: normalizePath(t.file),
      reason: t.reason != null ? String(t.reason) : null,
      source_operation_ids: Array.isArray(t.source_operation_ids)
        ? [...t.source_operation_ids].map((x) => String(x)).sort((a, b) => a.localeCompare(b))
        : [],
      validation_scope: t.validation_scope,
      inferred_validators: Array.isArray(t.inferred_validators)
        ? [...t.inferred_validators].map((x) => String(x)).sort((a, b) => a.localeCompare(b))
        : [],
      dependency_hints: stableSortDependencyHints(t.dependency_hints),
      risk_hints: Array.isArray(t.risk_hints)
        ? [...new Set(t.risk_hints.map((x) => String(x)))].sort((a, b) => a.localeCompare(b))
        : [],
    }));
  rows.sort((a, b) => a.target_id.localeCompare(b.target_id));
  return rows;
}

/**
 * @param {{
 *   outputDir: string,
 *   phase?: string|null,
 *   targetsDoc?: object|null,
 *   validationManifestDoc?: object|null,
 *   propagationManifestDoc?: object|null,
 *   executorChangesRaw?: unknown[]|null,
 *   dependencyGraphDoc?: object|null|undefined,
 * }} input
 */
function buildValidationPlanDocument(input) {
  const outputDir = String((input && input.outputDir) || "");
  if (!outputDir) return null;

  let targetsDoc = input && input.targetsDoc != null ? input.targetsDoc : null;
  if (!targetsDoc) targetsDoc = loadValidationTargets(outputDir);
  if (!targetsDoc || typeof targetsDoc !== "object") return null;

  let validationManifestDoc = null;
  if (input && Object.prototype.hasOwnProperty.call(input, "validationManifestDoc")) {
    validationManifestDoc = input.validationManifestDoc;
  } else {
    validationManifestDoc = loadValidationManifest(outputDir);
  }

  let propagationDoc = null;
  if (input && Object.prototype.hasOwnProperty.call(input, "propagationManifestDoc")) {
    propagationDoc = input.propagationManifestDoc;
  } else {
    propagationDoc = loadValidationPropagationManifest(outputDir);
  }

  const phase = input && input.phase != null ? String(input.phase) : null;
  const planId = String(targetsDoc.plan_id || "");
  const runId = String(targetsDoc.run_id || "");
  const generatedAt = targetsDoc.generated_at != null ? String(targetsDoc.generated_at) : null;

  let executorRaw = readExecutorChangesRaw(outputDir);
  if (input && Object.prototype.hasOwnProperty.call(input, "executorChangesRaw")) {
    executorRaw =
      Array.isArray(input.executorChangesRaw) ? input.executorChangesRaw : [];
  }
  const executorPaths = readExecutorChangesNormalized(executorRaw);
  const executor_changes_digest_sha256 = sha256HexUtf8(
    stableStringify({ paths: [...new Set(executorPaths)].sort((a, b) => a.localeCompare(b)) }),
  );

  const targetMap = buildConsolidatedTargetMap(targetsDoc, propagationDoc, planId, runId);
  const targets = mapToSortedRows(targetMap);
  const validators = collectValidatorDescriptors(targets);
  const scope = {
    histogram: histogramScopesFromRows(targets),
    total_consolidated_targets: targets.length,
    total_validation_targets_rows: Array.isArray(targetsDoc.targets) ? targetsDoc.targets.length : 0,
    semantic_propagation_mode:
      propagationDoc && propagationDoc.propagation_mode != null
        ? String(propagationDoc.propagation_mode)
        : null,
    semantic_candidates_total:
      propagationDoc &&
      propagationDoc.propagation_stats &&
      propagationDoc.propagation_stats.semantic_candidates_total != null
        ? Number(propagationDoc.propagation_stats.semantic_candidates_total)
        : 0,
  };

  const validation_targets_snapshot = snapshotValidationTargetsForFingerprint(targetsDoc);
  const validation_targets_snapshot_sha256 = sha256HexUtf8(
    stableStringify({ schema_version: targetsDoc.schema_version, rows: validation_targets_snapshot }),
  );

  const semantic_propagation_fingerprint_sha256 =
    propagationDoc && propagationDoc.propagation_fingerprint_sha256 != null
      ? String(propagationDoc.propagation_fingerprint_sha256)
      : null;

  const plan_fp_from_manifest =
    validationManifestDoc &&
    validationManifestDoc.refs &&
    validationManifestDoc.refs.plan_fingerprint_sha256 != null
      ? String(validationManifestDoc.refs.plan_fingerprint_sha256)
      : null;

  const sources = {
    validation_targets: VALIDATION_TARGETS_FILENAME,
    validation_manifest: VALIDATION_MANIFEST_FILENAME,
    validation_propagation_manifest: VALIDATION_PROPAGATION_MANIFEST_FILENAME,
    executor_changes: "executor-changes.json",
    execution_plan: "execution-plan.json",
  };

  const metadata = {
    plan_id: planId,
    run_id: runId,
    generation_phase: phase,
    generated_at: generatedAt,
    validation_targeting_schema_version:
      targetsDoc.schema_version != null ? Number(targetsDoc.schema_version) : null,
    resolver_schema_contract: RESOLVER_SCHEMA_CONTRACT,
    resolver_schema_version: RESOLVER_SCHEMA_VERSION,
  };

  const docBase = {
    version: 1,
    schema_contract: VALIDATION_PLAN_SCHEMA_CONTRACT,
    targets,
    validators,
    scope,
    sources,
    metadata,
    fingerprints: {
      validation_targets_snapshot_sha256,
      executor_changes_digest_sha256,
      semantic_propagation_fingerprint_sha256,
      plan_fingerprint_sha256: plan_fp_from_manifest,
    },
  };

  const resolution = resolveValidatorCommands(docBase, outputDir);
  const resolved_validators =
    resolution && Array.isArray(resolution.resolved_validators) ? resolution.resolved_validators : [];
  const commands = resolution && Array.isArray(resolution.commands) ? resolution.commands : [];
  const resolver = resolution && resolution.resolver ? resolution.resolver : null;

  const validator_resolution_sha256 = resolution ? computeValidatorResolutionFingerprint(resolution) : null;

  const merged = {
    ...docBase,
    resolved_validators,
    commands,
    resolver,
    fingerprints: {
      ...docBase.fingerprints,
      validator_resolution_sha256:
        validator_resolution_sha256 ||
        sha256HexUtf8(stableStringify({ resolver: "absent_or_empty", plan_id: planId, run_id: runId })),
    },
  };

  merged.fingerprints.validation_plan_identity_sha256 = sha256HexUtf8(
    stableStringify(computeValidationPlanIdentityPayload(merged)),
  );

  try {
    const enrichInput = {
      outputDir,
      targetsDoc,
    };
    if (input && Object.prototype.hasOwnProperty.call(input, "dependencyGraphDoc")) {
      enrichInput.graphDoc = input.dependencyGraphDoc;
    }
    enrichValidationPlanWithGraphImpact(merged, enrichInput);
  } catch (_) {
    /* metadados graph-aware são best-effort */
  }

  return merged;
}

function saveValidationPlan(outputDir, doc) {
  const dir = String(outputDir || "");
  if (!dir || !doc || typeof doc !== "object") return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(validationPlanPath(dir), JSON.stringify(doc, null, 2), "utf8");
}

function loadValidationPlan(outputDir) {
  const p = validationPlanPath(outputDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

module.exports = {
  VALIDATION_PLAN_FILENAME,
  VALIDATION_PLAN_SCHEMA_CONTRACT,
  buildValidationPlanDocument,
  saveValidationPlan,
  loadValidationPlan,
  validationPlanPath,
  enrichValidationPlanWithGraphImpact,
};
