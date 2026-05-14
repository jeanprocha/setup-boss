/**
 * Fase 4.11.3 — Regras de review semântico leve (determinísticas, observacional).
 * Sem AST profundo; sem enforcement.
 *
 * Grupos → códigos:
 * - Catálogo descriptor/validator: semantic_descriptor_without_resolved_command,
 *   semantic_resolved_command_validator_unlisted, semantic_redundant_validator_per_target,
 *   semantic_duplicate_resolved_command_key
 * - Grafo / impact-aware: semantic_graph_impact_missing_target_coverage,
 *   semantic_linked_tests_no_test_runner, semantic_graph_truncation_risk_hint_gap,
 *   semantic_plan_expects_graph_artifact_missing
 * - Targets / risk: semantic_target_risk_hints_without_validator
 * - Cache: semantic_cache_plan_identity_mismatch
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { normalizePath } = require("../execution-plan/normalization/operation-normalizer");
const { loadValidationCache } = require("../execution-plan/validation-targeting/validation-cache");
const { sha256ShortDeterministicReview } = require("./contract/deterministic-review-contract");
const { DEPENDENCY_GRAPH_FILENAME } = require("../execution-plan/validation-targeting/constants");

const TEST_RUNNER_VALIDATOR_IDS = new Set(["jest", "vitest"]);

function findingSemantic(code, severity, message, evidence, related_targets, idPayload) {
  const payload = { code, ...(idPayload && typeof idPayload === "object" ? idPayload : {}) };
  return {
    finding_id: `dr-${sha256ShortDeterministicReview(payload)}`,
    type: "semantic",
    severity,
    code,
    message,
    evidence: evidence && typeof evidence === "object" ? evidence : {},
    related_targets: Array.isArray(related_targets) ? related_targets : [],
  };
}

function compactList(xs, max = 12) {
  const a = [...xs].filter(Boolean).sort((x, y) => String(x).localeCompare(String(y)));
  if (a.length <= max) return a;
  return a.slice(0, max).concat([`…+${a.length - max}`]);
}

/**
 * @param {object} input
 * @param {string} input.outputDir
 * @param {object|null} input.planDoc
 * @param {object|null} resultsDoc
 * @param {object|null} depGraph
 */
function collectSemanticLightDeterministicFindings(input) {
  const out = [];
  const outputDir = String((input && input.outputDir) || "");
  const planDoc = input && input.planDoc && typeof input.planDoc === "object" ? input.planDoc : null;
  const resultsDoc =
    input && input.resultsDoc && typeof input.resultsDoc === "object" ? input.resultsDoc : null;
  const depGraph = input && input.depGraph && typeof input.depGraph === "object" ? input.depGraph : null;

  if (!planDoc) return out;

  const planFp =
    planDoc.fingerprints && planDoc.fingerprints.validation_plan_identity_sha256 != null
      ? String(planDoc.fingerprints.validation_plan_identity_sha256)
      : "";

  const validators = Array.isArray(planDoc.validators) ? planDoc.validators : [];
  const resolvedValidators = Array.isArray(planDoc.resolved_validators) ? planDoc.resolved_validators : [];
  const commands = Array.isArray(planDoc.commands) ? planDoc.commands : [];
  const targets = Array.isArray(planDoc.targets) ? planDoc.targets : [];

  const resolvedCommands = commands.filter(
    (c) => c && typeof c === "object" && String(c.status || "") === "resolved",
  );

  /** Catálogo de validators com status resolved */
  const catalogResolvedIds = new Set();
  for (const rv of resolvedValidators) {
    if (!rv || typeof rv !== "object") continue;
    if (String(rv.status || "") !== "resolved") continue;
    const vid = String(rv.validator_id || rv.resolver_key || "");
    if (vid) catalogResolvedIds.add(vid);
  }

  if (resolvedValidators.length > 0) {
    for (const c of resolvedCommands) {
      const vid = String(c.validator_id || "");
      if (!vid) continue;
      if (!catalogResolvedIds.has(vid)) {
        out.push(
          findingSemantic(
            "semantic_resolved_command_validator_unlisted",
            "error",
            "Comando resolved referencia validator_id que não consta como resolved em resolved_validators.",
            { command_id: String(c.command_id || ""), validator_id: vid },
            c.target_id ? [String(c.target_id)] : [],
            {
              code: "semantic_resolved_command_validator_unlisted",
              command_id: String(c.command_id || ""),
              vid,
            },
          ),
        );
      }
    }
  }

  if (validators.length > 0) {
    const descriptorWithResolved = new Set();
    for (const c of resolvedCommands) {
      const d = c.descriptor_id != null ? String(c.descriptor_id) : "";
      if (d) descriptorWithResolved.add(d);
    }
    for (const v of validators) {
      if (!v || typeof v !== "object") continue;
      const did = String(v.descriptor_id || "");
      if (!did) continue;
      if (!descriptorWithResolved.has(did)) {
        out.push(
          findingSemantic(
            "semantic_descriptor_without_resolved_command",
            "info",
            "Descriptor no validation-plan sem comando resolved correspondente.",
            { descriptor_id: did },
            [],
            { code: "semantic_descriptor_without_resolved_command", did },
          ),
        );
      }
    }
  }

  /** Duplicados (target + validator + descriptor) */
  const tripleMap = new Map();
  for (const c of resolvedCommands) {
    const tid = String(c.target_id || "");
    const vid = String(c.validator_id || "");
    const did = c.descriptor_id != null ? String(c.descriptor_id) : "";
    const key = `${tid}\u001f${vid}\u001f${did}`;
    if (!tripleMap.has(key)) tripleMap.set(key, []);
    tripleMap.get(key).push(String(c.command_id || ""));
  }
  for (const [key, ids] of [...tripleMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const uniq = [...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (uniq.length <= 1) continue;
    const [tid] = key.split("\u001f");
    out.push(
      findingSemantic(
        "semantic_duplicate_resolved_command_key",
        "warning",
        "Múltiplos comandos resolved com a mesma chave semântica (target, validator, descriptor).",
        { command_ids: compactList(uniq), key_hint: key.slice(0, 80) },
        tid ? [tid] : [],
        { code: "semantic_duplicate_resolved_command_key", key },
      ),
    );
  }

  /** Redundante: mesmo target + validator, vários comandos */
  const pairMap = new Map();
  for (const c of resolvedCommands) {
    const tid = String(c.target_id || "");
    const vid = String(c.validator_id || "");
    if (!tid || !vid) continue;
    const key = `${tid}\u001f${vid}`;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(String(c.command_id || ""));
  }
  for (const [key, ids] of [...pairMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const uniq = [...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (uniq.length <= 1) continue;
    const [tid, vid] = key.split("\u001f");
    out.push(
      findingSemantic(
        "semantic_redundant_validator_per_target",
        "warning",
        "Vários comandos resolved para o mesmo alvo e o mesmo validator (possível sobreposição).",
        { target_id: tid, validator_id: vid, command_ids: compactList(uniq) },
        [tid],
        { code: "semantic_redundant_validator_per_target", tid, vid },
      ),
    );
  }

  /** risk_hints no target sem validators inferidos */
  for (const t of targets) {
    if (!t || typeof t !== "object") continue;
    const tid = String(t.target_id || "");
    const rh = Array.isArray(t.risk_hints) ? t.risk_hints : [];
    const inf = Array.isArray(t.inferred_validators) ? t.inferred_validators : [];
    if (rh.length > 0 && inf.length === 0) {
      out.push(
        findingSemantic(
          "semantic_target_risk_hints_without_validator",
          "warning",
          "Target com risk_hints mas sem inferred_validators (sem ferramenta de validação inferida).",
          { target_id: tid || null, risk_hints_count: rh.length },
          tid ? [tid] : [],
          { code: "semantic_target_risk_hints_without_validator", tid },
        ),
      );
    }
  }

  const gi = planDoc.graph_impact && typeof planDoc.graph_impact === "object" ? planDoc.graph_impact : null;
  if (gi) {
    const graphPresentDoc = gi.graph_present === true;
    const hasFp = String(gi.graph_fingerprint_sha256 || "").length === 64;
    if ((graphPresentDoc || hasFp) && !depGraph) {
      out.push(
        findingSemantic(
          "semantic_plan_expects_graph_artifact_missing",
          "warning",
          "validation-plan indica grafo presente mas dependency-graph.json não está disponível nesta run.",
          {
            graph_present_doc: graphPresentDoc,
            artifact: DEPENDENCY_GRAPH_FILENAME,
          },
          [],
          { code: "semantic_plan_expects_graph_artifact_missing", gp: graphPresentDoc },
        ),
      );
    }

    const trunc = gi.truncation && typeof gi.truncation === "object" ? gi.truncation : null;
    const riskHints = Array.isArray(planDoc.risk_hints) ? planDoc.risk_hints : [];
    if (trunc && trunc.candidates_truncated === true && !riskHints.includes("graph_candidates_cap_hit")) {
      out.push(
        findingSemantic(
          "semantic_graph_truncation_risk_hint_gap",
          "warning",
          "Expansão graph-aware truncada sem risk_hint graph_candidates_cap_hit no plano (metadados desalinhados).",
          { expected_hint: "graph_candidates_cap_hit", candidates_truncated: true },
          [],
          { code: "semantic_graph_truncation_risk_hint_gap" },
        ),
      );
    }

    const summary = gi.summary && typeof gi.summary === "object" ? gi.summary : null;
    const linkedTotal = summary && summary.linked_tests_total != null ? Number(summary.linked_tests_total) : 0;
    if (linkedTotal > 0) {
      const hasTestRunner = resolvedCommands.some((c) => TEST_RUNNER_VALIDATOR_IDS.has(String(c.validator_id || "")));
      if (!hasTestRunner) {
        out.push(
          findingSemantic(
            "semantic_linked_tests_no_test_runner",
            "warning",
            "Grafo reporta linked tests mas não há comando resolved jest/vitest no plano.",
            { linked_tests_total: linkedTotal },
            [],
            { code: "semantic_linked_tests_no_test_runner", n: linkedTotal },
          ),
        );
      }
    }

    /** Cobertura: target com expansão de grafo sem comando resolved */
    const fileToTarget = new Map();
    for (const t of targets) {
      if (!t || typeof t !== "object") continue;
      const fp = normalizePath(t.file != null ? String(t.file) : "");
      const tid = String(t.target_id || "");
      if (fp && tid) fileToTarget.set(fp, tid);
    }
    const perTarget = Array.isArray(gi.per_target) ? gi.per_target : [];
    for (const row of perTarget) {
      if (!row || typeof row !== "object") continue;
      const file = normalizePath(row.file != null ? String(row.file) : "");
      const gvt = row.graph_validator_targeting && typeof row.graph_validator_targeting === "object"
        ? row.graph_validator_targeting
        : null;
      if (!file || !gvt) continue;
      const hasExpansion =
        gvt.has_linked_tests === true ||
        gvt.has_transitive_importers === true ||
        gvt.has_direct_importers === true ||
        gvt.has_forward_dependencies === true;
      if (!hasExpansion) continue;
      const tid = fileToTarget.get(file);
      if (!tid) continue;
      const covered = resolvedCommands.some((c) => String(c.target_id || "") === tid);
      if (!covered) {
        out.push(
          findingSemantic(
            "semantic_graph_impact_missing_target_coverage",
            "warning",
            "Target com impacto de grafo (importadores/tests/deps) mas sem comando de validação resolved.",
            { target_id: tid, file },
            [tid],
            { code: "semantic_graph_impact_missing_target_coverage", tid, file },
          ),
        );
      }
    }
  }

  /** Cache reuse vs identidade do plano */
  const sum = resultsDoc && resultsDoc.summary && typeof resultsDoc.summary === "object" ? resultsDoc.summary : null;
  const cacheReused = sum && sum.cache_reused != null ? Number(sum.cache_reused) : 0;
  if (cacheReused > 0 && planFp && outputDir) {
    let cachePathPresent = false;
    try {
      cachePathPresent = fs.existsSync(path.join(outputDir, "validation-cache.json"));
    } catch (_) {
      cachePathPresent = false;
    }
    if (cachePathPresent) {
      const cacheDoc = loadValidationCache(outputDir);
      const entries = Array.isArray(cacheDoc.entries) ? cacheDoc.entries : [];
      const bad = [];
      for (const e of entries) {
        if (!e || typeof e !== "object") continue;
        const ep = String(e.validation_plan_identity_sha256 || "");
        if (ep && ep !== planFp) bad.push(String(e.cache_key || "").slice(0, 16));
      }
      const badUniq = [...new Set(bad)].sort((a, b) => a.localeCompare(b));
      if (badUniq.length > 0) {
        out.push(
          findingSemantic(
            "semantic_cache_plan_identity_mismatch",
            "warning",
            "Reuso de cache reportado mas entradas em validation-cache.json com validation_plan_identity_sha256 diferente do plano actual.",
            {
              cache_reused: cacheReused,
              mismatched_entries_sample: compactList(badUniq, 8),
              plan_identity_prefix: planFp.slice(0, 12),
            },
            [],
            { code: "semantic_cache_plan_identity_mismatch", n: badUniq.length },
          ),
        );
      }
    }
  }

  return out;
}

module.exports = {
  collectSemanticLightDeterministicFindings,
};
