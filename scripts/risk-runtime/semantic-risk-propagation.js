"use strict";

/**
 * Semantic risk propagation — report-only (Fase 4.8.5).
 * Consome propagation-manifest.json + semantic-mutation-graph.json.
 * Não modifica aggregation de risk_score.
 */

const {
  stableStringify,
  sha256HexUtf8,
} = require("../execution-plan/fingerprint/plan-fingerprint");
const {
  RISK_SEMANTIC_MUTATION_GRAPH_REF,
  RISK_SEMANTIC_PROPAGATION_MANIFEST_REF,
} = require("./constants");
const {
  MutationReasonCodes,
} = require("../semantic-dependency-runtime/overlay/constants");

const SEMANTIC_RISK_SCHEMA_VERSION = "semantic-risk-propagation/1";

const THRESHOLDS = Object.freeze({
  LOCAL_MAX_DEPTH: 1,
  LOCAL_MAX_NODES: 8,
  LOCAL_MAX_FRONTIER: 4,
  WIDE_MIN_DEPTH: 4,
  WIDE_MIN_NODES: 120,
  WIDE_MIN_FRONTIER: 40,
});

function sortImpactedNodesLexical(nodesArr) {
  const nodes = Array.isArray(nodesArr) ? nodesArr.slice() : [];
  nodes.sort((a, b) => String(a.node_id || "").localeCompare(String(b.node_id || "")));
  return nodes;
}

/**
 * @param {{
 *   impacted_nodes_count: number,
 *   max_propagation_depth: number,
 *   propagation_frontier_size: number,
 * }} metrics
 */
function classifySemanticRiskReach(metrics) {
  const N = Number(metrics.impacted_nodes_count) || 0;
  const D = Number(metrics.max_propagation_depth) || 0;
  const F = Number(metrics.propagation_frontier_size) || 0;

  if (
    D <= THRESHOLDS.LOCAL_MAX_DEPTH &&
    N <= THRESHOLDS.LOCAL_MAX_NODES &&
    F <= THRESHOLDS.LOCAL_MAX_FRONTIER
  ) {
    return "local";
  }
  if (
    D >= THRESHOLDS.WIDE_MIN_DEPTH ||
    N >= THRESHOLDS.WIDE_MIN_NODES ||
    F >= THRESHOLDS.WIDE_MIN_FRONTIER
  ) {
    return "wide_propagation";
  }
  return "propagated";
}

function summarizePropagationFromGraph(graphDoc) {
  const ps = graphDoc && graphDoc.propagation_summary && typeof graphDoc.propagation_summary === "object"
    ? graphDoc.propagation_summary
    : {};

  const nodesSorted = sortImpactedNodesLexical(
    graphDoc && Array.isArray(graphDoc.impacted_nodes) ? graphDoc.impacted_nodes : [],
  );
  const edges =
    graphDoc && Array.isArray(graphDoc.impacted_edges) ? graphDoc.impacted_edges : [];

  const impacted_nodes_count =
    ps.impacted_nodes_count != null ? Number(ps.impacted_nodes_count) || 0 : nodesSorted.length;

  const impacted_edges_count =
    ps.impacted_edges_count != null ? Number(ps.impacted_edges_count) || 0 : edges.length;

  const rootsArr = graphDoc && Array.isArray(graphDoc.roots) ? graphDoc.roots : [];
  const semantic_roots_count = rootsArr.length;

  const rootsAnchoredFrontier =
    rootsArr.filter((r) => r && typeof r === "object" && !r.missing_from_graph).length ||
    semantic_roots_count ||
    0;

  const distances = [];
  for (const n of nodesSorted) {
    const d = n.distance_from_root;
    if (d === null || d === undefined || d === "") continue;
    const num = Number(d);
    if (!Number.isFinite(num)) continue;
    distances.push(num);
  }

  const max_propagation_depth = distances.length ? Math.max(...distances) : 0;

  /** Fronteira aos hops máximos; profundidade 0 → ancoramos na contagem declarada de raízes para não penalizar apenas seeds locais. */
  let propagation_frontier_size = 0;
  if (!distances.length) {
    propagation_frontier_size = 0;
  } else if (max_propagation_depth > 0) {
    propagation_frontier_size = nodesSorted.filter((n) => {
      const num = Number(n.distance_from_root);
      return Number.isFinite(num) && num === max_propagation_depth;
    }).length;
  } else {
    propagation_frontier_size =
      rootsAnchoredFrontier > 0
        ? rootsAnchoredFrontier
        : nodesSorted.filter((n) => {
            const num = Number(n.distance_from_root);
            return Number.isFinite(num) && num === 0;
          }).length || 1;
  }

  const reverse_reach_count = nodesSorted.filter((n) => {
    const rc = Array.isArray(n.reason_codes) ? n.reason_codes.map(String) : [];
    return rc.includes(MutationReasonCodes.REVERSE_IMPORT_REACH);
  }).length;

  return {
    metrics: {
      impacted_nodes_count,
      impacted_edges_count,
      propagation_frontier_size,
      max_propagation_depth,
      reverse_reach_count,
      semantic_roots_count,
      metrics_basis: "semantic_mutation_graph",
    },
    propagation_summary_stable: {
      mutation_roots_paths_total:
        ps.mutation_roots_paths_total != null ? Number(ps.mutation_roots_paths_total) : rootsArr.length,
      impacted_nodes_count,
      impacted_edges_count,
      forward_unique_nodes_visited:
        ps.forward_unique_nodes_visited != null ? Number(ps.forward_unique_nodes_visited) : null,
      reverse_unique_nodes_visited:
        ps.reverse_unique_nodes_visited != null ? Number(ps.reverse_unique_nodes_visited) : null,
      forward_edges_emitted: ps.forward_edges_emitted != null ? Number(ps.forward_edges_emitted) : null,
      reverse_edges_emitted: ps.reverse_edges_emitted != null ? Number(ps.reverse_edges_emitted) : null,
    },
    propagation_fingerprint_sha256:
      graphDoc.propagation_fingerprint_sha256 != null
        ? String(graphDoc.propagation_fingerprint_sha256)
        : null,
    sorted_node_ids_digest: nodesSorted.map((x) => String(x.node_id || "")).sort((a, b) => a.localeCompare(b)),
  };
}

function summarizePropagationFromProjectionOnly(projDoc) {
  const pathsUniqueCount = [
    ...new Set(Array.isArray(projDoc.impacted_paths) ? projDoc.impacted_paths : []),
  ].filter(Boolean).length;

  const st = projDoc.propagation_stats && typeof projDoc.propagation_stats === "object"
    ? projDoc.propagation_stats
    : {};

  const nodes =
    st.impacted_nodes_total != null
      ? Number(st.impacted_nodes_total) || 0
      : pathsUniqueCount;

  const edges = st.impacted_edges_total != null ? Number(st.impacted_edges_total) || 0 : 0;

  const rootsSumm = Array.isArray(projDoc.roots_summary) ? projDoc.roots_summary : [];
  const semantic_roots_count = rootsSumm.length || 0;

  const metrics = {
    impacted_nodes_count: nodes,
    impacted_edges_count: edges,
    propagation_frontier_size: pathsUniqueCount,
    max_propagation_depth: nodes > 1 ? 1 : 0,
    reverse_reach_count: 0,
    semantic_roots_count,
    metrics_basis: "propagation_manifest_projection_only",
  };

  const propagation_summary_stable = {
    impacted_paths_projection_unique:
      pathsUniqueCount > 0
        ? pathsUniqueCount
        : st.impacted_paths_unique != null
          ? Number(st.impacted_paths_unique) || 0
          : 0,
    impacted_nodes_count: metrics.impacted_nodes_count,
    impacted_edges_count: metrics.impacted_edges_count,
    roots_projection_count: semantic_roots_count,
  };

  return {
    metrics,
    propagation_summary_stable,
    propagation_fingerprint_sha256:
      projDoc.propagation_fingerprint_sha256 != null
        ? String(projDoc.propagation_fingerprint_sha256)
        : null,
    sorted_node_ids_digest: [],
  };
}

/**
 * Fingerprints apenas campos ordenados / deduzidos deterministicamente do grafo ordenado por node_id.
 * @param {{
 *   metrics: object,
 *   semantic_risk_classification: string,
 *   propagation_fingerprint_sha256: string|null,
 * }} inp
 */
function computeSemanticRiskMetricsFingerprint(inp) {
  return sha256HexUtf8(
    stableStringify({
      semantic_risk_schema: SEMANTIC_RISK_SCHEMA_VERSION,
      propagation_fingerprint_sha256: inp.propagation_fingerprint_sha256,
      semantic_risk_classification: inp.semantic_risk_classification,
      metrics_basis: inp.metrics && inp.metrics.metrics_basis,
      impacted_nodes_count: inp.metrics.impacted_nodes_count,
      impacted_edges_count: inp.metrics.impacted_edges_count,
      propagation_frontier_size: inp.metrics.propagation_frontier_size,
      max_propagation_depth: inp.metrics.max_propagation_depth,
      reverse_reach_count: inp.metrics.reverse_reach_count,
      semantic_roots_count: inp.metrics.semantic_roots_count,
    }),
  );
}

/**
 * @param {{
 *   mode: 'off'|'shadow',
 *   propagationManifestDoc: object|null,
 *   semanticGraphDoc: object|null,
 * }} inp
 */
function buildSemanticRiskPropagationBlock(inp) {
  const propagation_mode = inp.mode === "shadow" ? "shadow" : "off";

  if (propagation_mode === "off") {
    const emptyFp = computeSemanticRiskMetricsFingerprint({
      metrics: {
        impacted_nodes_count: 0,
        impacted_edges_count: 0,
        propagation_frontier_size: 0,
        max_propagation_depth: 0,
        reverse_reach_count: 0,
        semantic_roots_count: 0,
        metrics_basis: "off",
      },
      semantic_risk_classification: "idle",
      propagation_fingerprint_sha256: null,
    });

    const telemetry_bundle = {
      semantic_risk_propagation_enabled: false,
      semantic_risk_metrics_generated: false,
      semantic_risk_shadow: false,
      semantic_risk_propagation_skipped: true,
    };

    return {
      schema_version: SEMANTIC_RISK_SCHEMA_VERSION,
      propagation_mode,
      telemetry: telemetry_bundle,
      propagation_summary: null,
      semantic_risk_metrics: null,
      propagation_fingerprint_sha256: null,
      semantic_risk_classification: null,
      semantic_risk_metrics_fingerprint_sha256: emptyFp,
      artifact_refs: {
        propagation_manifest: RISK_SEMANTIC_PROPAGATION_MANIFEST_REF,
        semantic_mutation_graph: RISK_SEMANTIC_MUTATION_GRAPH_REF,
      },
      skipped_reason: "semantic_risk_propagation_off",
      extensions: {},
    };
  }

  const proj = inp.propagationManifestDoc && typeof inp.propagationManifestDoc === "object"
    ? inp.propagationManifestDoc
    : null;
  const graph = inp.semanticGraphDoc && typeof inp.semanticGraphDoc === "object"
    ? inp.semanticGraphDoc
    : null;

  /** @type {ReturnType<summarizePropagationFromGraph> | ReturnType<summarizePropagationFromProjectionOnly> | null} */
  let pack = null;
  /** @type {string|null} */
  let skipped_reason = null;

  if (graph) {
    pack = summarizePropagationFromGraph(graph);
    skipped_reason = null;
  } else if (proj) {
    pack = summarizePropagationFromProjectionOnly(proj);
    skipped_reason = "semantic_mutation_graph_missing_used_projection_fallback";
  } else {
    skipped_reason = "missing_semantic_artifacts";
    const telemetry_bundle = {
      semantic_risk_propagation_enabled: true,
      semantic_risk_metrics_generated: false,
      semantic_risk_shadow: true,
      semantic_risk_propagation_skipped: true,
    };

    const emptyFp2 = computeSemanticRiskMetricsFingerprint({
      metrics: {
        impacted_nodes_count: 0,
        impacted_edges_count: 0,
        propagation_frontier_size: 0,
        max_propagation_depth: 0,
        reverse_reach_count: 0,
        semantic_roots_count: 0,
        metrics_basis: "skipped_missing_artifacts",
      },
      semantic_risk_classification: "idle",
      propagation_fingerprint_sha256: null,
    });

    return {
      schema_version: SEMANTIC_RISK_SCHEMA_VERSION,
      propagation_mode,
      telemetry: telemetry_bundle,
      propagation_summary: null,
      semantic_risk_metrics: null,
      propagation_fingerprint_sha256: null,
      semantic_risk_classification: null,
      semantic_risk_metrics_fingerprint_sha256: emptyFp2,
      artifact_refs: {
        propagation_manifest: RISK_SEMANTIC_PROPAGATION_MANIFEST_REF,
        semantic_mutation_graph: RISK_SEMANTIC_MUTATION_GRAPH_REF,
      },
      skipped_reason,
      extensions: {},
    };
  }

  const classification = classifySemanticRiskReach({
    impacted_nodes_count: pack.metrics.impacted_nodes_count,
    max_propagation_depth: pack.metrics.max_propagation_depth,
    propagation_frontier_size: pack.metrics.propagation_frontier_size,
  });

  const semFp = computeSemanticRiskMetricsFingerprint({
    metrics: pack.metrics,
    semantic_risk_classification: classification,
    propagation_fingerprint_sha256: pack.propagation_fingerprint_sha256,
  });

  const telemetry_bundle = {
    semantic_risk_propagation_enabled: true,
    semantic_risk_metrics_generated: true,
    semantic_risk_shadow: true,
    semantic_risk_propagation_skipped: false,
  };

  const out = {
    schema_version: SEMANTIC_RISK_SCHEMA_VERSION,
    propagation_mode,
    telemetry: telemetry_bundle,
    propagation_summary: pack.propagation_summary_stable,
    semantic_risk_metrics: pack.metrics,
    propagation_fingerprint_sha256: pack.propagation_fingerprint_sha256,
    semantic_risk_classification: classification,
    semantic_risk_metrics_fingerprint_sha256: semFp,
    artifact_refs: {
      propagation_manifest: RISK_SEMANTIC_PROPAGATION_MANIFEST_REF,
      semantic_mutation_graph: RISK_SEMANTIC_MUTATION_GRAPH_REF,
    },
    skipped_reason,
    extensions: {},
  };

  return out;
}

module.exports = {
  SEMANTIC_RISK_SCHEMA_VERSION,
  THRESHOLDS,
  buildSemanticRiskPropagationBlock,
  classifySemanticRiskReach,
  sortImpactedNodesLexical,
  computeSemanticRiskMetricsFingerprint,
  summarizePropagationFromGraph,
};
