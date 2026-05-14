/**
 * Preflight Analyzer — estimativa preditiva antes do architect/scan completo.
 */

const fs = require("fs");
const path = require("path");
const { collectProjectLite } = require("./project-lite");
const {
  scoreKeywords,
  extractPathHints,
  classifyCorrectionProbability,
  classifyOperationalSeverity,
} = require("./heuristics");
const { aggregateRunsForProject } = require("./historical-intelligence");
const {
  estimateFileRange,
  likelyAffectedPaths,
  inferChangeTypes,
} = require("./scope-estimator");
const { computeRiskPoints } = require("./risk-engine");
const { estimateStageChars, summarizeCosts } = require("./cost-estimator");

function tierComplexity(score) {
  if (score <= 6) return "LOW";
  if (score <= 12) return "MEDIUM";
  if (score <= 20) return "HIGH";
  return "EXTREME";
}

function computeComplexityScore(input) {
  const {
    taskChars,
    taskLines,
    keywordMeta,
    fileRange,
    crossLayer,
    pathHints,
    projectLite,
    historical,
  } = input;

  let score = 0;

  if (taskChars > 1500) score += 2;
  if (taskChars > 4500) score += 3;
  if (taskChars > 12000) score += 4;

  if (taskLines > 40) score += 2;
  if (taskLines > 120) score += 3;

  const { hits } = keywordMeta;
  if (hits.integration) score += 2;
  if (hits.refactor) score += 3;
  if (hits.orchestration) score += 2;
  if (hits.security) score += 2;
  if (hits.database) score += 1;

  if (crossLayer) score += 4;

  if (pathHints.runtime_core) score += 4;

  const span = fileRange.max - fileRange.min;
  score += Math.min(6, Math.round(span / 3));
  score += Math.min(5, Math.round(fileRange.max / 5));

  if (projectLite && projectLite.fileCount > 900) score += 2;
  if (projectLite && projectLite.fileCount > 4000) score += 2;

  const agg = historical && historical.aggregates ? historical.aggregates : {};
  if (
    agg.avg_correction_iterations != null &&
    agg.avg_correction_iterations >= 1.5
  ) {
    score += 3;
  }

  if (hits.noop_docs) score = Math.max(0, score - 5);

  return Math.round(score);
}

function correctionScorePoints(keywordMeta, fileRange, historical) {
  let pts = 0;
  const { hits } = keywordMeta;
  if (hits.refactor) pts += 2;
  if (hits.integration) pts += 1;
  if (hits.orchestration) pts += 2;
  if (fileRange.max >= 10) pts += 2;
  if (fileRange.max >= 14) pts += 2;

  const agg = historical && historical.aggregates ? historical.aggregates : {};
  if (
    agg.avg_correction_iterations != null &&
    agg.avg_correction_iterations >= 1.2
  )
    pts += 2;

  return pts;
}

function buildWarnings({
  complexityTier,
  riskTier,
  keywordMeta,
  crossLayer,
  pathHints,
  fileRange,
  costTotals,
  historical,
  scanUsesCache,
  projectLite,
}) {
  const warnings = [];
  const push = (code, message) => {
    if (!warnings.some((w) => w.code === code)) warnings.push({ code, message });
  };

  if (fileRange.max >= 12) {
    push(
      "wide_scope",
      "Probabilidade elevada de allowed_files amplo (> ~10 ficheiros).",
    );
  }

  if (keywordMeta.hits.integration) {
    push("integration_task", "Task parece envolver integração / IO externo.");
  }

  if (crossLayer) {
    push(
      "cross_layer",
      "Alterações potencialmente multi-camada (ex.: UI + backend ou dados).",
    );
  }

  if (pathHints.runtime_core || keywordMeta.hits.orchestration) {
    push(
      "runtime_touch",
      "Sinais de mudança em orquestração / runtime do Setup-Boss ou scripts núcleo.",
    );
  }

  if (
    costTotals &&
    typeof costTotals.est_prompt_chars_sum === "number" &&
    costTotals.est_prompt_chars_sum > 100_000
  ) {
    push(
      "large_prompt",
      `Prompt total estimado > ~100k chars (≈ ${costTotals.est_prompt_chars_sum}).`,
    );
  }

  const agg = historical && historical.aggregates ? historical.aggregates : {};
  if (
    agg.avg_correction_iterations != null &&
    agg.avg_correction_iterations >= 1.6
  ) {
    push(
      "historical_corrections",
      "Histórico recente deste projeto com taxa alta de correction loops.",
    );
  }

  if (
    agg.avg_cost_usd != null &&
    costTotals &&
    costTotals.estimated_cost_usd_mid != null &&
    costTotals.estimated_cost_usd_mid > (agg.avg_cost_usd || 0) * 1.65
  ) {
    push(
      "cost_above_recent_avg",
      "Custo estimado acima da média das últimas corridas registadas.",
    );
  }

  if (!scanUsesCache && projectLite && projectLite.fileCount > 600) {
    push(
      "fresh_scan_large_tree",
      "Scan fresco num projeto volumoso — primeira etapa pode ser mais pesada.",
    );
  }

  if (riskTier === "HIGH" || riskTier === "CRITICAL") {
    push("risk_elevated", `Risco operacional elevado (${riskTier}).`);
  }

  if (complexityTier === "EXTREME") {
    push("complexity_extreme", "Complexidade estimada EXTREME — rever escopo antes de continuar.");
  }

  return warnings.slice(0, 10);
}

/**
 * @param {{
 *   taskPath: string,
 *   taskContent: string,
 *   projectRootAbs: string,
 *   setupBossRepoRoot: string,
 *   scanUsesCache: boolean,
 * }} params
 */
function analyzePreflight(params) {
  const taskContent = String(params.taskContent || "");
  const taskChars = taskContent.length;
  const taskLines = taskContent.split(/\r?\n/).length;

  const keywordMeta = scoreKeywords(taskContent.toLowerCase());
  const pathHints = extractPathHints(taskContent);

  const projectLite = collectProjectLite(params.projectRootAbs);

  const historical = aggregateRunsForProject({
    setupBossRepoRoot: params.setupBossRepoRoot,
    projectRootAbs: params.projectRootAbs,
    maxRuns: 24,
  });

  const histAvgFiles = historical.aggregates.avg_files_changed;

  const fileRange = estimateFileRange({
    taskChars,
    keywordHits: keywordMeta.hits,
    crossLayer: keywordMeta.crossLayer,
    projectLite,
    pathHints,
    historicalAvgFiles: histAvgFiles,
  });

  const midFiles = Math.round((fileRange.min + fileRange.max) / 2);

  const stageEst = estimateStageChars({
    taskChars,
    estimatedFilesMid: Math.max(1, midFiles),
    projectLite,
    historicalAvgPrompt: historical.aggregates.avg_prompt_chars,
    scanUsesCache: params.scanUsesCache === true,
  });

  const costPack = summarizeCosts(stageEst.by_stage_chars);

  const complexityScore = computeComplexityScore({
    taskChars,
    taskLines,
    keywordMeta,
    fileRange,
    crossLayer: keywordMeta.crossLayer,
    pathHints,
    projectLite,
    historical,
  });

  const complexityTier = tierComplexity(complexityScore);

  const risk = computeRiskPoints({
    estimatedFilesMax: fileRange.max,
    crossLayer: keywordMeta.crossLayer,
    pathHints,
    keywordHits: keywordMeta.hits,
    projectLite,
    historical,
    inflationHint: historical.aggregates.avg_inflation_ratio,
  });

  const corrPts = correctionScorePoints(keywordMeta, fileRange, historical);
  const correctionProb = classifyCorrectionProbability(
    corrPts,
    historical.aggregates.avg_correction_iterations,
  );

  const operationalSeverity = classifyOperationalSeverity(
    complexityTier,
    risk.tier,
  );

  const iaMarkerDir = path.join(params.projectRootAbs, ".IA");
  let iaMarkerCount = 0;
  if (fs.existsSync(iaMarkerDir)) {
    try {
      iaMarkerCount = fs
        .readdirSync(iaMarkerDir)
        .filter((n) => n.endsWith(".md")).length;
    } catch (_) {
      iaMarkerCount = 0;
    }
  }

  const warnings = buildWarnings({
    complexityTier,
    riskTier: risk.tier,
    keywordMeta,
    crossLayer: keywordMeta.crossLayer,
    pathHints,
    fileRange,
    costTotals: costPack.totals,
    historical,
    scanUsesCache: params.scanUsesCache === true,
    projectLite,
  });

  const rationale = [
    `task: ${taskChars} chars / ${taskLines} linhas`,
    `projeto: ~${projectLite.fileCount} ficheiros visíveis (amostra limitada, depth≤${5})`,
    `corrida histórico: ${historical.aggregates.samples_used} runs analisadas no índice`,
    keywordMeta.crossLayer ? "multi-camada textualmente sugerido" : "camada única ou foco restrito",
    params.scanUsesCache ? "scan_cache provável — menos texto na etapa scan" : "scan fresco — mais contexto na etapa scan",
  ];

  return {
    schema_version: "2.4c",
    generated_at: new Date().toISOString(),
    inputs: {
      task_path: params.taskPath,
      project_root: params.projectRootAbs,
      scan_uses_cache: params.scanUsesCache === true,
    },
    ia_context: {
      markdown_markers_present: iaMarkerCount,
      problem_history_tail_errors:
        historical.problem_history &&
        historical.problem_history.recent_errors,
    },
    complexity: {
      score: complexityScore,
      tier: complexityTier,
    },
    scope: {
      estimated_files_min: fileRange.min,
      estimated_files_max: fileRange.max,
      likely_affected: likelyAffectedPaths({
        keywordHits: keywordMeta.hits,
        crossLayer: keywordMeta.crossLayer,
        pathHints,
        projectLite,
      }),
      change_types: inferChangeTypes(keywordMeta.hits),
    },
    prompts: {
      by_stage_chars: stageEst.by_stage_chars,
      inflation_factor_applied: stageEst.inflation_factor_applied,
      totals: {
        est_prompt_chars_sum: costPack.totals.est_prompt_chars_sum,
        est_tokens_sum: costPack.totals.est_tokens_sum,
        est_tokens_band_low: costPack.totals.est_tokens_optimistic,
        est_tokens_band_high: costPack.totals.est_tokens_pessimistic,
      },
    },
    cost: {
      pricing_available: costPack.totals.pricing_available,
      estimated_cost_usd_mid: costPack.totals.estimated_cost_usd_mid,
      estimated_cost_usd_low: costPack.totals.estimated_cost_usd_optimistic,
      estimated_cost_usd_high: costPack.totals.estimated_cost_usd_pessimistic,
      by_step: costPack.steps,
    },
    risk: {
      tier: risk.tier,
      score_points: risk.points,
    },
    correction: {
      probability_label: correctionProb.label,
      rationale: correctionProb.rationale,
    },
    operational_severity: operationalSeverity,
    warnings,
    historical_intelligence: {
      scoped_project_hits: historical.scoped_project_hits,
      looked_up_runs: historical.looked_up_runs,
      aggregates: historical.aggregates,
      problem_history: historical.problem_history,
    },
    rationale,
    baseline_assumptions: [
      "Heurísticas locais — não chamadas LLM nem APIs externas.",
      "Tokens ≈ chars/4; custo só se variáveis *_USD_PER_1M estiverem definidas por modelo.",
      "Escopo inferido sem architect — alto íncerto para tasks ambíguas.",
      "Histórico limitado ao índice .setup-boss/runs deste repositório Setup-Boss.",
    ],
  };
}

module.exports = {
  analyzePreflight,
  tierComplexity,
};
