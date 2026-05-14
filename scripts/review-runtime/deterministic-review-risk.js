/**
 * Fase 4.11.4 — Modelo de risco determinístico para deterministic-review (observacional).
 *
 * Regras fixas, ordenação determinística, sem timestamps no modelo.
 * Não bloqueia pipeline; apenas agrega evidência para auditoria e comparação entre runs.
 */

"use strict";

/** Contrato do modelo (auditabilidade / comparabilidade de artefactos). */
const DETERMINISTIC_REVIEW_RISK_MODEL_VERSION = "deterministic-review-risk/1";

/** Pesos por código estável (prioridade sobre tipo/severity genéricos). */
const RISK_WEIGHT_BY_CODE = Object.freeze({
  validation_command_failed: 42,
  validation_cache_inconsistent: 18,
  semantic_cache_plan_identity_mismatch: 18,
  graph_candidates_cap_hit: 14,
  dependency_graph_truncated: 14,
  unresolved_validator: 10,
});

const RISK_WEIGHT_STRUCTURAL_ERROR = 34;
const RISK_WEIGHT_STRUCTURAL_WARNING = 12;
const RISK_WEIGHT_SEMANTIC_WARNING = 7;
const RISK_WEIGHT_SEMANTIC_ERROR = 24;
const RISK_WEIGHT_VALIDATION_WARNING = 9;
const RISK_WEIGHT_CACHE_WARNING = 18;
const RISK_WEIGHT_GRAPH_WARNING = 14;
const RISK_WEIGHT_INFO = 1;
const RISK_WEIGHT_WARNING_FALLBACK = 8;
const RISK_WEIGHT_ERROR_FALLBACK = 28;

/** Limites de nível global (score inteiro + contagens). Documentados no próprio summary (`threshold_rules`). */
const THRESHOLD_CRITICAL_SCORE = 100;
const THRESHOLD_HIGH_SCORE = 55;
const THRESHOLD_MEDIUM_SCORE = 20;
const THRESHOLD_CRITICAL_VALIDATION_FAILS = 2;
const THRESHOLD_CRITICAL_STRUCTURAL_ERRORS = 5;
const THRESHOLD_HIGH_VALIDATION_FAILS = 1;
const THRESHOLD_HIGH_STRUCTURAL_ERRORS = 2;
const THRESHOLD_HIGH_CACHE_ISSUES = 2;
const THRESHOLD_MEDIUM_STRUCTURAL_ERRORS = 1;
const THRESHOLD_MEDIUM_GRAPH_TRUNCATIONS = 1;
const THRESHOLD_MEDIUM_WARNINGS_TOTAL = 8;

const GRAPH_TRUNCATION_CODES = new Set(["graph_candidates_cap_hit", "dependency_graph_truncated"]);

const CACHE_INCONSISTENCY_CODES = new Set([
  "validation_cache_inconsistent",
  "semantic_cache_plan_identity_mismatch",
]);

function findingRiskWeight(f) {
  if (!f || typeof f !== "object") return 0;
  const code = String(f.code || "");
  if (RISK_WEIGHT_BY_CODE[code] != null) return RISK_WEIGHT_BY_CODE[code];

  const ty = String(f.type || "");
  const sev = String(f.severity || "");

  if (ty === "structural") {
    if (sev === "error") return RISK_WEIGHT_STRUCTURAL_ERROR;
    if (sev === "warning") return RISK_WEIGHT_STRUCTURAL_WARNING;
  }
  if (ty === "semantic") {
    if (sev === "error") return RISK_WEIGHT_SEMANTIC_ERROR;
    if (sev === "warning") return RISK_WEIGHT_SEMANTIC_WARNING;
  }
  if (ty === "validation") {
    if (sev === "error") return RISK_WEIGHT_ERROR_FALLBACK;
    if (sev === "warning") return RISK_WEIGHT_VALIDATION_WARNING;
  }
  if (ty === "graph") {
    if (sev === "warning" || sev === "error") return RISK_WEIGHT_GRAPH_WARNING;
  }
  if (ty === "cache") {
    if (sev === "warning" || sev === "error") return RISK_WEIGHT_CACHE_WARNING;
    if (sev === "info") return RISK_WEIGHT_INFO;
  }

  if (sev === "error") return RISK_WEIGHT_ERROR_FALLBACK;
  if (sev === "warning") return RISK_WEIGHT_WARNING_FALLBACK;
  if (sev === "info") return RISK_WEIGHT_INFO;
  return RISK_WEIGHT_WARNING_FALLBACK;
}

function aggregateBuckets(findings) {
  const by_severity = { error: 0, warning: 0, info: 0 };
  const by_type = {};
  const by_code = {};

  let structural_errors = 0;
  let semantic_warnings = 0;
  let validation_failures = 0;
  let graph_truncations = 0;
  let cache_inconsistencies = 0;

  const list = Array.isArray(findings) ? findings : [];
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const sev = String(f.severity || "");
    if (sev === "error") by_severity.error += 1;
    else if (sev === "warning") by_severity.warning += 1;
    else if (sev === "info") by_severity.info += 1;

    const ty = String(f.type || "unknown");
    by_type[ty] = (by_type[ty] || 0) + 1;

    const c = String(f.code || "");
    if (c) by_code[c] = (by_code[c] || 0) + 1;

    if (ty === "structural" && sev === "error") structural_errors += 1;
    if (ty === "semantic" && sev === "warning") semantic_warnings += 1;
    if (c === "validation_command_failed") validation_failures += 1;
    if (GRAPH_TRUNCATION_CODES.has(c)) graph_truncations += 1;
    if (CACHE_INCONSISTENCY_CODES.has(c)) cache_inconsistencies += 1;
  }

  const by_type_ordered = {};
  for (const k of Object.keys(by_type).sort((a, b) => a.localeCompare(b))) {
    by_type_ordered[k] = by_type[k];
  }
  const by_code_ordered = {};
  for (const k of Object.keys(by_code).sort((a, b) => a.localeCompare(b))) {
    by_code_ordered[k] = by_code[k];
  }

  return {
    by_severity,
    by_type: by_type_ordered,
    by_code: by_code_ordered,
    structural_errors,
    semantic_warnings,
    validation_failures,
    graph_truncations,
    cache_inconsistencies,
  };
}

function computeRiskScore(findings) {
  const list = Array.isArray(findings) ? findings : [];
  let score = 0;
  for (const f of list) {
    score += findingRiskWeight(f);
  }
  return score;
}

function resolveOverallLevel(score, agg, summary) {
  const vf = agg.validation_failures;
  const se = agg.structural_errors;
  const ci = agg.cache_inconsistencies;
  const gt = agg.graph_truncations;
  const warningsTotal =
    summary && summary.warnings_total != null ? Number(summary.warnings_total) : agg.by_severity.warning;

  if (
    score >= THRESHOLD_CRITICAL_SCORE ||
    vf >= THRESHOLD_CRITICAL_VALIDATION_FAILS ||
    se >= THRESHOLD_CRITICAL_STRUCTURAL_ERRORS
  ) {
    return "critical";
  }
  if (
    score >= THRESHOLD_HIGH_SCORE ||
    vf >= THRESHOLD_HIGH_VALIDATION_FAILS ||
    se >= THRESHOLD_HIGH_STRUCTURAL_ERRORS ||
    ci >= THRESHOLD_HIGH_CACHE_ISSUES
  ) {
    return "high";
  }
  if (
    score >= THRESHOLD_MEDIUM_SCORE ||
    se >= THRESHOLD_MEDIUM_STRUCTURAL_ERRORS ||
    gt >= THRESHOLD_MEDIUM_GRAPH_TRUNCATIONS ||
    warningsTotal >= THRESHOLD_MEDIUM_WARNINGS_TOTAL
  ) {
    return "medium";
  }
  return "low";
}

/**
 * Destaques curtos, ordenação determinística por etiqueta fixa.
 * @param {object} agg
 * @returns {string[]}
 */
function buildHighlights(agg) {
  /** @type {Array<{ key: string, text: string }>} */
  const rows = [];
  if (agg.validation_failures > 0) {
    rows.push({
      key: "01_validation_failures",
      text: `validação: ${agg.validation_failures} falha(s) de comando`,
    });
  }
  if (agg.structural_errors > 0) {
    rows.push({
      key: "02_structural_errors",
      text: `estrutura: ${agg.structural_errors} erro(s)`,
    });
  }
  if (agg.cache_inconsistencies > 0) {
    rows.push({
      key: "03_cache_inconsistencies",
      text: `cache: ${agg.cache_inconsistencies} inconsistência(s)`,
    });
  }
  if (agg.graph_truncations > 0) {
    rows.push({
      key: "04_graph_truncations",
      text: `grafo: ${agg.graph_truncations} truncação(ões)`,
    });
  }
  if (agg.semantic_warnings > 0) {
    rows.push({
      key: "05_semantic_warnings",
      text: `semântica: ${agg.semantic_warnings} aviso(s)`,
    });
  }
  const uv = agg.by_code.unresolved_validator || 0;
  if (uv > 0) {
    rows.push({
      key: "06_unresolved_validators",
      text: `validação: ${uv} validator(es) não resolvido(s)`,
    });
  }
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows.map((r) => r.text);
}

function buildTopRiskFindings(findings, limit = 10) {
  const list = Array.isArray(findings) ? findings.slice() : [];
  const enriched = list.map((f) => ({
    finding_id: f && f.finding_id != null ? String(f.finding_id) : "",
    code: f && f.code != null ? String(f.code) : "",
    type: f && f.type != null ? String(f.type) : "",
    severity: f && f.severity != null ? String(f.severity) : "",
    risk_weight: findingRiskWeight(f),
  }));
  enriched.sort((a, b) => {
    if (b.risk_weight !== a.risk_weight) return b.risk_weight - a.risk_weight;
    const c = a.code.localeCompare(b.code);
    if (c !== 0) return c;
    return a.finding_id.localeCompare(b.finding_id);
  });
  return enriched.slice(0, Math.max(0, limit));
}

/**
 * @param {object[]} findings — já ordenados pelo runtime (mantém-se para replay consistente).
 * @param {object|null} [summary] — summary do documento deterministic-review (opcional).
 * @returns {object}
 */
function computeDeterministicReviewRiskSummary(findings, summary = null) {
  const aggFull = aggregateBuckets(findings);
  const risk_score = computeRiskScore(findings);
  const overall_risk_level = resolveOverallLevel(risk_score, aggFull, summary);

  const {
    by_severity,
    by_type,
    by_code,
    structural_errors,
    semantic_warnings,
    validation_failures,
    graph_truncations,
    cache_inconsistencies,
  } = aggFull;

  return {
    overall_risk_level,
    risk_score,
    structural_errors,
    semantic_warnings,
    validation_failures,
    graph_truncations,
    cache_inconsistencies,
    highlights: buildHighlights(aggFull),
    aggregation: {
      by_severity,
      by_type,
      by_code,
    },
    top_risk_findings: buildTopRiskFindings(findings, 10),
    score_model: {
      version: DETERMINISTIC_REVIEW_RISK_MODEL_VERSION,
      weights: {
        by_code: { ...RISK_WEIGHT_BY_CODE },
        structural_error: RISK_WEIGHT_STRUCTURAL_ERROR,
        structural_warning: RISK_WEIGHT_STRUCTURAL_WARNING,
        semantic_warning: RISK_WEIGHT_SEMANTIC_WARNING,
        semantic_error: RISK_WEIGHT_SEMANTIC_ERROR,
        validation_warning: RISK_WEIGHT_VALIDATION_WARNING,
        graph_warning: RISK_WEIGHT_GRAPH_WARNING,
        cache_warning: RISK_WEIGHT_CACHE_WARNING,
        info: RISK_WEIGHT_INFO,
        warning_fallback: RISK_WEIGHT_WARNING_FALLBACK,
        error_fallback: RISK_WEIGHT_ERROR_FALLBACK,
      },
      threshold_rules: {
        critical: {
          min_score: THRESHOLD_CRITICAL_SCORE,
          min_validation_failures: THRESHOLD_CRITICAL_VALIDATION_FAILS,
          min_structural_errors: THRESHOLD_CRITICAL_STRUCTURAL_ERRORS,
        },
        high: {
          min_score: THRESHOLD_HIGH_SCORE,
          min_validation_failures: THRESHOLD_HIGH_VALIDATION_FAILS,
          min_structural_errors: THRESHOLD_HIGH_STRUCTURAL_ERRORS,
          min_cache_inconsistencies: THRESHOLD_HIGH_CACHE_ISSUES,
        },
        medium: {
          min_score: THRESHOLD_MEDIUM_SCORE,
          min_structural_errors: THRESHOLD_MEDIUM_STRUCTURAL_ERRORS,
          min_graph_truncations: THRESHOLD_MEDIUM_GRAPH_TRUNCATIONS,
          min_warnings_total: THRESHOLD_MEDIUM_WARNINGS_TOTAL,
        },
      },
    },
  };
}

/**
 * @param {object|null} doc
 * @returns {object|null}
 */
function resolveRiskSummaryFromDocument(doc) {
  if (!doc || typeof doc !== "object") return null;
  const findings = Array.isArray(doc.findings) ? doc.findings : [];
  const sm = doc.summary && typeof doc.summary === "object" ? doc.summary : {};
  if (doc.risk_summary && typeof doc.risk_summary === "object" && doc.risk_summary.overall_risk_level != null) {
    return doc.risk_summary;
  }
  return computeDeterministicReviewRiskSummary(findings, sm);
}

/**
 * @param {object|null} full
 * @returns {object|null}
 */
function compactRiskSummaryForInspect(full) {
  if (!full || typeof full !== "object") return null;
  return {
    overall_risk_level: full.overall_risk_level,
    risk_score: full.risk_score,
    structural_errors: full.structural_errors,
    semantic_warnings: full.semantic_warnings,
    validation_failures: full.validation_failures,
    graph_truncations: full.graph_truncations,
    cache_inconsistencies: full.cache_inconsistencies,
    highlights: Array.isArray(full.highlights) ? full.highlights.slice(0, 12) : [],
    top_risk_findings: Array.isArray(full.top_risk_findings) ? full.top_risk_findings.slice(0, 10) : [],
    aggregation: full.aggregation && typeof full.aggregation === "object" ? full.aggregation : null,
    score_model_version:
      full.score_model && full.score_model.version != null ? String(full.score_model.version) : null,
  };
}

module.exports = {
  DETERMINISTIC_REVIEW_RISK_MODEL_VERSION,
  computeDeterministicReviewRiskSummary,
  findingRiskWeight,
  aggregateBuckets,
  resolveRiskSummaryFromDocument,
  compactRiskSummaryForInspect,
};
