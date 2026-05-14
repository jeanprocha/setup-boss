/**
 * Fase 4.11.7 — Baseline / regression gate (opcional).
 * Comparativo best-effort entre deterministic-review.json actual e baseline explícito.
 * Não altera fingerprints nem o contrato principal do deterministic-review.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { compareDeterministicReviews } = require("./deterministic-review-diff");
const { REVIEW_BASELINE_SUMMARY_FILENAME } = require("./constants");

const DETERMINISTIC_REVIEW_BASELINE_CONTRACT = "deterministic-review-baseline/1";

const VALID_THRESHOLD_TOKENS = new Set(["new_findings", "risk_score_delta", "gate_regression"]);

/** Ordem lexical fixa quando profile = all */
const ALL_THRESHOLDS_SORTED = Object.freeze(
  [...VALID_THRESHOLD_TOKENS].sort((a, b) => a.localeCompare(b)),
);

function getBaselineModeFromEnv(env = process.env) {
  const raw = env && env.SETUP_BOSS_REVIEW_BASELINE_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "advisory" || v === "warn") return "advisory";
  if (v === "enforce" || v === "fail" || v === "strict") return "enforce";
  return "off";
}

function getBaselinePathFromEnv(env = process.env) {
  const raw = env && env.SETUP_BOSS_REVIEW_BASELINE_PATH;
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

/**
 * SETUP_BOSS_REVIEW_BASELINE_THRESHOLD — all | lista separada por vírgula dos tokens válidos.
 */
function parseBaselineThresholdProfile(env = process.env) {
  const raw = env && env.SETUP_BOSS_REVIEW_BASELINE_THRESHOLD;
  const s = raw === undefined || raw === null ? "" : String(raw).trim().toLowerCase();
  if (!s || s === "all") return [...ALL_THRESHOLDS_SORTED];
  const parts = s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (VALID_THRESHOLD_TOKENS.has(p)) out.push(p);
  }
  const uniq = [...new Set(out)].sort((a, b) => a.localeCompare(b));
  if (!uniq.length) return [...ALL_THRESHOLDS_SORTED];
  return uniq;
}

/**
 * @param {string} filePath
 * @param {string} cwd
 * @returns {{ ok: boolean, doc: object|null, resolved_path: string|null, error: string|null }}
 */
function loadBaselineReviewDocument(filePath, cwd = process.cwd()) {
  const fp = String(filePath || "").trim();
  if (!fp) return { ok: false, doc: null, resolved_path: null, error: "empty_path" };
  const resolved = path.isAbsolute(fp) ? fp : path.resolve(String(cwd || "."), fp);
  try {
    if (!fs.existsSync(resolved)) {
      return { ok: false, doc: null, resolved_path: resolved, error: "not_found" };
    }
    const raw = fs.readFileSync(resolved, "utf8");
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object") {
      return { ok: false, doc: null, resolved_path: resolved, error: "invalid_shape" };
    }
    return { ok: true, doc, resolved_path: resolved, error: null };
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "read_error";
    return { ok: false, doc: null, resolved_path: resolved, error: msg };
  }
}

function gateDecisionOrdinal(decision) {
  const d = String(decision || "").trim().toLowerCase();
  if (d === "fail") return 2;
  if (d === "warn") return 1;
  return 0;
}

function riskMetricsSlice(doc) {
  const rs = doc && doc.risk_summary && typeof doc.risk_summary === "object" ? doc.risk_summary : {};
  const vf = rs.validation_failures != null ? Number(rs.validation_failures) : 0;
  const se = rs.structural_errors != null ? Number(rs.structural_errors) : 0;
  const score = rs.risk_score != null ? Number(rs.risk_score) : 0;
  return {
    risk_score: Number.isFinite(score) ? score : 0,
    validation_failures: Number.isFinite(vf) ? vf : 0,
    structural_errors: Number.isFinite(se) ? se : 0,
    overall_risk_level: rs.overall_risk_level != null ? String(rs.overall_risk_level) : "low",
  };
}

/**
 * Compara run actual vs baseline (documento deterministic-review.json).
 * Reutiliza compareDeterministicReviews(baseline, current) — mesmo bucket semantics que review-diff.
 *
 * @param {object|null} currentDoc
 * @param {object|null} baselineDoc
 * @param {object} [opts]
 * @param {object} [opts.diffOpts] — repassado a compareDeterministicReviews
 */
function compareAgainstBaseline(currentDoc, baselineDoc, opts = {}) {
  const diff = compareDeterministicReviews(baselineDoc, currentDoc, opts.diffOpts || {});
  const gBefore = diff.gate_changes.decision.before;
  const gAfter = diff.gate_changes.decision.after;
  const gate_regressed = gateDecisionOrdinal(gAfter) > gateDecisionOrdinal(gBefore);

  const rBase = riskMetricsSlice(baselineDoc);
  const rCur = riskMetricsSlice(currentDoc);
  const risk_score_delta = rCur.risk_score - rBase.risk_score;
  const validation_failures_delta = rCur.validation_failures - rBase.validation_failures;
  const structural_errors_delta = rCur.structural_errors - rBase.structural_errors;

  return {
    diff,
    regression: {
      new_findings_count: diff.summary.new_findings_count,
      risk_score_delta,
      gate_regressed,
      gate_decision_before: gBefore != null ? String(gBefore) : "pass",
      gate_decision_after: gAfter != null ? String(gAfter) : "pass",
      validation_failures_delta,
      structural_errors_delta,
      overall_risk_level_before: rBase.overall_risk_level,
      overall_risk_level_after: rCur.overall_risk_level,
    },
  };
}

function evaluateBaselineViolations(regression, thresholdProfile) {
  /** @type {string[]} */
  const violated = [];
  for (const t of thresholdProfile) {
    if (t === "new_findings" && regression.new_findings_count > 0) violated.push("new_findings");
    if (t === "risk_score_delta" && regression.risk_score_delta > 0) violated.push("risk_score_delta");
    if (t === "gate_regression" && regression.gate_regressed) violated.push("gate_regression");
  }
  return [...new Set(violated)].sort((a, b) => a.localeCompare(b));
}

function buildRegressionHighlights(regression, violated) {
  /** @type {string[]} */
  const lines = [];
  if (regression.new_findings_count > 0) {
    lines.push(`novos findings vs baseline: ${regression.new_findings_count}`);
  }
  if (regression.risk_score_delta > 0) {
    lines.push(`risk_score aumentou delta=${regression.risk_score_delta}`);
  }
  if (regression.gate_regressed) {
    lines.push(`gate regressão: ${regression.gate_decision_before} → ${regression.gate_decision_after}`);
  }
  if (regression.validation_failures_delta > 0) {
    lines.push(`validation_failures delta=+${regression.validation_failures_delta}`);
  }
  if (regression.structural_errors_delta > 0) {
    lines.push(`structural_errors delta=+${regression.structural_errors_delta}`);
  }
  if (violated.length) {
    lines.push(`thresholds violados: ${violated.join(",")}`);
  }
  return lines.sort((a, b) => a.localeCompare(b));
}

function baselineIdentity(loadResult) {
  if (!loadResult.ok || !loadResult.doc) {
    return {
      loaded: false,
      path: loadResult.resolved_path,
      plan_id: null,
      run_id: null,
      error: loadResult.error || null,
    };
  }
  const md = loadResult.doc.metadata && typeof loadResult.doc.metadata === "object" ? loadResult.doc.metadata : {};
  return {
    loaded: true,
    path: loadResult.resolved_path,
    plan_id: md.plan_id != null ? String(md.plan_id) : null,
    run_id: md.run_id != null ? String(md.run_id) : null,
    error: null,
  };
}

/**
 * @param {object|null} currentDoc
 * @param {{ ok: boolean, doc: object|null, resolved_path: string|null, error: string|null }} baselineLoadResult
 * @param {{ diff: object, regression: object }|null} comparison
 * @param {object} [env]
 */
function buildBaselineRegressionSummary(currentDoc, baselineLoadResult, comparison, env = process.env) {
  const mode = getBaselineModeFromEnv(env);
  const threshold_profile = parseBaselineThresholdProfile(env);

  if (mode === "off") {
    const envPath = getBaselinePathFromEnv(env);
    return {
      schema_contract: DETERMINISTIC_REVIEW_BASELINE_CONTRACT,
      baseline: {
        loaded: false,
        path: envPath || null,
        plan_id: null,
        run_id: null,
        error: null,
      },
      regression: null,
      decision: {
        mode: "off",
        threshold_profile,
        violated: [],
        cli_effect: "none",
        skipped_reason: "mode_off",
      },
      diagnostics: {
        regression_highlights: [],
      },
    };
  }

  const baseline = baselineIdentity(baselineLoadResult);

  if (!currentDoc || typeof currentDoc !== "object") {
    return {
      schema_contract: DETERMINISTIC_REVIEW_BASELINE_CONTRACT,
      baseline,
      regression: null,
      decision: {
        mode,
        threshold_profile,
        violated: [],
        cli_effect: "none",
        skipped_reason: "current_doc_missing",
      },
      diagnostics: {
        regression_highlights: [`baseline gate ignorado: deterministic-review actual inválido`],
      },
    };
  }

  if (!baselineLoadResult.ok || !comparison) {
    const reason =
      baselineLoadResult.error === "empty_path" || baselineLoadResult.error === "missing_SETUP_BOSS_REVIEW_BASELINE_PATH"
        ? "baseline_path_missing"
        : "baseline_unavailable";
    /** @type {string[]} */
    const hints = [];
    if (baseline.error) hints.push(`baseline indisponível: ${baseline.error}`);
    return {
      schema_contract: DETERMINISTIC_REVIEW_BASELINE_CONTRACT,
      baseline,
      regression: null,
      decision: {
        mode,
        threshold_profile,
        violated: [],
        cli_effect: "none",
        skipped_reason: reason,
      },
      diagnostics: {
        regression_highlights: hints.sort((a, b) => a.localeCompare(b)),
      },
    };
  }

  const regression = comparison.regression;
  const violated = evaluateBaselineViolations(regression, threshold_profile);
  let cli_effect = "none";
  let outcome = "pass";
  if (violated.length) {
    outcome = mode === "enforce" ? "fail" : "warn";
    cli_effect = mode === "enforce" ? "fail" : "warn";
  }

  return {
    schema_contract: DETERMINISTIC_REVIEW_BASELINE_CONTRACT,
    baseline,
    regression,
    decision: {
      mode,
      threshold_profile,
      violated,
      cli_effect,
      outcome,
    },
    diagnostics: {
      regression_highlights: buildRegressionHighlights(regression, violated),
      diff_summary: {
        resolved_findings_count: comparison.diff.summary.resolved_findings_count,
        persistent_findings_count: comparison.diff.summary.persistent_findings_count,
        fingerprint_changed: comparison.diff.summary.fingerprint_changed,
      },
    },
  };
}

function baselineSummaryPath(outputDir) {
  return path.join(String(outputDir || ""), REVIEW_BASELINE_SUMMARY_FILENAME);
}

function saveBaselineRegressionSummaryArtifact(outputDir, summary, outputFs = null) {
  const dir = String(outputDir || "");
  if (!dir || !summary || typeof summary !== "object") return null;
  const p = baselineSummaryPath(dir);
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  if (outputFs && typeof outputFs.writeUtf8 === "function") {
    outputFs.writeUtf8(p, json);
  } else {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, json, "utf8");
  }
  return p;
}

function loadBaselineRegressionSummary(outputDir) {
  const p = baselineSummaryPath(String(outputDir || ""));
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Caminho completo do artefacto (para diagnostics).
 */
function baselineRegressionSummaryPath(outputDir) {
  const dir = String(outputDir || "");
  if (!dir) return null;
  return baselineSummaryPath(dir);
}

/**
 * @param {string} outputDir
 * @param {object|null} currentDoc — deterministic-review gravado nesta run
 * @param {object|null} outputFs
 * @param {object} [env]
 * @param {string} [cwd]
 * @returns {object|null}
 */
function finalizeBaselineRegressionForRun(outputDir, currentDoc, outputFs = null, env = process.env, cwd = process.cwd()) {
  const mode = getBaselineModeFromEnv(env);
  const bp = getBaselinePathFromEnv(env);

  let baselineLoad = { ok: false, doc: null, resolved_path: null, error: "no_path" };
  if (mode !== "off") {
    if (!bp) {
      baselineLoad = { ok: false, doc: null, resolved_path: null, error: "missing_SETUP_BOSS_REVIEW_BASELINE_PATH" };
    } else {
      baselineLoad = loadBaselineReviewDocument(bp, cwd);
    }
  }

  let comparison = null;
  if (mode !== "off" && baselineLoad.ok && currentDoc && typeof currentDoc === "object") {
    comparison = compareAgainstBaseline(currentDoc, baselineLoad.doc, {});
  }

  const summary = buildBaselineRegressionSummary(currentDoc, baselineLoad, comparison, env);
  saveBaselineRegressionSummaryArtifact(outputDir, summary, outputFs);
  return summary;
}

function applyBaselineRegressionGateCliEffects(summary) {
  if (!summary || !summary.decision || summary.decision.cli_effect === "none") return;

  const prefix = "[setup-boss] deterministic-review baseline regression (4.11.7)";
  const violated = Array.isArray(summary.decision.violated) ? summary.decision.violated : [];
  const detail = violated.length ? violated.join(", ") : "(sem tokens violados — ver diagnostics)";

  if (summary.decision.cli_effect === "warn") {
    console.warn(`${prefix} modo=advisory — regressão vs baseline: ${detail}. Pipeline não bloqueado.`);
    const hints = summary.diagnostics && Array.isArray(summary.diagnostics.regression_highlights) ? summary.diagnostics.regression_highlights : [];
    if (hints.length) {
      console.warn("Destaques:");
      for (const ln of hints) console.warn(`  • ${ln}`);
    }
    return;
  }

  if (summary.decision.cli_effect === "fail") {
    console.error(`${prefix} modo=enforce — regressão vs baseline: ${detail}. Falha de CI (exit code 1).`);
    const hints = summary.diagnostics && Array.isArray(summary.diagnostics.regression_highlights) ? summary.diagnostics.regression_highlights : [];
    if (hints.length) {
      console.error("Destaques:");
      for (const ln of hints) console.error(`  • ${ln}`);
    }
    if (!process.exitCode) process.exitCode = 1;
  }
}

module.exports = {
  DETERMINISTIC_REVIEW_BASELINE_CONTRACT,
  VALID_THRESHOLD_TOKENS,
  getBaselineModeFromEnv,
  getBaselinePathFromEnv,
  parseBaselineThresholdProfile,
  loadBaselineReviewDocument,
  compareAgainstBaseline,
  buildBaselineRegressionSummary,
  finalizeBaselineRegressionForRun,
  saveBaselineRegressionSummaryArtifact,
  loadBaselineRegressionSummary,
  baselineRegressionSummaryPath,
  applyBaselineRegressionGateCliEffects,
  evaluateBaselineViolations,
};
