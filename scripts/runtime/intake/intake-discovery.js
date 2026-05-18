"use strict";

const { ROOT_DIR } = require("../../../core/run-resolver");
const { IA_FILES } = require("../../ensure-ia");
const { collectProjectLite } = require("../preflight/project-lite");
const { analyzePreflight } = require("../preflight/analyzer");

/**
 * @param {string} tier
 * @returns {"low"|"medium"|"high"|"unknown"}
 */
function tierToComplexityHint(tier) {
  const t = String(tier || "").toUpperCase();
  if (t === "LOW") return "low";
  if (t === "MEDIUM") return "medium";
  if (t === "HIGH" || t === "EXTREME") return "high";
  return "unknown";
}

/**
 * @param {string} tier
 * @returns {"low"|"medium"|"high"|"unknown"}
 */
function tierToRiskHint(tier) {
  const t = String(tier || "").toUpperCase();
  if (t === "LOW") return "low";
  if (t === "MEDIUM") return "medium";
  if (t === "HIGH" || t === "CRITICAL") return "high";
  return "unknown";
}

/**
 * @param {number} max
 * @returns {"small"|"medium"|"large"|"unknown"}
 */
function maxFilesToScopeHint(max) {
  const n = Number(max);
  if (!Number.isFinite(n)) return "unknown";
  if (n <= 5) return "small";
  if (n <= 12) return "medium";
  return "large";
}

/**
 * @param {object} iaSummary
 * @param {string} taskContent
 * @param {number} problemHistoryTailErrors
 */
function collectNeedsContextSignals(iaSummary, taskContent, problemHistoryTailErrors) {
  /** @type {string[]} */
  const out = [];
  if (iaSummary.status === "partial") {
    out.push("ia_baseline_incomplete");
  }
  if (iaSummary.files_missing.length > 0) {
    out.push("ia_missing_required_files");
  }
  const trimmed = String(taskContent || "").trim();
  if (trimmed.length > 0 && trimmed.length < 40) {
    out.push("task_description_short");
  }
  const errTail = Number(problemHistoryTailErrors || 0);
  if (errTail >= 4) {
    out.push("problem_history_recent_errors_elevated");
  }
  return out;
}

/**
 * @param {string} operationalSeverity
 * @param {string} riskTier
 */
function collectBlockedSignals(operationalSeverity, riskTier) {
  /** @type {string[]} */
  const out = [];
  if (String(operationalSeverity || "").toUpperCase() === "CRITICAL") {
    out.push("operational_severity_critical");
  }
  if (String(riskTier || "").toUpperCase() === "CRITICAL") {
    out.push("risk_tier_critical");
  }
  return out;
}

/**
 * Análise discovery determinística (sem LLM): reutiliza heurísticas do preflight + project-lite.
 *
 * @param {{
 *   projectRootAbs: string,
 *   taskResolved: { kind: string, path: string|null, content: string, preview: string },
 *   iaSummary: object,
 *   setupBossRepoRoot?: string,
 *   generatedAt: string,
 * }} args
 */
function buildIntakeDiscoveryAnalysis(args) {
  const {
    projectRootAbs,
    taskResolved,
    iaSummary,
    setupBossRepoRoot = ROOT_DIR,
    generatedAt,
  } = args;

  const taskContent = String(taskResolved.content || "");
  const taskPath = taskResolved.path ? String(taskResolved.path) : "";

  const projectLite = collectProjectLite(projectRootAbs);

  const report = analyzePreflight({
    taskContent,
    taskPath,
    projectRootAbs,
    setupBossRepoRoot,
    scanUsesCache: false,
  });

  const complexity_hint = tierToComplexityHint(report.complexity && report.complexity.tier);
  const risk_hint = tierToRiskHint(report.risk && report.risk.tier);
  const scope_hint = maxFilesToScopeHint(
    report.scope && report.scope.estimated_files_max,
  );

  const phErrors =
    report.ia_context && report.ia_context.problem_history_tail_errors != null
      ? report.ia_context.problem_history_tail_errors
      : 0;

  const needs_context_signals = collectNeedsContextSignals(
    iaSummary,
    taskContent,
    phErrors,
  );

  const blocked_signals = collectBlockedSignals(
    report.operational_severity,
    report.risk && report.risk.tier,
  );

  const iaFilesPresent = IA_FILES.filter((f) => !iaSummary.files_missing.includes(f));

  return {
    schema_version: "1.0.0",
    generated_at: generatedAt,
    task: {
      source: taskResolved.kind === "file" ? "file" : "inline",
      preview: taskResolved.preview,
      length: taskContent.length,
    },
    project: {
      root: projectRootAbs,
      signals: {
        lite_file_count: projectLite.fileCount,
        lite_dir_count: projectLite.dirCount,
        lite_truncated: projectLite.truncated,
        lite_categories: { ...projectLite.categories },
        historical_runs_sampled:
          report.historical_intelligence &&
          report.historical_intelligence.aggregates &&
          report.historical_intelligence.aggregates.samples_used != null
            ? report.historical_intelligence.aggregates.samples_used
            : 0,
      },
    },
    ia_context: {
      status: iaSummary.status,
      files_found: iaFilesPresent,
      files_missing: iaSummary.files_missing.slice(),
      total_chars: iaSummary.total_chars,
    },
    discovery_signals: {
      complexity_hint,
      scope_hint,
      risk_hint,
      needs_context_signals,
      blocked_signals,
    },
  };
}

/**
 * @param {ReturnType<typeof buildIntakeDiscoveryAnalysis>} analysis
 */
function discoveryPhaseForRunContext(analysis) {
  const { complexity_hint, scope_hint, risk_hint } = analysis.discovery_signals;
  return {
    status: "analysis_ready",
    artifact: "intake-discovery-analysis.json",
    complexity_hint,
    scope_hint,
    risk_hint,
  };
}

module.exports = {
  buildIntakeDiscoveryAnalysis,
  discoveryPhaseForRunContext,
  tierToComplexityHint,
  tierToRiskHint,
  maxFilesToScopeHint,
};
