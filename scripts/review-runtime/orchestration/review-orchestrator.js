/**
 * Orquestração do review determinístico (Fase 4.4).
 * Não lança excepções para o pipeline; encapsula erros em { ok: false }.
 */

const fs = require("fs");
const path = require("path");
const { createEmptyReviewResults } = require("../contract/review-contract");
const { collectRuntimeSnapshot, readJsonSafe } = require("../lib/runtime-snapshot");
const { runStructuralReview } = require("../structural/structural-review-engine");
const { runSemanticReview } = require("../semantic/semantic-review-layer");
const {
  normalizeScores,
  applyInvariantPenalty,
  aggregateConfidence,
} = require("../scoring/review-scoring");
const { evaluateReviewPolicies, resolveSummaryStatus } = require("../policies/review-policies");
const {
  REVIEW_RESULTS_FILENAME,
  REVIEW_RUNTIME_MANIFEST_FILENAME,
  REVIEW_CORRECTION_HINTS_FILENAME,
  REVIEW_SEMANTIC_PROPAGATION_MANIFEST_REF,
  REVIEW_SEMANTIC_MUTATION_GRAPH_REF,
  REVIEW_SEMANTIC_PROPAGATION_ARTIFACT,
} = require("../constants");
const { getSemanticReviewPropagationModeFromEnv } = require("../feature-flags");
const { buildSemanticReviewPropagationBlock } = require("../semantic/semantic-review-propagation");
const { savePlanArtifactsManifest } = require("../../execution-plan/manifest/plan-artifacts-manifest");
const { validationFailed, riskTierCritical } = require("../invariants/validation-invariant");
const { emitReviewTelemetry } = require("../telemetry/review-telemetry");
const { resolveAcceptanceLevelForReview } = require("../lib/legacy-review-map");

function buildCorrectionHints({ structural, semantic, snapshot, policyOut }) {
  const hints = {
    invariant_violation_targets: structural.invariants
      .filter((i) => i.outcome === "fail")
      .map((i) => i.id),
    reconciliation_fix_required: snapshot.reconciliation
      ? snapshot.reconciliation.status === "divergent"
      : false,
    validation_fix_required: validationFailed(
      snapshot.validation_results && snapshot.validation_results.summary
        ? snapshot.validation_results.summary
        : snapshot.validation_results,
    ),
    semantic_fix_required: semantic.semantic_score < 70,
    policy_escalations: policyOut.escalation_hints || [],
  };
  return hints;
}

function invariantsToViolations(inv) {
  return inv
    .filter((i) => i.outcome === "fail")
    .map((i) => ({
      id: i.id,
      severity: i.severity,
      category: i.category,
      evidence: i.evidence,
      remediation_hints: i.remediation_hints,
    }));
}

function invariantsToWarnings(inv) {
  return inv
    .filter((i) => i.outcome === "warn")
    .map((i) => ({
      id: i.id,
      severity: i.severity,
      category: i.category,
      evidence: i.evidence,
    }));
}

function legacyFromDeterministic({ summaryStatus, policy, acceptanceLevel, score, violations, recommendations }) {
  let status = summaryStatus;
  let requires_correction = policy.requires_correction;

  if (status === "partial") {
    if (requires_correction) status = "rejected";
    else status = "blocked";
  }

  const blocking_issues = [];
  if (violations.length) {
    blocking_issues.push(
      ...violations.map((v) => `[${v.id}] ${v.category}: deterministic review`),
    );
  }
  if (status === "rejected" || status === "blocked") {
    if (policy.escalation_hints && policy.escalation_hints.length) {
      blocking_issues.push(...policy.escalation_hints);
    }
  }

  if (status === "approved" && blocking_issues.length > 0) {
    blocking_issues.length = 0;
  }

  const warnings = recommendations.slice(0, 40);

  if (status === "approved") {
    requires_correction = false;
  }
  if (status === "rejected" && !requires_correction && violations.length >= 3) {
    requires_correction = true;
  }

  const md = [
    `# Deterministic review (${status})`,
    "",
    `Score: ${score}`,
    "",
    "## Violations",
    violations.length ? violations.map((v) => `- ${v.id}`).join("\n") : "_nenhuma_",
    "",
  ].join("\n");

  return {
    status,
    acceptance_level: acceptanceLevel,
    blocking_issues,
    warnings,
    requires_correction,
    summary: `Deterministic review: ${status} (score ${score}).`,
    markdown_report: md,
  };
}

function writeJson(out, filePath, obj) {
  if (out && typeof out.writeJson === "function") out.writeJson(filePath, obj);
  else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
  }
}

function readSemanticReviewArtifact(outputDir, rel, io) {
  const full = path.join(String(outputDir || ""), rel);
  if (io && typeof io.readJsonIfExists === "function") {
    return io.readJsonIfExists(full, null);
  }
  return readJsonSafe(full);
}

/**
 * @param {object} opts
 * @param {string} opts.outputDir
 * @param {object} [opts.telemetry]
 * @param {"structural"|"full"} opts.reviewEngineMode
 * @param {object} [opts.outputFs]
 */
function runReviewOrchestration(opts) {
  const outputDir = String(opts.outputDir || "");
  const telemetry = opts.telemetry;
  const out = opts.outputFs || null;
  const mode = opts.reviewEngineMode === "full" ? "full" : "structural";

  try {
    emitReviewTelemetry(telemetry, "review_started", { mode });

    const io = out
      ? {
          readJsonIfExists: (p, fb) =>
            out.exists(p) ? out.readJson(p) : fb,
        }
      : null;

    const snapshot = collectRuntimeSnapshot(outputDir, io);

    const semRevMode = getSemanticReviewPropagationModeFromEnv();
    const propagationManifestDocSemantic =
      semRevMode === "shadow"
        ? readSemanticReviewArtifact(outputDir, REVIEW_SEMANTIC_PROPAGATION_MANIFEST_REF, io)
        : null;
    const semanticMutationGraphDocSemantic =
      semRevMode === "shadow"
        ? readSemanticReviewArtifact(outputDir, REVIEW_SEMANTIC_MUTATION_GRAPH_REF, io)
        : null;

    const semanticPropagationBlock = buildSemanticReviewPropagationBlock({
      mode: semRevMode === "shadow" ? "shadow" : "off",
      propagationManifestDoc: propagationManifestDocSemantic,
      semanticGraphDoc: semanticMutationGraphDocSemantic,
    });

    emitReviewTelemetry(telemetry, "semantic_review_propagation_completed", {
      ...(semanticPropagationBlock.telemetry || {}),
    });

    const planId =
      snapshot.plan && snapshot.plan.plan_id != null
        ? String(snapshot.plan.plan_id)
        : "";
    const runId =
      snapshot.metadata && snapshot.metadata.runId != null
        ? String(snapshot.metadata.runId)
        : snapshot.metadata && snapshot.metadata.run_id != null
          ? String(snapshot.metadata.run_id)
          : path.basename(path.resolve(outputDir));

    const structural = runStructuralReview(snapshot);
    emitReviewTelemetry(telemetry, "structural_review_completed", {
      structural_score: structural.structural_score,
      invariant_count: structural.invariants.length,
    });

    const semantic =
      mode === "full"
        ? runSemanticReview(snapshot)
        : { findings: [], semantic_score: 100, dimensions: {} };

    if (mode === "full") {
      emitReviewTelemetry(telemetry, "semantic_review_completed", {
        semantic_score: semantic.semantic_score,
        findings: semantic.findings.length,
      });
    }

    const riskDim = structural.dimensions.risk_consistency
      ? structural.dimensions.risk_consistency.score
      : 100;
    const valDim = structural.dimensions.validation_consistency
      ? structural.dimensions.validation_consistency.score
      : 100;

    let baseScore = normalizeScores({
      structural_score: structural.structural_score,
      semantic_score: semantic.semantic_score,
      risk_dimension_score: riskDim,
      validation_dimension_score: valDim,
    });

    const failInv = structural.invariants.filter((i) => i.outcome === "fail");
    const warnInv = structural.invariants.filter((i) => i.outcome === "warn");

    baseScore = applyInvariantPenalty(baseScore, structural.invariants);

    const conf = aggregateConfidence({
      structural,
      semantic,
      invariantFailCount: failInv.length,
    });

    const vrSummary =
      snapshot.validation_results && snapshot.validation_results.summary
        ? snapshot.validation_results.summary
        : null;
    const valFailed = validationFailed(vrSummary);

    const reconDiv =
      snapshot.reconciliation && snapshot.reconciliation.status === "divergent";

    const raSum =
      snapshot.risk_analysis && snapshot.risk_analysis.summary
        ? snapshot.risk_analysis.summary
        : snapshot.risk_analysis;
    const riskCrit = riskTierCritical(raSum);

    const policy = evaluateReviewPolicies({
      finalScore: baseScore,
      confidence: conf,
      invariantFailures: failInv.length,
      invariantWarnings: warnInv.length,
      validationFailed: valFailed,
      reconciliationDivergent: reconDiv,
      riskCritical: riskCrit,
      semanticLow: semantic.semantic_score < 72,
    });

    const blockedByPolicy =
      policy.policies_applied.includes("validation_plus_recon_block") && valFailed && reconDiv;

    const summaryStatus = resolveSummaryStatus({
      finalScore: baseScore,
      invariantFailures: failInv.length,
      blockedByPolicy,
      validationFailed: valFailed,
      reconciliationDivergent: reconDiv,
      riskCritical: riskCrit,
    });

    emitReviewTelemetry(telemetry, "review_score_calculated", {
      score: baseScore,
      confidence: conf,
      status: summaryStatus,
    });
    emitReviewTelemetry(telemetry, "review_policy_applied", {
      policies: policy.policies_applied,
    });

    for (const f of failInv) {
      emitReviewTelemetry(telemetry, "invariant_violation_detected", {
        id: f.id,
        severity: f.severity,
      });
    }

    const violations = invariantsToViolations(structural.invariants);
    const warnings = [
      ...invariantsToWarnings(structural.invariants),
      ...semantic.findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: "semantic",
        evidence: f.detail,
      })),
    ];

    const recommendations = [];
    for (const inv of structural.invariants) {
      if (Array.isArray(inv.remediation_hints)) {
        recommendations.push(...inv.remediation_hints.map((h) => `[${inv.id}] ${h}`));
      }
    }
    for (const sf of semantic.findings) {
      if (sf.hint) recommendations.push(`[${sf.id}] ${sf.hint}`);
    }

    const acceptanceLevel = resolveAcceptanceLevelForReview(snapshot);

    const results = createEmptyReviewResults({
      plan_id: planId,
      run_id: runId,
      review_engine_mode: mode,
      metadata: {
        structural_dimensions: structural.dimensions,
        semantic_dimensions: semantic.dimensions || {},
      },
    });

    results.summary = {
      status: summaryStatus,
      score: baseScore,
      confidence: conf,
      requires_correction: policy.requires_correction,
      requires_manual_review: policy.requires_manual_review,
    };

    results.structural_review = {
      structural_score: structural.structural_score,
      dimensions: structural.dimensions,
    };
    results.semantic_review =
      mode === "full"
        ? { semantic_score: semantic.semantic_score, findings: semantic.findings }
        : { skipped: true, reason: "SETUP_BOSS_REVIEW_ENGINE=structural" };

    results.policy_review = policy;
    results.runtime_review = {
      reconciliation_status: snapshot.reconciliation ? snapshot.reconciliation.status : null,
      validation_failed: valFailed,
      risk_critical: riskCrit,
    };
    results.violations = violations;
    results.warnings = warnings;
    results.recommendations = recommendations.slice(0, 200);

    const correctionHints = buildCorrectionHints({
      structural,
      semantic,
      snapshot,
      policyOut: policy,
    });
    results.correction_hints = correctionHints;

    results.extensions.semantic_propagation = semanticPropagationBlock;

    const legacy_review = legacyFromDeterministic({
      summaryStatus,
      policy,
      acceptanceLevel,
      score: baseScore,
      violations,
      recommendations: warnings.map((w) => w.id),
    });

    const manifest = {
      schema_version: 1,
      run_id: runId,
      plan_id: planId,
      generated_at: results.generated_at,
      review_id: results.review_id,
      scores: { final: baseScore, structural: structural.structural_score, semantic: semantic.semantic_score },
      invariant_counts: { fail: failInv.length, warn: warnInv.length },
      semantic_findings: semantic.findings,
      violations,
      recommendations: results.recommendations,
      policy_outcomes: policy.policies_applied,
      telemetry: { events_ref: "pipeline.telemetry + review_events" },
      replay_refs: {
        patch_manifest: snapshot.patch_manifest ? "patch-manifest.json" : null,
        checkpoints: snapshot.runtime_checkpoints ? "runtime-checkpoints.json" : null,
      },
      correction_hints_ref: REVIEW_CORRECTION_HINTS_FILENAME,
      semantic_propagation: semanticPropagationBlock,
      extensions: {},
    };

    try {
      if (fs.existsSync(path.join(outputDir, "transaction-runtime.json"))) {
        manifest.extensions.transaction_runtime = {
          contract_ref: "transaction-runtime.json",
        };
      }
    } catch (_) {
      /* best-effort */
    }

    try {
      const {
        saveDeterministicReviewArtifact,
        attachDeterministicReviewShadowToReviewResults,
      } = require("../deterministic-review-runtime");
      saveDeterministicReviewArtifact(outputDir, { outputFs: out });
      attachDeterministicReviewShadowToReviewResults(results);
    } catch (_) {
      /* Fase 4.11 shadow — observacional */
    }

    const resultsPath = path.join(outputDir, REVIEW_RESULTS_FILENAME);
    const manifestPath = path.join(outputDir, REVIEW_RUNTIME_MANIFEST_FILENAME);
    const hintsPath = path.join(outputDir, REVIEW_CORRECTION_HINTS_FILENAME);

    writeJson(out, resultsPath, results);
    writeJson(out, manifestPath, manifest);
    writeJson(out, hintsPath, correctionHints);

    if (semRevMode === "shadow") {
      writeJson(
        out,
        path.join(outputDir, REVIEW_SEMANTIC_PROPAGATION_ARTIFACT),
        semanticPropagationBlock,
      );
    }

    try {
      savePlanArtifactsManifest(outputDir, { plan: snapshot.plan, run_id: runId, plan_id: planId });
      const pArt = path.join(outputDir, "plan-artifacts.json");
      if (fs.existsSync(pArt)) {
        const merged = JSON.parse(fs.readFileSync(pArt, "utf-8"));
        merged.artifacts = merged.artifacts || {};
        merged.artifacts.extensions = merged.artifacts.extensions || {};
        merged.artifacts.extensions.review_runtime = {
          review_results: REVIEW_RESULTS_FILENAME,
          review_runtime_manifest: REVIEW_RUNTIME_MANIFEST_FILENAME,
          ...(semRevMode === "shadow"
            ? { review_semantic_propagation: REVIEW_SEMANTIC_PROPAGATION_ARTIFACT }
            : {}),
        };
        fs.writeFileSync(pArt, JSON.stringify(merged, null, 2), "utf-8");
      }
    } catch (_) {
      /* best-effort */
    }

    emitReviewTelemetry(telemetry, "review_completed", { review_id: results.review_id, status: summaryStatus });

    return {
      ok: true,
      review_results: results,
      review_manifest: manifest,
      legacy_review,
      correction_hints: correctionHints,
    };
  } catch (err) {
    emitReviewTelemetry(telemetry, "review_engine_error", {
      message: err && err.message ? String(err.message) : "unknown",
    });
    return {
      ok: false,
      error: err && err.message ? String(err.message) : String(err),
    };
  }
}

module.exports = { runReviewOrchestration, legacyFromDeterministic };
