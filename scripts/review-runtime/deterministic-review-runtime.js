/**
 * Fase 4.11 — Runtime de evidências para review (observacional): structural + semantic leve,
 * validation, cache, grafo. Não bloqueia pipeline.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { stableStringify, sha256HexUtf8 } = require("../execution-plan/fingerprint/plan-fingerprint");
const { loadValidationPlan } = require("../execution-plan/validation-targeting/validation-plan-builder");
const { loadDependencyGraph } = require("../execution-plan/validation-targeting/dependency-graph");
const {
  VALIDATION_PLAN_FILENAME,
  VALIDATION_RESULTS_FILENAME,
  VALIDATION_CACHE_FILENAME,
} = require("../execution-plan/validation-targeting/constants");
const { EXECUTION_PLAN_FILENAME } = require("../execution-plan/persistence/plan-store");
const { isValidationCacheEnabled } = require("../execution-plan/validation-targeting/validation-cache");
const { readJsonSafe } = require("./lib/runtime-snapshot");
const { DETERMINISTIC_REVIEW_FILENAME, REVIEW_RESULTS_FILENAME } = require("./constants");
const {
  createEmptyDeterministicReview,
  sha256ShortDeterministicReview,
  DETERMINISTIC_REVIEW_SCHEMA_CONTRACT,
} = require("./contract/deterministic-review-contract");
const { collectStructuralDeterministicFindings } = require("./structural-deterministic-review-rules");
const { collectSemanticLightDeterministicFindings } = require("./semantic-light-deterministic-review-rules");
const {
  computeDeterministicReviewRiskSummary,
  resolveRiskSummaryFromDocument,
  compactRiskSummaryForInspect,
} = require("./deterministic-review-risk");
const { buildDeterministicReviewGate } = require("./deterministic-review-gate");

const MANIFEST_FILENAME = "plan-artifacts.json";

function readArtifact(outputDir, rel) {
  return readJsonSafe(path.join(String(outputDir || ""), rel));
}

function unresolvedCommands(planDoc) {
  const commands = planDoc && Array.isArray(planDoc.commands) ? planDoc.commands : [];
  return commands
    .filter((c) => {
      if (!c || typeof c !== "object") return false;
      const st = String(c.status || "");
      return st === "unresolved" || st === "unsupported";
    })
    .map((c) => ({
      command_id: String(c.command_id || ""),
      target_id: String(c.target_id || ""),
      validator_id: c.validator_id != null ? String(c.validator_id) : "",
      status: String(c.status || ""),
    }))
    .sort((a, b) => a.command_id.localeCompare(b.command_id));
}

/**
 * @param {string} outputDir
 * @param {object} [opts]
 * @param {object} [opts.extraMetadata]
 * @returns {object}
 */
function buildDeterministicReviewDocument(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const planDoc = loadValidationPlan(dir);
  const resultsDoc = readArtifact(dir, VALIDATION_RESULTS_FILENAME);
  const execPlan = readArtifact(dir, EXECUTION_PLAN_FILENAME);
  const planArtifacts = readArtifact(dir, MANIFEST_FILENAME);
  const depGraph = loadDependencyGraph(dir);

  const plan_id =
    (planDoc && planDoc.metadata && planDoc.metadata.plan_id != null && String(planDoc.metadata.plan_id)) ||
    (execPlan && execPlan.plan_id != null && String(execPlan.plan_id)) ||
    (resultsDoc && resultsDoc.metadata && resultsDoc.metadata.plan_id != null && String(resultsDoc.metadata.plan_id)) ||
    "";
  const run_id =
    (planDoc && planDoc.metadata && planDoc.metadata.run_id != null && String(planDoc.metadata.run_id)) ||
    (execPlan && execPlan.run_id != null && String(execPlan.run_id)) ||
    (resultsDoc && resultsDoc.metadata && resultsDoc.metadata.run_id != null && String(resultsDoc.metadata.run_id)) ||
    "";

  const doc = createEmptyDeterministicReview({
    generated_at: new Date().toISOString(),
    plan_id,
    run_id,
    metadata: {
      ...(opts.extraMetadata && typeof opts.extraMetadata === "object" ? opts.extraMetadata : {}),
    },
  });

  /** @type {object[]} */
  const findings = [];

  function pushFinding(f) {
    findings.push(f);
  }

  const cacheEnabled = isValidationCacheEnabled();
  if (!cacheEnabled) {
    pushFinding({
      finding_id: `dr-${sha256ShortDeterministicReview({ code: "validation_cache_disabled" })}`,
      type: "cache",
      severity: "info",
      code: "validation_cache_disabled",
      message: "Cache de validação desactivado via SETUP_BOSS_VALIDATION_CACHE (evidência de execução sem reuse de cache).",
      evidence: {
        env_setup_boss_validation_cache: process.env.SETUP_BOSS_VALIDATION_CACHE ?? null,
      },
      related_targets: [],
    });
  }

  const planPath = path.join(dir, VALIDATION_PLAN_FILENAME);
  const planPresent = Boolean(dir && fs.existsSync(planPath));
  const resultsPath = path.join(dir, VALIDATION_RESULTS_FILENAME);
  const resultsPresent = Boolean(dir && fs.existsSync(resultsPath));
  const cachePath = path.join(dir, VALIDATION_CACHE_FILENAME);
  const cachePresent = Boolean(dir && fs.existsSync(cachePath));

  if (planPresent && planDoc && typeof planDoc === "object") {
    const unresolved = unresolvedCommands(planDoc);
    for (const u of unresolved) {
      pushFinding({
        finding_id: `dr-${sha256ShortDeterministicReview({ code: "unresolved_validator", ...u })}`,
        type: "validation",
        severity: "warning",
        code: "unresolved_validator",
        message: `Validator não resolvido no plano (${u.status}): ${u.command_id || u.validator_id || "?"}.`,
        evidence: { command: u },
        related_targets: u.target_id ? [u.target_id] : [],
      });
    }

    const gi = planDoc.graph_impact && typeof planDoc.graph_impact === "object" ? planDoc.graph_impact : null;
    const trunc = gi && gi.truncation && typeof gi.truncation === "object" ? gi.truncation : null;
    if (trunc && trunc.candidates_truncated === true) {
      pushFinding({
        finding_id: `dr-${sha256ShortDeterministicReview({ code: "graph_candidates_cap_hit", cap: trunc.graph_candidates_cap })}`,
        type: "graph",
        severity: "warning",
        code: "graph_candidates_cap_hit",
        message: "Candidatos de expansão graph-aware truncados ao teto configurado.",
        evidence: {
          truncation: {
            candidates_truncated: trunc.candidates_truncated,
            graph_candidates_cap: trunc.graph_candidates_cap != null ? Number(trunc.graph_candidates_cap) : null,
            raw_candidates_before_dedupe:
              trunc.raw_candidates_before_dedupe != null ? Number(trunc.raw_candidates_before_dedupe) : null,
          },
        },
        related_targets: [],
      });
    }

    const revT = trunc && trunc.targets_with_reverse_truncation != null ? Number(trunc.targets_with_reverse_truncation) : 0;
    const fwdT = trunc && trunc.targets_with_forward_truncation != null ? Number(trunc.targets_with_forward_truncation) : 0;
    if (revT > 0 || fwdT > 0) {
      pushFinding({
        finding_id: `dr-${sha256ShortDeterministicReview({ code: "dependency_graph_truncated", revT, fwdT })}`,
        type: "graph",
        severity: "warning",
        code: "dependency_graph_truncated",
        message: "Travessia do grafo de dependências truncada (importadores e/ou dependências).",
        evidence: {
          targets_with_reverse_truncation: revT,
          targets_with_forward_truncation: fwdT,
          graph_fingerprint_sha256:
            gi && gi.graph_fingerprint_sha256 != null ? String(gi.graph_fingerprint_sha256) : null,
        },
        related_targets: [],
      });
    }

    const planFp =
      planDoc.fingerprints && planDoc.fingerprints.validation_plan_identity_sha256 != null
        ? String(planDoc.fingerprints.validation_plan_identity_sha256)
        : "";
    const resPlanFp =
      resultsDoc &&
      resultsDoc.fingerprints &&
      resultsDoc.fingerprints.validation_plan_identity_sha256 != null
        ? String(resultsDoc.fingerprints.validation_plan_identity_sha256)
        : "";
    if (planFp && resPlanFp && planFp !== resPlanFp) {
      pushFinding({
        finding_id: `dr-${sha256ShortDeterministicReview({ code: "validation_cache_inconsistent", planFp, resPlanFp })}`,
        type: "cache",
        severity: "warning",
        code: "validation_cache_inconsistent",
        message: "Fingerprints do validation-plan e validation-results divergem (possível artefacto obsoleto ou mistura de runs).",
        evidence: {
          validation_plan_identity_sha256: planFp,
          results_validation_plan_identity_sha256: resPlanFp,
        },
        related_targets: [],
      });
    }

    const sum = resultsDoc && resultsDoc.summary && typeof resultsDoc.summary === "object" ? resultsDoc.summary : null;
    const cacheReused = sum && sum.cache_reused != null ? Number(sum.cache_reused) : 0;
    if (cacheReused > 0 && !cachePresent) {
      pushFinding({
        finding_id: `dr-${sha256ShortDeterministicReview({ code: "validation_cache_inconsistent", hint: "file_missing" })}`,
        type: "cache",
        severity: "warning",
        code: "validation_cache_inconsistent",
        message: "validation-results reporta reuso de cache mas validation-cache.json está ausente.",
        evidence: { cache_reused: cacheReused },
        related_targets: [],
      });
    }
  }

  if (resultsDoc && Array.isArray(resultsDoc.results)) {
    for (const row of resultsDoc.results) {
      if (!row || typeof row !== "object") continue;
      const st = String(row.status || "");
      if (st === "failed" || st === "error") {
        pushFinding({
          finding_id: `dr-${sha256ShortDeterministicReview({ code: "validation_command_failed", command_id: row.command_id, st })}`,
          type: "validation",
          severity: "error",
          code: "validation_command_failed",
          message: `Comando de validação terminou com estado ${st}.`,
          evidence: {
            command_id: String(row.command_id || ""),
            target_id: String(row.target_id || ""),
            validator_id: row.validator_id != null ? String(row.validator_id) : "",
            status: st,
            exit_code: row.exit_code === undefined || row.exit_code === null ? null : Number(row.exit_code),
            duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
          },
          related_targets: row.target_id ? [String(row.target_id)] : [],
        });
      }
    }
  }

  for (const sf of collectStructuralDeterministicFindings({
    outputDir: dir,
    planDoc,
    resultsDoc,
    execPlan,
    planArtifacts,
    depGraph,
  })) {
    pushFinding(sf);
  }

  for (const sf of collectSemanticLightDeterministicFindings({
    outputDir: dir,
    planDoc,
    resultsDoc,
    depGraph,
  })) {
    pushFinding(sf);
  }

  findings.sort((a, b) => {
    const c = String(a.type).localeCompare(String(b.type));
    if (c !== 0) return c;
    const c2 = String(a.code).localeCompare(String(b.code));
    if (c2 !== 0) return c2;
    return String(a.finding_id).localeCompare(String(b.finding_id));
  });

  doc.findings = findings;

  let warnings = 0;
  let errors = 0;
  let infos = 0;
  let unresolvedValidators = 0;
  let failedValidations = 0;

  for (const f of findings) {
    const sev = String(f.severity || "");
    if (sev === "warning") warnings += 1;
    if (sev === "error") errors += 1;
    if (sev === "info") infos += 1;
    if (f.code === "unresolved_validator") unresolvedValidators += 1;
    if (f.code === "validation_command_failed") failedValidations += 1;
  }

  doc.summary = {
    findings_total: findings.length,
    warnings_total: warnings,
    errors_total: errors,
    infos_total: infos,
    unresolved_validators_total: unresolvedValidators,
    failed_validations_total: failedValidations,
  };

  doc.risk_summary = computeDeterministicReviewRiskSummary(findings, doc.summary);

  const findingsCanon = findings.map((f) => ({
    finding_id: f.finding_id,
    type: f.type,
    severity: f.severity,
    code: f.code,
  }));

  doc.fingerprints = {
    deterministic_review_content_sha256: sha256HexUtf8(
      stableStringify({
        schema_contract: DETERMINISTIC_REVIEW_SCHEMA_CONTRACT,
        version: doc.version,
        plan_id,
        run_id,
        findings: findingsCanon,
        validation_plan_identity_sha256:
          planDoc && planDoc.fingerprints && planDoc.fingerprints.validation_plan_identity_sha256 != null
            ? String(planDoc.fingerprints.validation_plan_identity_sha256)
            : null,
        validation_results_identity_sha256:
          resultsDoc &&
          resultsDoc.fingerprints &&
          resultsDoc.fingerprints.validation_results_identity_sha256 != null
            ? String(resultsDoc.fingerprints.validation_results_identity_sha256)
            : null,
        execution_plan_content_sha256:
          execPlan && execPlan.fingerprints && execPlan.fingerprints.plan_content_sha256 != null
            ? String(execPlan.fingerprints.plan_content_sha256)
            : null,
      }),
    ),
  };

  doc.gate = buildDeterministicReviewGate(doc.risk_summary, findings);

  doc.metadata.review_evidence_runtime = {
    inputs: {
      validation_plan_present: planPresent,
      validation_results_present: resultsPresent,
      dependency_graph_present: Boolean(depGraph),
      execution_plan_present: Boolean(execPlan && typeof execPlan === "object"),
      plan_artifacts_present: Boolean(planArtifacts && typeof planArtifacts === "object"),
    },
  };

  return doc;
}

function deterministicReviewPath(outputDir) {
  return path.join(String(outputDir || ""), DETERMINISTIC_REVIEW_FILENAME);
}

/**
 * @param {string} outputDir
 * @param {object} [opts]
 * @param {object|null} [opts.outputFs] — createOutputFs; usa writeJson quando disponível
 */
function saveDeterministicReviewArtifact(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  if (!dir) return null;
  const doc = buildDeterministicReviewDocument(dir, opts);
  const p = deterministicReviewPath(dir);
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  const out = opts.outputFs;
  if (out && typeof out.writeUtf8 === "function") {
    out.writeUtf8(p, json);
  } else {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, json, "utf8");
  }
  return doc;
}

function loadDeterministicReview(outputDir) {
  const p = deterministicReviewPath(String(outputDir || ""));
  return readJsonSafe(p);
}

/**
 * Agregados determinísticos para CLI / diagnostics (sem corpo de evidence).
 * @param {object|null} doc
 * @returns {object|null}
 */
function aggregateDeterministicReviewForInspect(doc) {
  if (!doc || typeof doc !== "object") return null;
  const findings = Array.isArray(doc.findings) ? doc.findings : [];
  const by_severity = { error: 0, warning: 0, info: 0 };
  const by_type = {};
  const by_code = {};
  for (const f of findings) {
    const sev = String(f.severity || "");
    if (sev === "error") by_severity.error += 1;
    else if (sev === "warning") by_severity.warning += 1;
    else if (sev === "info") by_severity.info += 1;
    const ty = String(f.type || "unknown");
    by_type[ty] = (by_type[ty] || 0) + 1;
    const c = String(f.code || "");
    if (c) by_code[c] = (by_code[c] || 0) + 1;
  }
  const by_type_ordered = {};
  for (const k of Object.keys(by_type).sort((a, b) => a.localeCompare(b))) {
    by_type_ordered[k] = by_type[k];
  }
  const by_code_ordered = {};
  for (const k of Object.keys(by_code).sort((a, b) => a.localeCompare(b))) {
    by_code_ordered[k] = by_code[k];
  }
  const sm = doc.summary && typeof doc.summary === "object" ? doc.summary : {};
  const risk_summary = compactRiskSummaryForInspect(resolveRiskSummaryFromDocument(doc));
  return {
    findings_total: findings.length,
    warnings_total: sm.warnings_total != null ? Number(sm.warnings_total) : by_severity.warning,
    errors_total: sm.errors_total != null ? Number(sm.errors_total) : by_severity.error,
    infos_total: sm.infos_total != null ? Number(sm.infos_total) : by_severity.info,
    unresolved_validators_total:
      sm.unresolved_validators_total != null ? Number(sm.unresolved_validators_total) : 0,
    failed_validations_total:
      sm.failed_validations_total != null ? Number(sm.failed_validations_total) : 0,
    by_severity,
    by_type: by_type_ordered,
    by_code: by_code_ordered,
    risk_summary,
    gate: doc.gate && typeof doc.gate === "object" ? doc.gate : null,
  };
}

/**
 * Snapshot compacto replay-safe para inspect (sem listar evidências).
 * @param {object|null} doc
 */
function buildDeterministicReviewInspectSnapshot(doc) {
  if (!doc || typeof doc !== "object") return null;
  const agg = aggregateDeterministicReviewForInspect(doc);
  const { risk_summary, gate, ...summaryRest } = agg || {};
  return {
    schema_contract: doc.schema_contract != null ? String(doc.schema_contract) : null,
    version: doc.version != null ? doc.version : null,
    fingerprint:
      doc.fingerprints && doc.fingerprints.deterministic_review_content_sha256 != null
        ? String(doc.fingerprints.deterministic_review_content_sha256)
        : null,
    summary: summaryRest,
    risk_summary,
    gate: gate || null,
  };
}

/** Shadow: referência ao artefacto 4.11 (não altera campos obrigatórios do review engine). */
function attachDeterministicReviewShadowToReviewResults(results) {
  if (!results || typeof results !== "object") return;
  results.extensions =
    results.extensions && typeof results.extensions === "object" ? results.extensions : {};
  results.extensions.deterministic_review_ref = DETERMINISTIC_REVIEW_FILENAME;
}

function writeReviewResultsJson(outputDir, obj, outputFs) {
  const dir = String(outputDir || "");
  const p = path.join(dir, REVIEW_RESULTS_FILENAME);
  if (outputFs && typeof outputFs.writeJson === "function") {
    outputFs.writeJson(p, obj);
  } else {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  }
}

/**
 * Best-effort: mescla extensions.deterministic_review_ref em review-results.json existente.
 * @param {object|null} outputFs
 */
function patchReviewResultsDeterministicRef(outputDir, outputFs) {
  const dir = String(outputDir || "");
  if (!dir) return;
  const p = path.join(dir, REVIEW_RESULTS_FILENAME);
  let raw;
  try {
    if (outputFs && typeof outputFs.exists === "function" && !outputFs.exists(p)) return;
    else if (!outputFs && !fs.existsSync(p)) return;
    if (outputFs && typeof outputFs.readJson === "function") {
      raw = outputFs.readJson(p);
    } else {
      raw = JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch (_) {
    return;
  }
  if (!raw || typeof raw !== "object") return;
  raw.extensions = raw.extensions && typeof raw.extensions === "object" ? raw.extensions : {};
  raw.extensions.deterministic_review_ref = DETERMINISTIC_REVIEW_FILENAME;
  writeReviewResultsJson(dir, raw, outputFs);
}

/**
 * Grava deterministic-review.json e actualiza referência shadow em review-results (se existir).
 */
function finalizeDeterministicReviewObservability(outputDir, outputFs) {
  const doc = saveDeterministicReviewArtifact(outputDir, { outputFs: outputFs || null });
  patchReviewResultsDeterministicRef(outputDir, outputFs || null);
  return doc;
}

module.exports = {
  buildDeterministicReviewDocument,
  saveDeterministicReviewArtifact,
  loadDeterministicReview,
  deterministicReviewPath,
  MANIFEST_FILENAME,
  computeDeterministicReviewRiskSummary,
  aggregateDeterministicReviewForInspect,
  buildDeterministicReviewInspectSnapshot,
  attachDeterministicReviewShadowToReviewResults,
  patchReviewResultsDeterministicRef,
  finalizeDeterministicReviewObservability,
};
