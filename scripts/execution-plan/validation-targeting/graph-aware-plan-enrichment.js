/**
 * Fase 4.10.7 — Graph-aware validation planning (metadados / read-only).
 * Não altera `targets`, `commands` nem identidade criptográfica do plano.
 */

"use strict";

const { stableStringify, sha256HexUtf8 } = require("../fingerprint/plan-fingerprint");
const { normalizePath } = require("../normalization/operation-normalizer");
const { loadDependencyGraph } = require("./dependency-graph");
const { DEPENDENCY_GRAPH_FILENAME } = require("./constants");

/** Alinhado aos defaults de enrichValidationTargetsWithGraphImpact em dependency-graph.js */
const GRAPH_TRAVERSAL_DEFAULTS = Object.freeze({
  reverse_import_traversal_depth: 3,
  reverse_import_max_nodes: 128,
  forward_import_traversal_depth: 2,
  forward_import_max_nodes: 64,
});

const DEFAULT_GRAPH_CANDIDATES_MAX = 2048;

function buildImpactExpansionIndex(targetsDoc) {
  /** @type {Map<string, object>} */
  const map = new Map();
  const raw = targetsDoc && Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const f = normalizePath(t.file != null ? String(t.file) : "");
    if (!f) continue;
    if (t.impact_expansion && typeof t.impact_expansion === "object") map.set(f, t.impact_expansion);
  }
  return map;
}

function collectTargetRiskHintsSorted(targetsDoc) {
  const s = new Set();
  const raw = targetsDoc && Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const rh = Array.isArray(t.risk_hints) ? t.risk_hints : [];
    for (const x of rh) s.add(String(x));
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function candidateSortKey(c) {
  return [
    String(c.type || ""),
    String(c.source || ""),
    String(c.candidate || ""),
    String(c.hop || ""),
  ].join("\u001f");
}

/**
 * @param {object} planDoc
 * @param {{
 *   outputDir: string,
 *   targetsDoc?: object|null,
 *   graphDoc?: object|null,
 *   graphCandidatesMax?: number,
 * }} input
 * @returns {object} planDoc mutado com campos graph-aware
 */
function enrichValidationPlanWithGraphImpact(planDoc, input) {
  if (!planDoc || typeof planDoc !== "object") return planDoc;

  const outputDir = input && input.outputDir != null ? String(input.outputDir) : "";
  const targetsDoc = input && input.targetsDoc != null ? input.targetsDoc : null;

  let graphDoc;
  if (input && Object.prototype.hasOwnProperty.call(input, "graphDoc")) {
    graphDoc = input.graphDoc;
  } else if (outputDir) {
    try {
      graphDoc = loadDependencyGraph(outputDir);
    } catch (_) {
      graphDoc = null;
    }
  } else {
    graphDoc = null;
  }

  const capRaw =
    input && input.graphCandidatesMax != null ? Number(input.graphCandidatesMax) : null;
  let candidatesMax =
    capRaw !== null &&
    Number.isFinite(capRaw) &&
    capRaw > 0 &&
    Number.isInteger(capRaw)
      ? capRaw
      : DEFAULT_GRAPH_CANDIDATES_MAX;
  candidatesMax = Math.min(Math.max(candidatesMax, 64), 100000);

  const graph_present = Boolean(graphDoc && typeof graphDoc === "object");
  const graph_fingerprint_sha256 = graph_present
    ? graphDoc.fingerprints && graphDoc.fingerprints.graph_content_sha256 != null
      ? String(graphDoc.fingerprints.graph_content_sha256)
      : null
    : null;

  const impactIdx = targetsDoc ? buildImpactExpansionIndex(targetsDoc) : new Map();
  const planTargets = planDoc.targets && Array.isArray(planDoc.targets) ? planDoc.targets : [];

  /** @type {object[]} */
  const rawCandidates = [];
  let targetsWithImpact = 0;
  let targetsReverseTrunc = 0;
  let targetsForwardTrunc = 0;

  for (const row of planTargets) {
    if (!row || typeof row !== "object") continue;
    const file = row.file != null ? normalizePath(String(row.file)) : "";
    if (!file) continue;
    const ie = impactIdx.get(file);
    if (!ie) continue;
    targetsWithImpact += 1;
    if (ie.transitive_importers_truncated) targetsReverseTrunc += 1;
    if (ie.dependencies_truncated) targetsForwardTrunc += 1;

    const direct = new Set(
      Array.isArray(ie.direct_importer_files)
        ? ie.direct_importer_files.map((x) => normalizePath(String(x))).filter(Boolean)
        : [],
    );
    const importers = Array.isArray(ie.importer_files)
      ? [...new Set(ie.importer_files.map((x) => normalizePath(String(x))).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b),
        )
      : [];

    for (const c of importers) {
      if (!c || c === file) continue;
      rawCandidates.push({
        type: "reverse_import",
        source: file,
        candidate: c,
        hop: direct.has(c) ? "direct" : "transitive",
      });
    }

    const deps = Array.isArray(ie.dependency_files)
      ? [...new Set(ie.dependency_files.map((x) => normalizePath(String(x))).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b),
        )
      : [];
    for (const c of deps) {
      if (!c || c === file) continue;
      rawCandidates.push({
        type: "forward_import",
        source: file,
        candidate: c,
        hop: "direct",
      });
    }

    const tests = Array.isArray(ie.linked_test_files)
      ? [...new Set(ie.linked_test_files.map((x) => normalizePath(String(x))).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b),
        )
      : [];
    for (const c of tests) {
      if (!c || c === file) continue;
      rawCandidates.push({
        type: "linked_test",
        source: file,
        candidate: c,
        hop: "direct",
      });
    }
  }

  rawCandidates.sort((a, b) => candidateSortKey(a).localeCompare(candidateSortKey(b)));

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {object[]} */
  const deduped = [];
  for (const c of rawCandidates) {
    const k = candidateSortKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push({
      type: c.type,
      source: c.source,
      candidate: c.candidate,
      hop: c.hop,
    });
  }

  const candidates_truncated = deduped.length > candidatesMax;
  const graph_candidates = candidates_truncated ? deduped.slice(0, candidatesMax) : deduped;

  const reverse_imports_total = graph_candidates.filter((c) => c.type === "reverse_import").length;
  const direct_reverse = graph_candidates.filter(
    (c) => c.type === "reverse_import" && c.hop === "direct",
  ).length;
  const transitive_reverse = graph_candidates.filter(
    (c) => c.type === "reverse_import" && c.hop === "transitive",
  ).length;
  const forward_imports_total = graph_candidates.filter((c) => c.type === "forward_import").length;
  const linked_tests_total = graph_candidates.filter((c) => c.type === "linked_test").length;

  const uniqueCandidates = new Set(graph_candidates.map((c) => String(c.candidate || ""))).size;

  /** @type {string[]} */
  const planRisk = targetsDoc ? collectTargetRiskHintsSorted(targetsDoc) : [];
  const graphRiskExtra = [];
  if (!graph_present) graphRiskExtra.push("graph_artifact_absent");
  if (targetsReverseTrunc) graphRiskExtra.push("graph_reverse_import_truncation");
  if (targetsForwardTrunc) graphRiskExtra.push("graph_forward_import_truncation");
  if (candidates_truncated) graphRiskExtra.push("graph_candidates_cap_hit");
  if (targetsWithImpact && reverse_imports_total > direct_reverse)
    graphRiskExtra.push("graph_transitive_importers_present");

  const risk_hints = [...new Set([...planRisk, ...graphRiskExtra])].sort((a, b) =>
    a.localeCompare(b),
  );

  /** @type {{ consolidation_key: string, file: string, graph_validator_targeting: object }[]} */
  const perTarget = [];
  for (const row of planTargets) {
    if (!row || typeof row !== "object") continue;
    const file = row.file != null ? normalizePath(String(row.file)) : "";
    if (!file) continue;
    const ie = impactIdx.get(file);
    if (!ie) continue;
    const directN = Array.isArray(ie.direct_importer_files) ? ie.direct_importer_files.length : 0;
    const revN = Array.isArray(ie.importer_files) ? ie.importer_files.length : 0;
    const depN = Array.isArray(ie.dependency_files) ? ie.dependency_files.length : 0;
    const tstN = Array.isArray(ie.linked_test_files) ? ie.linked_test_files.length : 0;
    perTarget.push({
      consolidation_key: String(row.consolidation_key || ""),
      file,
      graph_validator_targeting: {
        has_direct_importers: directN > 0,
        has_transitive_importers: revN > directN,
        has_forward_dependencies: depN > 0,
        has_linked_tests: tstN > 0,
        direct_importer_count: directN,
        importer_total_count: revN,
        forward_dependency_count: depN,
        linked_test_count: tstN,
        reverse_import_truncated: Boolean(ie.transitive_importers_truncated),
        forward_import_truncated: Boolean(ie.dependencies_truncated),
        graph_fingerprint_sha256:
          ie.graph_fingerprint_sha256 != null ? String(ie.graph_fingerprint_sha256) : "",
      },
    });
  }
  perTarget.sort((a, b) => a.consolidation_key.localeCompare(b.consolidation_key));

  const graph_impact = {
    graph_present,
    graph_fingerprint_sha256,
    artifact_ref: DEPENDENCY_GRAPH_FILENAME,
    stats_from_artifact:
      graph_present && graphDoc.metadata && graphDoc.metadata.stats
        ? graphDoc.metadata.stats
        : null,
    summary: {
      graph_candidates_total: graph_candidates.length,
      reverse_imports_total,
      direct_reverse_imports_total: direct_reverse,
      transitive_reverse_imports_total: transitive_reverse,
      forward_imports_total,
      linked_tests_total,
      graph_expansion_depth: {
        reverse: GRAPH_TRAVERSAL_DEFAULTS.reverse_import_traversal_depth,
        forward: GRAPH_TRAVERSAL_DEFAULTS.forward_import_traversal_depth,
      },
      targets_with_impact_expansion: targetsWithImpact,
    },
    truncation: {
      candidates_truncated,
      graph_candidates_cap: candidatesMax,
      raw_candidates_before_dedupe: rawCandidates.length,
      targets_with_reverse_truncation: targetsReverseTrunc,
      targets_with_forward_truncation: targetsForwardTrunc,
    },
    per_target: perTarget,
  };

  const scope_expansion = {
    caps: {
      graph_candidates_max: candidatesMax,
      ...GRAPH_TRAVERSAL_DEFAULTS,
    },
    candidates_truncated,
    unique_candidate_paths_total: uniqueCandidates,
    consolidation_rows_with_file: planTargets.filter(
      (r) => r && r.file != null && String(r.file).trim() !== "",
    ).length,
    read_only: true,
  };

  const fingerprintPayload = {
    graph_impact: {
      graph_present,
      graph_fingerprint_sha256,
      summary: graph_impact.summary,
      truncation: graph_impact.truncation,
    },
    graph_candidates,
    risk_hints,
    scope_expansion: {
      caps: scope_expansion.caps,
      candidates_truncated: scope_expansion.candidates_truncated,
      unique_candidate_paths_total: scope_expansion.unique_candidate_paths_total,
      read_only: scope_expansion.read_only,
    },
    per_target: perTarget,
  };

  const graph_aware_payload_sha256 = sha256HexUtf8(stableStringify(fingerprintPayload));

  planDoc.graph_impact = graph_impact;
  planDoc.graph_candidates = graph_candidates;
  planDoc.risk_hints = risk_hints;
  planDoc.scope_expansion = scope_expansion;

  planDoc.fingerprints =
    planDoc.fingerprints && typeof planDoc.fingerprints === "object" ? planDoc.fingerprints : {};
  planDoc.fingerprints.graph_aware_payload_sha256 = graph_aware_payload_sha256;

  planDoc.sources = planDoc.sources && typeof planDoc.sources === "object" ? planDoc.sources : {};
  planDoc.sources.dependency_graph = DEPENDENCY_GRAPH_FILENAME;

  return planDoc;
}

module.exports = {
  enrichValidationPlanWithGraphImpact,
  GRAPH_TRAVERSAL_DEFAULTS,
  DEFAULT_GRAPH_CANDIDATES_MAX,
};
