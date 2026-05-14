"use strict";

const fs = require("fs");
const path = require("path");

const {
  isHybridExecutorEnabled,
  isStructuralAstReadonlyEnabled,
  isStructuralPlanningEnabled,
  isHybridExecutionEnabled,
  isHybridExecutionApplyActive,
  isStructuralGovernanceEnabled,
  isStructuralReplayFoundationEnabled,
  isStructuralReplayShadowEnabled,
  isHybridRuntimeObservabilityEnabled,
  isStructuralShadowTransformsShadowActive,
  isControlledStructuralApplyActive,
  getHybridRuntimeEnvSnapshot,
} = require("../feature-flags");
const { runArtifactValidationSuite } = require("./runtime-artifact-validator");
const { assertPhaseSequenceOrdering } = require("./runtime-lifecycle");

/** Chaves de ambiente relevantes para matriz 4.9.8 (release readiness). */
const HYBRID_RELEASE_FLAG_KEYS = Object.freeze([
  "HYBRID_EXECUTOR_ENABLED",
  "STRUCTURAL_AST_READONLY_ENABLED",
  "STRUCTURAL_PLANNING_ENABLED",
  "STRUCTURAL_SHADOW_TRANSFORMS_ENABLED",
  "HYBRID_EXECUTION_ENABLED",
  "STRUCTURAL_APPLY_ENABLED",
  "STRUCTURAL_GOVERNANCE_ENABLED",
  "STRUCTURAL_REPLAY_FOUNDATION_ENABLED",
  "STRUCTURAL_IDEMPOTENCY_ENABLED",
  "STRUCTURAL_REPLAY_SHADOW_ENABLED",
  "HYBRID_RUNTIME_OBSERVABILITY_ENABLED",
]);

/**
 * Cenários canónicos de combinação de flags (documentação + testes automatizados).
 * `env` são valores explícitos (omitidos ⇒ unset antes de aplicar).
 */
function buildRuntimeReleaseMatrix() {
  const off = {};
  const hybridCore = {
    HYBRID_EXECUTOR_ENABLED: "true",
    STRUCTURAL_AST_READONLY_ENABLED: "true",
    STRUCTURAL_PLANNING_ENABLED: "true",
    HYBRID_EXECUTION_ENABLED: "true",
  };

  return [
    {
      id: "all_flags_off",
      label: "Todas as flags OFF",
      env: off,
      expect: {
        hybridExecutionApplyActive: false,
        hybridShadowReadonlyActive: false,
        governanceArtifacts: false,
        replayFoundationArtifacts: false,
        replayShadowArtifacts: false,
        observabilitySummary: false,
      },
    },
    {
      id: "hybrid_on_no_governance",
      label: "Hybrid apply ON sem governança",
      env: { ...hybridCore },
      expect: {
        hybridExecutionApplyActive: true,
        structuralGovernanceEnabled: false,
        governanceArtifacts: false,
        replayFoundationArtifacts: false,
        replayShadowArtifacts: false,
        observabilitySummary: false,
      },
    },
    {
      id: "governance_on",
      label: "Governança estrutural ON",
      env: { ...hybridCore, STRUCTURAL_GOVERNANCE_ENABLED: "true" },
      expect: {
        hybridExecutionApplyActive: true,
        structuralGovernanceEnabled: true,
        governanceArtifacts: true,
        replayFoundationArtifacts: false,
        replayShadowArtifacts: false,
        observabilitySummary: false,
      },
    },
    {
      id: "replay_shadow_on",
      label: "Replay shadow ON",
      env: { ...hybridCore, STRUCTURAL_REPLAY_SHADOW_ENABLED: "true" },
      expect: {
        hybridExecutionApplyActive: true,
        replayShadowArtifacts: true,
        observabilitySummary: false,
      },
    },
    {
      id: "observability_on",
      label: "Observabilidade runtime ON",
      env: { ...hybridCore, HYBRID_RUNTIME_OBSERVABILITY_ENABLED: "true" },
      expect: {
        hybridExecutionApplyActive: true,
        observabilitySummary: true,
        replayShadowArtifacts: false,
      },
    },
    {
      id: "mixed_runtime",
      label: "Combinação mista (governança + fundação replay + shadow + observabilidade)",
      env: {
        ...hybridCore,
        STRUCTURAL_GOVERNANCE_ENABLED: "true",
        STRUCTURAL_REPLAY_FOUNDATION_ENABLED: "true",
        STRUCTURAL_IDEMPOTENCY_ENABLED: "true",
        STRUCTURAL_REPLAY_SHADOW_ENABLED: "true",
        HYBRID_RUNTIME_OBSERVABILITY_ENABLED: "true",
      },
      expect: {
        hybridExecutionApplyActive: true,
        governanceArtifacts: true,
        replayFoundationArtifacts: true,
        replayShadowArtifacts: true,
        observabilitySummary: true,
      },
    },
    {
      id: "controlled_structural_apply",
      label: "Apply estrutural controlado (4.9.5) ON",
      env: { ...hybridCore, STRUCTURAL_APPLY_ENABLED: "true" },
      expect: {
        hybridExecutionApplyActive: true,
        controlledStructuralApplyActive: true,
      },
    },
    {
      id: "shadow_transforms_shadow",
      label: "Shadow transforms ativos (4.9.3 sob stack shadow)",
      env: {
        HYBRID_EXECUTOR_ENABLED: "true",
        STRUCTURAL_AST_READONLY_ENABLED: "true",
        STRUCTURAL_PLANNING_ENABLED: "true",
        STRUCTURAL_SHADOW_TRANSFORMS_ENABLED: "true",
      },
      expect: {
        structuralShadowTransformsShadowActive: true,
        hybridExecutionApplyActive: false,
      },
    },
  ];
}

/**
 * @param {Record<string, string|undefined>} envPatch
 */
function applyHybridReleaseEnv(envPatch) {
  const snap = {};

  for (const k of HYBRID_RELEASE_FLAG_KEYS) {
    snap[k] = process.env[k];
  }

  for (const k of HYBRID_RELEASE_FLAG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(envPatch || {}, k)) {
      const v = envPatch[k];
      if (v === undefined || v === null || String(v).trim() === "") delete process.env[k];
      else process.env[k] = String(v);
    } else {
      delete process.env[k];
    }
  }

  return snap;
}

function restoreHybridReleaseEnv(snap) {
  for (const k of HYBRID_RELEASE_FLAG_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

/**
 * Avalia expectativas declarativas contra os getters atuais (process.env já aplicado).
 */
function evaluateReleaseScenarioActuals() {
  const shadowReadonly = isHybridExecutorEnabled() && isStructuralAstReadonlyEnabled();

  return {
    hybridExecutionApplyActive: isHybridExecutionApplyActive(),
    hybridShadowReadonlyActive: shadowReadonly,
    structuralGovernanceEnabled: isStructuralGovernanceEnabled(),
    structuralShadowTransformsShadowActive: isStructuralShadowTransformsShadowActive(),
    controlledStructuralApplyActive: isControlledStructuralApplyActive(),
    replayFoundationArtifacts: isStructuralReplayFoundationEnabled(),
    replayShadowArtifacts: isStructuralReplayShadowEnabled(),
    observabilitySummary: isHybridRuntimeObservabilityEnabled(),
    governanceArtifacts: isStructuralGovernanceEnabled(),
    hybridExecutorEnabled: isHybridExecutorEnabled(),
    hybridExecutionEnabled: isHybridExecutionEnabled(),
    structuralPlanningEnabled: isStructuralPlanningEnabled(),
  };
}

/**
 * @param {object} scenario linha de buildRuntimeReleaseMatrix()
 */
function validateReleaseScenario(scenario) {
  const snap = applyHybridReleaseEnv(scenario.env || {});

  try {
    const actual = evaluateReleaseScenarioActuals();
    /** @type {string[]} */
    const errors = [];
    const exp = scenario.expect || {};

    for (const key of Object.keys(exp)) {
      if (actual[key] !== exp[key]) {
        errors.push(`[${scenario.id}] expect.${key}=${exp[key]} actual.${key}=${actual[key]}`);
      }
    }

    return { ok: errors.length === 0, scenario_id: scenario.id, errors, actual };
  } finally {
    restoreHybridReleaseEnv(snap);
  }
}

function validateFullReleaseFlagMatrix() {
  const matrix = buildRuntimeReleaseMatrix();
  /** @type {object[]} */
  const results = [];

  for (const row of matrix) {
    results.push(validateReleaseScenario(row));
  }

  return {
    ok: results.every((r) => r.ok),
    results,
  };
}

/**
 * Lista de ficheiros gravados por `writeHybridExecutionArtifacts` conforme flags atuais.
 */
function listExpectedArtifactFilenamesFromFlags() {
  const base = ["hybrid-execution-results.json", "structural-fallback-report.json"];
  const out = [...base];

  if (isStructuralGovernanceEnabled()) {
    out.push("structural-governance-report.json", "structural-risk-analysis.json");
  }

  if (isStructuralReplayFoundationEnabled()) {
    out.push(
      "structural-fingerprint-report.json",
      "structural-lineage-report.json",
      "structural-stale-analysis.json",
    );
  }

  if (isStructuralReplayShadowEnabled()) {
    out.push(
      "structural-replay-shadow.json",
      "structural-replay-classification.json",
      "structural-replay-continuity.json",
    );
  }

  if (isHybridRuntimeObservabilityEnabled()) {
    out.push("hybrid-runtime-summary.json");
  }

  return [...new Set(out)];
}

function histogramShallowEqual(a, b) {
  const ka = Object.keys(a || {}).sort();
  const kb = Object.keys(b || {}).sort();

  if (ka.length !== kb.length) return false;

  for (const k of ka) {
    if ((a || {})[k] !== (b || {})[k]) return false;
  }

  return true;
}

/**
 * Consistência profunda fallback (hybrid-execution-results vs structural-fallback-report).
 */
function validateFallbackConsistency(hybrid, fb) {
  /** @type {string[]} */
  const errors = [];

  if (!hybrid || !fb) {
    errors.push("documentos hybrid ou fallback ausentes");
    return { ok: false, errors };
  }

  const hp = Array.isArray(hybrid.per_patch) ? hybrid.per_patch : [];
  const ent = Array.isArray(fb.entries) ? fb.entries : [];

  if (hp.length !== ent.length) {
    errors.push(`per_patch (${hp.length}) ≠ fallback.entries (${ent.length})`);
  }

  const hs = hybrid.summary || {};
  const fc = fb.counts || {};

  if (typeof hs.patch_steps === "number" && typeof fc.patch_steps === "number") {
    if (hs.patch_steps !== fc.patch_steps) {
      errors.push(`summary.patch_steps (${hs.patch_steps}) ≠ counts.patch_steps (${fc.patch_steps})`);
    }
  }

  if (
    typeof hs.execution_mode_structural === "number" &&
    typeof fc.execution_mode_structural === "number"
  ) {
    if (hs.execution_mode_structural !== fc.execution_mode_structural) {
      errors.push(
        `execution_mode_structural hybrid (${hs.execution_mode_structural}) ≠ fallback (${fc.execution_mode_structural})`,
      );
    }
  }

  if (typeof hs.execution_mode_textual === "number" && typeof fc.execution_mode_textual === "number") {
    if (hs.execution_mode_textual !== fc.execution_mode_textual) {
      errors.push(
        `execution_mode_textual hybrid (${hs.execution_mode_textual}) ≠ fallback (${fc.execution_mode_textual})`,
      );
    }
  }

  if (!histogramShallowEqual(hs.fallback_reason_histogram, fb.fallback_reason_histogram)) {
    errors.push("fallback_reason_histogram diverge entre hybrid e fallback-report");
  }

  if (!histogramShallowEqual(hs.fallback_trigger_histogram, fb.fallback_trigger_histogram)) {
    errors.push("fallback_trigger_histogram diverge entre hybrid e fallback-report");
  }

  const n = Math.min(hp.length, ent.length);

  for (let i = 0; i < n; i++) {
    const pi = hp[i]?.patch_index;
    const ei = ent[i]?.patch_index;

    if (pi !== undefined && ei !== undefined && pi !== ei) {
      errors.push(`patch_index mismatch índice ${i}: hybrid=${pi} fallback=${ei}`);
      break;
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Governança alinhada com número de patches.
 */
function validateGovernanceConsistency(hybrid, gov) {
  /** @type {string[]} */
  const errors = [];

  if (!gov) {
    return { ok: true, skipped: true, errors: [] };
  }

  const hp = Array.isArray(hybrid?.per_patch) ? hybrid.per_patch : [];
  const gp = Array.isArray(gov.per_patch) ? gov.per_patch : [];

  if (hp.length !== gp.length) {
    errors.push(`hybrid.per_patch (${hp.length}) ≠ governance.per_patch (${gp.length})`);
  }

  const agg = gov.aggregate;

  if (agg && typeof agg.patch_count === "number" && agg.patch_count !== hp.length) {
    errors.push(`governance.aggregate.patch_count (${agg.patch_count}) ≠ hybrid.per_patch (${hp.length})`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Pacote replay shadow (shadow + classification + continuity).
 */
function validateReplayShadowConsistency(hybrid, shadow, classification, continuity) {
  /** @type {string[]} */
  const errors = [];

  if (!shadow && !classification && !continuity) {
    return { ok: true, skipped: true, errors: [] };
  }

  if (!shadow || !classification || !continuity) {
    errors.push("replay shadow incompleto (esperado trio de JSON)");
    return { ok: false, errors };
  }

  if (!shadow.shadow_only || !classification.shadow_only || !continuity.shadow_only) {
    errors.push("documentos replay devem declarar shadow_only=true");
  }

  const hp = Array.isArray(hybrid?.per_patch) ? hybrid.per_patch : [];
  const clsRows = Array.isArray(classification.per_patch) ? classification.per_patch : [];

  if (hp.length !== clsRows.length) {
    errors.push(`hybrid.per_patch (${hp.length}) ≠ classification.per_patch (${clsRows.length})`);
  }

  const summN = classification.summary?.per_patch;

  if (typeof summN === "number" && summN !== clsRows.length) {
    errors.push(`classification.summary.per_patch (${summN}) ≠ len(per_patch) (${clsRows.length})`);
  }

  const chain = continuity.overlay_chain?.per_patch;

  if (Array.isArray(chain) && hp.length > 0 && chain.length !== hp.length) {
    errors.push(`continuity.overlay_chain.per_patch (${chain.length}) ≠ hybrid.per_patch (${hp.length})`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Findings stale/replay coerentes com classificações (quando presentes).
 */
function validateStaleReplayConsistency(staleDoc, classification) {
  /** @type {string[]} */
  const errors = [];

  if (!staleDoc || !classification) {
    return { ok: true, skipped: true, errors: [] };
  }

  const findings = Array.isArray(staleDoc.findings) ? staleDoc.findings : [];
  const staleIdx = findings
    .filter((f) => f && f.kind === "stale_selector")
    .map((f) => f.patch_index);

  const clsRows = Array.isArray(classification.per_patch) ? classification.per_patch : [];

  for (const idx of staleIdx) {
    const row = clsRows.find((r) => r && r.patch_index === idx);

    if (!row) {
      errors.push(`stale finding patch_index=${idx} sem linha na classification`);
      continue;
    }

    const c = String(row.classification || "");

    if (findings.some((f) => f.kind === "stale_selector" && f.patch_index === idx)) {
      if (c !== "stale_selector") {
        errors.push(`patch ${idx}: esperado classification stale_selector, recebido=${c}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Linhas sintéticas para cenários operacionais (rollback / drills).
 */
function buildSyntheticFallbackForcedRows() {
  return [
    {
      patch_index: 0,
      path: "a.js",
      execution_mode_used: "textual",
      fallback_reason: "confidence_below_threshold",
      fallback_reason_codes: ["confidence_below_threshold"],
      fallback_trigger: "gate",
      gate_snapshot: { allowed: false, confidence_score: 40, min_score_required: 90 },
    },
  ];
}

function buildSyntheticCorruptionRows() {
  return [
    {
      patch_index: 0,
      path: "x.ts",
      execution_mode_used: "textual",
      fallback_reason: "structural_apply_error",
      fallback_reason_codes: ["structural_apply_error"],
      fallback_trigger: "apply_exception",
      gate_snapshot: { allowed: true, confidence_score: 95, min_score_required: 90 },
      controlled_structural_apply: {
        validate: { ok: false, reasons: ["ast_reparse_failed"] },
      },
    },
  ];
}

function buildSyntheticStaleReplayRows() {
  return [
    {
      patch_index: 0,
      path: "z.ts",
      execution_mode_used: "structural",
      fallback_trigger: "none",
      structural_replay: { span_out_of_bounds: true, search_missing_in_span: false },
      plan_entry: {
        op: "replace_node",
        mapping_status: "mapped",
        node_span: { start: 0, end: 5 },
      },
      gate_snapshot: { allowed: true, confidence_score: 92, min_score_required: 90 },
    },
  ];
}

/**
 * Validação consolidada release readiness (bundle já carregado).
 * @param {{
 *   bundle: Record<string, object>,
 *   lifecycleAssert?: boolean,
 * }} opts
 */
function runRuntimeReleaseValidation(opts) {
  const bundle = opts?.bundle && typeof opts.bundle === "object" ? opts.bundle : {};
  /** @type {string[]} */
  const errors = [];

  if (opts?.lifecycleAssert !== false && !assertPhaseSequenceOrdering()) {
    errors.push("RUNTIME_PHASE_SEQUENCE não está monótona em order");
  }

  const hybrid = bundle["hybrid-execution-results.json"];
  const fb = bundle["structural-fallback-report.json"];
  const gov = bundle["structural-governance-report.json"];
  const stale = bundle["structural-stale-analysis.json"];
  const shadow = bundle["structural-replay-shadow.json"];
  const classification = bundle["structural-replay-classification.json"];
  const continuity = bundle["structural-replay-continuity.json"];

  const suite = runArtifactValidationSuite(bundle);

  if (!suite.ok) {
    for (const row of suite.documents?.per_file || []) {
      if (!row.ok) errors.push(...row.errors.map((e) => `artifact_doc:${e}`));
    }

    for (const e of suite.consistency?.errors || []) errors.push(`artifact_cross:${e}`);
  }

  const fbCheck = validateFallbackConsistency(hybrid, fb);

  if (!fbCheck.ok) errors.push(...fbCheck.errors.map((e) => `fallback:${e}`));

  const govCheck = validateGovernanceConsistency(hybrid, gov);

  if (!govCheck.ok) errors.push(...govCheck.errors.map((e) => `governance:${e}`));

  const rsCheck = validateReplayShadowConsistency(hybrid, shadow, classification, continuity);

  if (!rsCheck.ok) errors.push(...rsCheck.errors.map((e) => `replay_shadow:${e}`));

  const staleCheck = validateStaleReplayConsistency(stale, classification);

  if (!staleCheck.ok) errors.push(...staleCheck.errors.map((e) => `stale:${e}`));

  const summary = bundle["hybrid-runtime-summary.json"];

  if (summary?.artifact_validation && summary.artifact_validation.ok === false) {
    errors.push("hybrid-runtime-summary marca artifact_validation.ok=false");
  }

  return {
    ok: errors.length === 0,
    errors,
    checks: {
      lifecycle_ordering: assertPhaseSequenceOrdering(),
      artifact_suite: suite,
      fallback: fbCheck,
      governance: govCheck,
      replay_shadow: rsCheck,
      stale_replay: staleCheck,
    },
    flag_snapshot: getHybridRuntimeEnvSnapshot(),
  };
}

/**
 * Lê JSONs esperados de um diretório de output de run.
 */
function loadHybridBundleFromDir(dir) {
  const bundle = {};

  if (!dir || !fs.existsSync(dir)) return bundle;

  const names = [
    "hybrid-execution-results.json",
    "structural-fallback-report.json",
    "structural-governance-report.json",
    "structural-risk-analysis.json",
    "structural-fingerprint-report.json",
    "structural-lineage-report.json",
    "structural-stale-analysis.json",
    "structural-replay-shadow.json",
    "structural-replay-classification.json",
    "structural-replay-continuity.json",
    "hybrid-runtime-summary.json",
  ];

  for (const name of names) {
    const fp = path.join(dir, name);

    try {
      if (fs.existsSync(fp)) {
        bundle[name] = JSON.parse(fs.readFileSync(fp, "utf8"));
      }
    } catch (_) {}
  }

  return bundle;
}

function main() {
  const matrix = validateFullReleaseFlagMatrix();
  const payload = {
    phase: "4.9.8",
    matrix_ok: matrix.ok,
    matrix_results: matrix.results.map((r) => ({
      scenario_id: r.scenario_id,
      ok: r.ok,
      errors: r.errors,
    })),
    lifecycle_ordering_ok: assertPhaseSequenceOrdering(),
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = matrix.ok && payload.lifecycle_ordering_ok ? 0 : 2;
}

if (require.main === module) {
  main();
}

module.exports = {
  HYBRID_RELEASE_FLAG_KEYS,
  buildRuntimeReleaseMatrix,
  applyHybridReleaseEnv,
  restoreHybridReleaseEnv,
  evaluateReleaseScenarioActuals,
  validateReleaseScenario,
  validateFullReleaseFlagMatrix,
  listExpectedArtifactFilenamesFromFlags,
  validateFallbackConsistency,
  validateGovernanceConsistency,
  validateReplayShadowConsistency,
  validateStaleReplayConsistency,
  runRuntimeReleaseValidation,
  loadHybridBundleFromDir,
  buildSyntheticFallbackForcedRows,
  buildSyntheticCorruptionRows,
  buildSyntheticStaleReplayRows,
};
