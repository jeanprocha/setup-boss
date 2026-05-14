/**
 * Motor central de análise de risco (Fase 4.3).
 */

const fs = require("fs");
const path = require("path");
const { loadPlan } = require("../../execution-plan/persistence/plan-store");
const { RECON_FILE } = require("../../execution-plan/reconciliation/reconciliation-engine");
const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const { getValidationModeFromEnv } = require("../../validation-runtime/feature-flags");
const { evaluateAllFactors } = require("../factors");
const {
  aggregateWeightedScores,
  computeConfidence,
  maxFactorSeverity,
} = require("../scoring/risk-scoring");
const { defaultFactorWeights } = require("../policies/risk-policies");
const { buildRiskPropagation } = require("../propagation/risk-propagation");
const { validationEscalationRecommendations } = require("../validation/risk-aware-validation");
const { buildRiskAnalysisContract } = require("../contract/risk-contract");
const { buildRiskRuntimeManifest, saveRiskRuntimeManifest } = require("../manifests/risk-runtime-manifest");
const {
  RISK_ANALYSIS_FILENAME,
  RISK_SEMANTIC_MUTATION_GRAPH_REF,
  RISK_SEMANTIC_PROPAGATION_MANIFEST_REF,
} = require("../constants");
const { emitRiskTelemetry } = require("../telemetry/risk-telemetry");
const {
  getSemanticRiskPropagationModeFromEnv,
  isRiskEngineOrchestrationActive,
} = require("../feature-flags");
const { buildSemanticRiskPropagationBlock } = require("../semantic-risk-propagation");
const { savePlanArtifactsManifest } = require("../../execution-plan/manifest/plan-artifacts-manifest");

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function countTelemetryRetries(ctx) {
  let n = 0;
  try {
    const snap =
      ctx && ctx.telemetry && typeof ctx.telemetry.snapshot === "function"
        ? ctx.telemetry.snapshot()
        : [];
    for (const e of snap) {
      const t = e && e.type ? String(e.type) : "";
      if (/retry|recovery|correction|micro_retry/i.test(t)) n += 1;
    }
  } catch (_) {
    return 0;
  }
  return n;
}

function validationAttempted(outputDir) {
  const mode = getValidationModeFromEnv();
  if (mode === "off") return false;
  const targets = path.join(String(outputDir || ""), "validation-targets.json");
  return fs.existsSync(targets);
}

/**
 * @param {{ outputDir: string, runId: string, ctx?: object|null }} args
 */
function buildRiskInputContext(args) {
  const outputDir = String(args.outputDir || "");
  const runId = args.runId != null ? String(args.runId) : "";
  const ctx = args.ctx || null;

  const plan = loadPlan(outputDir);
  const reconciliation = readJsonSafe(path.join(outputDir, RECON_FILE));
  const validationResults = readJsonSafe(path.join(outputDir, VALIDATION_RESULTS_FILENAME));
  const executorChanges = readJsonSafe(path.join(outputDir, "executor-changes.json"));
  const validationManifest = readJsonSafe(path.join(outputDir, "validation-runtime-manifest.json"));

  const changesArr = Array.isArray(executorChanges) ? executorChanges : [];

  return {
    outputDir,
    runId,
    plan,
    reconciliation,
    validationResults,
    validationManifest,
    executorChanges: changesArr,
    validationWasAttempted: validationAttempted(outputDir),
    telemetrySnapshot: {
      executor_retries: countTelemetryRetries(ctx),
    },
  };
}

function buildReviewHints(tier, factors, hadValidationFailures) {
  const list = Array.isArray(factors) ? factors : [];
  const vf = list.find((f) => f && f.type === "validation_failures");
  const buckets = vf && vf.evidence && typeof vf.evidence.buckets === "object" ? vf.evidence.buckets : {};
  const st = Number(buckets.structural) || 0;
  const sem = Number(buckets.semantic) || 0;

  const t = String(tier || "low").toLowerCase();

  return {
    requires_structural_review: st > 0 || t === "high" || t === "critical",
    requires_semantic_review: sem > 0 || t === "critical",
    requires_double_review: t === "critical",
    requires_manual_review: t === "critical" || hadValidationFailures,
  };
}

function buildRecommendations(tier, propagation, valEsc) {
  const out = new Set();
  out.add(`Tier global ${tier}; validação sugerida: perfil ${valEsc.recommended_profile}.`);
  if (propagation.layers.reconciliation_risk.tier !== "low") {
    out.add("Rever reconciliação plano vs executor (divergências detectadas).");
  }
  if (propagation.layers.validation_risk.tier !== "low") {
    out.add("Reforçar validação incremental antes de merge/apply.");
  }
  if (valEsc.extended_telemetry) {
    out.add("Activar telemetria estendida na validação em execuções semelhantes.");
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/**
 * @returns {{ analysis: object, manifest: object, skipped?: boolean }}
 */
function runRiskEngine(args) {
  const inputCtx = buildRiskInputContext(args);
  const factors = evaluateAllFactors(inputCtx);
  const weights = defaultFactorWeights();
  for (const f of factors) {
    const wt = weights[f.type];
    if (wt != null) f.weight = Math.max(0, Number(wt) || 0);
  }

  const { aggregate, tier } = aggregateWeightedScores(factors, weights);

  const plan = inputCtx.plan;
  const plan_id = plan && plan.plan_id != null ? String(plan.plan_id) : "";
  const run_id = inputCtx.runId;

  const hadValFail =
    factors.some(
      (f) =>
        f &&
        f.type === "validation_failures" &&
        f.evidence &&
        Number(f.evidence.failed_count) > 0,
    );

  const snapshot = {
    has_execution_plan: Boolean(plan && plan.plan_id),
    plan_present_but_empty_operations:
      Boolean(plan && Array.isArray(plan.operations) && plan.operations.length === 0),
    validation_expected_but_missing_results:
      Boolean(inputCtx.validationWasAttempted) &&
      (!inputCtx.validationResults ||
        !Array.isArray(inputCtx.validationResults.validators) ||
        inputCtx.validationResults.validators.length === 0),
    plan_present_but_reconciliation_missing:
      Boolean(plan && plan.plan_id) && !inputCtx.reconciliation,
    partial_validation: Boolean(
      inputCtx.validationResults &&
        inputCtx.validationResults.summary &&
        String(inputCtx.validationResults.summary.status || "").toLowerCase() === "partial",
    ),
    validators_skipped: factors.find((f) => f.type === "tooling_uncertainty")
      ? Number(
          factors.find((f) => f.type === "tooling_uncertainty").evidence.skipped || 0,
        )
      : 0,
    tooling_missing_signals: factors.find((f) => f.type === "tooling_uncertainty")
      ? Number(
          factors.find((f) => f.type === "tooling_uncertainty").evidence.missingTool || 0,
        )
      : 0,
  };

  const confidence = computeConfidence(snapshot);

  const maxSev = maxFactorSeverity(factors);

  const summary = {
    risk_score: aggregate,
    risk_tier: tier,
    confidence,
    requires_review: tier === "high" || tier === "critical" || hadValFail,
    requires_extended_validation: tier === "high" || tier === "critical" || hadValFail,
    requires_governance: tier === "critical" || maxSev === "critical",
    requires_sandbox:
      tier === "critical" &&
      factors.some(
        (f) => f.type === "operation_complexity" && String(f.severity) === "critical",
      ),
  };

  const propagation = buildRiskPropagation({ factors, aggregate, tier });

  const valEsc = validationEscalationRecommendations(tier, {
    validation_failures: hadValFail,
  });

  const review_hints = buildReviewHints(tier, factors, hadValFail);

  const signals = [
    {
      id: `aggregate_score.${aggregate}`,
      kind: "aggregate",
      tier,
      data: { aggregate },
    },
    {
      id: `max_severity.${maxSev}`,
      kind: "severity_cap",
      data: { max_severity: maxSev },
    },
  ];

  const review_escalation = {
    notes: [],
    hints: { ...review_hints },
  };
  if (review_hints.requires_double_review) {
    review_escalation.notes.push("Considerar segunda revisão humana independente.");
  }

  const governance_hints = {
    soft_blocks_suggested: summary.requires_governance,
    audit_trail_recommended: tier !== "low",
    policy_profile_hint:
      tier === "critical" ? "STRICT ou ENTERPRISE" : tier === "high" ? "NORMAL+" : null,
  };

  const orchestration_hints = {
    validation_escalation: valEsc,
    layer_tiers: {
      plan: propagation.layers.plan_risk.tier,
      reconciliation: propagation.layers.reconciliation_risk.tier,
      validation: propagation.layers.validation_risk.tier,
      operation: propagation.layers.operation_risk.tier,
      runtime: propagation.layers.runtime_risk.tier,
    },
    executor_behavior: "unchanged_phase43",
  };

  const analysis = buildRiskAnalysisContract({
    plan_id: plan_id || (plan && plan.plan_id != null ? String(plan.plan_id) : ""),
    run_id,
    factors,
    signals,
    recommendations: buildRecommendations(tier, propagation, valEsc),
    summary,
    review_hints,
    review_escalation,
    validation_escalation: valEsc,
    governance_hints,
    orchestration_hints,
    propagation_summary: {
      layers: propagation.layers,
      global: propagation.global,
    },
    metadata: {
      risk_engine_mode: process.env.SETUP_BOSS_RISK_ENGINE || "off",
      validation_mode: getValidationModeFromEnv(),
    },
  });

  const semanticRiskMode = getSemanticRiskPropagationModeFromEnv();

  const propagationManifestDocSemantic =
    semanticRiskMode === "shadow"
      ? readJsonSafe(path.join(inputCtx.outputDir, RISK_SEMANTIC_PROPAGATION_MANIFEST_REF))
      : null;

  const semanticMutationGraphDoc =
    semanticRiskMode === "shadow"
      ? readJsonSafe(path.join(inputCtx.outputDir, RISK_SEMANTIC_MUTATION_GRAPH_REF))
      : null;

  const semanticPropagationBlock = buildSemanticRiskPropagationBlock({
    mode: semanticRiskMode === "shadow" ? "shadow" : "off",
    propagationManifestDoc: propagationManifestDocSemantic,
    semanticGraphDoc: semanticMutationGraphDoc,
  });

  const manifest = buildRiskRuntimeManifest({
    outputDir: inputCtx.outputDir,
    analysis,
    propagation,
    run_id,
    telemetry_refs: {
      plan_events_embedded: Boolean(plan && plan.telemetry),
    },
    semantic_propagation: semanticPropagationBlock,
  });

  return { analysis, manifest, inputCtx, propagation, valEsc };
}

function extractRiskTelemetrySnapshot(ctx) {
  try {
    const snap =
      ctx && ctx.telemetry && typeof ctx.telemetry.snapshot === "function"
        ? ctx.telemetry.snapshot()
        : [];
    return snap
      .filter((e) => e && e.type && String(e.type).startsWith("risk_"))
      .slice(-64);
  } catch (_) {
    return [];
  }
}

/**
 * Persistência + metadatabest-effort para CLI/replay.
 */
function persistRiskArtifacts(outputDir, result, ctx) {
  const dir = String(outputDir || "");
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, RISK_ANALYSIS_FILENAME),
    JSON.stringify(result.analysis, null, 2),
    "utf8",
  );
  const enrichedManifest = {
    ...result.manifest,
    telemetry_embedded: extractRiskTelemetrySnapshot(ctx),
  };
  saveRiskRuntimeManifest(dir, enrichedManifest);

  try {
    savePlanArtifactsManifest(dir, {
      plan: readJsonSafe(path.join(dir, "execution-plan.json")) || loadPlan(dir),
      run_id: result.analysis.run_id,
      plan_id: result.analysis.plan_id,
    });
  } catch (_) {
    /* optional */
  }

  const metaPath = path.join(dir, "metadata.json");
  if (!fs.existsSync(metaPath)) return;

  try {
    const meta = readJsonSafe(metaPath);
    if (!meta || typeof meta !== "object") return;
    meta.execution = meta.execution && typeof meta.execution === "object" ? meta.execution : {};
    meta.execution.risk_analysis = {
      artifact: RISK_ANALYSIS_FILENAME,
      manifest: "risk-runtime-manifest.json",
      risk_score: result.analysis.summary.risk_score,
      risk_tier: result.analysis.summary.risk_tier,
      confidence: result.analysis.summary.confidence,
      risk_analysis_id: result.analysis.risk_analysis_id,
    };
    if (isRiskEngineOrchestrationActive()) {
      meta.execution.risk_orchestration_recommendations = {
        validation_profile: result.valEsc.recommended_profile,
        extended_telemetry: Boolean(result.valEsc.extended_telemetry),
        strict_policy_escalation: Boolean(result.valEsc.strict_policy_escalation),
        notes: result.analysis.recommendations.slice(0, 12),
      };
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    if (ctx && ctx.cache && typeof ctx.cache.invalidate === "function") {
      ctx.cache.invalidate(metaPath);
    }
  } catch (_) {
    /* never fail pipeline */
  }
}

/**
 * API principal — nunca lança para fora.
 */
function executeRiskPipeline({ ctx, outputDir, runId }) {
  const telemetry = ctx && ctx.telemetry;
  emitRiskTelemetry(telemetry, "risk_analysis_started", {
    run_id: runId,
    outputDir,
  });

  let result;
  try {
    result = runRiskEngine({ ctx, outputDir, runId });
  } catch (err) {
    emitRiskTelemetry(telemetry, "risk_analysis_completed", {
      run_id: runId,
      outcome: "error_swallowed",
      message: String((err && err.message) || err || "").slice(0, 400),
    });
    return { ok: false, error: err };
  }

  for (const f of result.analysis.factors || []) {
    emitRiskTelemetry(telemetry, "risk_factor_generated", {
      run_id: runId,
      factor_id: f.factor_id,
      type: f.type,
      severity: f.severity,
      score: f.score,
    });
  }

  emitRiskTelemetry(telemetry, "risk_propagation_completed", {
    run_id: runId,
    layers: Object.keys((result.propagation && result.propagation.layers) || {}),
  });

  const semTelemetryBundle =
    result.manifest && result.manifest.semantic_propagation && result.manifest.semantic_propagation.telemetry;

  emitRiskTelemetry(telemetry, "semantic_risk_propagation_completed", {
    run_id: runId,
    ...(semTelemetryBundle || {}),
  });

  if (result.analysis.summary.requires_extended_validation) {
    emitRiskTelemetry(telemetry, "risk_escalation_triggered", {
      run_id: runId,
      kind: "validation_depth",
      tier: result.analysis.summary.risk_tier,
    });
  }

  emitRiskTelemetry(telemetry, "risk_policy_applied", {
    run_id: runId,
    tier: result.analysis.summary.risk_tier,
    mode: process.env.SETUP_BOSS_RISK_ENGINE || "off",
  });

  emitRiskTelemetry(telemetry, "risk_analysis_completed", {
    run_id: runId,
    outcome: "ok",
    risk_tier: result.analysis.summary.risk_tier,
    risk_score: result.analysis.summary.risk_score,
  });

  try {
    persistRiskArtifacts(outputDir, result, ctx);
  } catch (_) {
    /* ignore */
  }

  return { ok: true, ...result };
}

module.exports = {
  buildRiskInputContext,
  runRiskEngine,
  executeRiskPipeline,
  persistRiskArtifacts,
};
