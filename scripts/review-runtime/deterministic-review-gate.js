/**
 * Fase 4.11.5 — Gate opcional baseado em risk_summary do deterministic-review.
 * Default: off (observacional, não bloqueante). Fingerprints do artefacto 4.11 não incluem `gate`.
 */

"use strict";

/** Ordem lexical dos níveis para comparação determinística (>=). */
const RISK_LEVEL_ORDER = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

const VALID_THRESHOLDS = new Set(["low", "medium", "high", "critical"]);

/**
 * SETUP_BOSS_REVIEW_GATE_MODE — off | advisory | enforce (default off).
 * Aceita aliases: warn→advisory, fail|strict→enforce.
 */
function getReviewGateModeFromEnv(env = process.env) {
  const raw = env && env.SETUP_BOSS_REVIEW_GATE_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "advisory" || v === "warn") return "advisory";
  if (v === "enforce" || v === "fail" || v === "strict") return "enforce";
  return "off";
}

/**
 * SETUP_BOSS_REVIEW_GATE_THRESHOLD — low | medium | high | critical (default high se inválido/vazio).
 */
function getReviewGateThresholdFromEnv(env = process.env) {
  return normalizeGateThreshold(env && env.SETUP_BOSS_REVIEW_GATE_THRESHOLD);
}

function normalizeRiskLevel(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s in RISK_LEVEL_ORDER ? s : "low";
}

function normalizeGateThreshold(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return VALID_THRESHOLDS.has(s) ? s : "high";
}

function riskOrdinal(level) {
  return RISK_LEVEL_ORDER[normalizeRiskLevel(level)] ?? 0;
}

function thresholdOrdinal(level) {
  return RISK_LEVEL_ORDER[normalizeGateThreshold(level)] ?? RISK_LEVEL_ORDER.high;
}

/** true se ordinal(risco) >= ordinal(limiar). */
function riskMeetsOrExceedsThreshold(riskLevel, thresholdLevel) {
  return riskOrdinal(riskLevel) >= thresholdOrdinal(thresholdLevel);
}

/**
 * @param {object|null} riskSummary
 * @param {string} overallLevel
 * @param {string} thresholdLevel
 * @param {string} mode
 * @returns {object[]}
 */
function buildTriggeredBy(riskSummary, overallLevel, thresholdLevel, mode) {
  /** @type {object[]} */
  const out = [];
  out.push({
    kind: "risk_threshold",
    overall_risk_level: normalizeRiskLevel(overallLevel),
    gate_threshold: normalizeGateThreshold(thresholdLevel),
    rule: "ordinal_compare_gte",
    gate_mode: mode,
  });

  const top = riskSummary && Array.isArray(riskSummary.top_risk_findings) ? riskSummary.top_risk_findings : [];
  let i = 0;
  for (const row of top) {
    if (i >= 8) break;
    if (!row || typeof row !== "object") continue;
    out.push({
      kind: "finding",
      finding_id: row.finding_id != null ? String(row.finding_id) : "",
      code: row.code != null ? String(row.code) : "",
      type: row.type != null ? String(row.type) : "",
      severity: row.severity != null ? String(row.severity) : "",
      risk_weight: row.risk_weight != null ? Number(row.risk_weight) : 0,
    });
    i += 1;
  }
  return out;
}

/**
 * @param {object|null} riskSummary — doc.risk_summary
 * @param {object[]} [_findings] — reservado; auditoria futura (evitar divergência do modelo de risco)
 * @param {object} [env]
 * @returns {{ mode: string, threshold: string, decision: string, triggered_by: object[], risk_level: string }}
 */
function buildDeterministicReviewGate(riskSummary, _findings = [], env = process.env) {
  const mode = getReviewGateModeFromEnv(env);
  const threshold = getReviewGateThresholdFromEnv(env);
  const overall = normalizeRiskLevel(riskSummary && riskSummary.overall_risk_level);

  if (mode === "off") {
    return {
      mode: "off",
      threshold,
      decision: "pass",
      triggered_by: [],
      risk_level: overall,
    };
  }

  const meets = riskMeetsOrExceedsThreshold(overall, threshold);
  let decision = "pass";
  if (meets) {
    decision = mode === "enforce" ? "fail" : "warn";
  }

  return {
    mode,
    threshold,
    decision,
    triggered_by: meets ? buildTriggeredBy(riskSummary, overall, threshold, mode) : [],
    risk_level: overall,
  };
}

function formatTriggeredLines(gate) {
  const lines = [];
  const rows = Array.isArray(gate.triggered_by) ? gate.triggered_by : [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if (r.kind === "risk_threshold") {
      lines.push(
        `  • Limiar: overall_risk_level=${r.overall_risk_level} >= gate_threshold=${r.gate_threshold} (${r.rule})`,
      );
    } else if (r.kind === "finding") {
      lines.push(
        `  • Finding: ${r.code || "?"} [${r.type}/${r.severity}] id=${r.finding_id || "?"} weight=${r.risk_weight}`,
      );
    }
  }
  return lines;
}

/**
 * Efeitos CLI após gravar deterministic-review.json (review.js).
 * @param {object|null} doc
 */
function applyDeterministicReviewGateCliEffects(doc) {
  const gate = doc && doc.gate;
  if (!gate || gate.mode === "off") return;

  const risk = gate.risk_level != null ? String(gate.risk_level) : normalizeRiskLevel(doc.risk_summary && doc.risk_summary.overall_risk_level);
  const prefix = "[setup-boss] deterministic-review gate (4.11.5)";

  if (gate.decision === "pass") {
    return;
  }

  const detailLines = formatTriggeredLines(gate);

  if (gate.decision === "warn") {
    console.warn(
      `${prefix} modo=advisory — risco '${risk}' atinge ou excede o limiar '${gate.threshold}'. Pipeline não bloqueado.`,
    );
    if (detailLines.length) {
      console.warn("Motivo / evidência:");
      for (const ln of detailLines) console.warn(ln);
    }
    return;
  }

  if (gate.decision === "fail") {
    console.error(
      `${prefix} modo=enforce — risco '${risk}' atinge ou excede o limiar '${gate.threshold}'. Falha de CI (exit code 1).`,
    );
    if (detailLines.length) {
      console.error("Motivo / evidência:");
      for (const ln of detailLines) console.error(ln);
    }
    if (!process.exitCode) process.exitCode = 1;
  }
}

module.exports = {
  RISK_LEVEL_ORDER,
  getReviewGateModeFromEnv,
  getReviewGateThresholdFromEnv,
  normalizeRiskLevel,
  normalizeGateThreshold,
  riskMeetsOrExceedsThreshold,
  buildDeterministicReviewGate,
  applyDeterministicReviewGateCliEffects,
};
