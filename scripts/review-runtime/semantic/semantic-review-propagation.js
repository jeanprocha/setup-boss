"use strict";

/**
 * Semantic review propagation — Fase 4.8.6 (shadow / report-only).
 * Consome propagation-manifest.json + semantic-mutation-graph.json.
 * Não altera score nem decisão final do review.
 */

const {
  stableStringify,
  sha256HexUtf8,
} = require("../../execution-plan/fingerprint/plan-fingerprint");
const {
  MutationReasonCodes,
} = require("../../semantic-dependency-runtime/overlay/constants");
const {
  classifySemanticRiskReach,
  sortImpactedNodesLexical,
  summarizePropagationFromGraph,
  summarizePropagationFromProjectionOnly,
} = require("../../risk-runtime/semantic-risk-propagation");
const {
  REVIEW_SEMANTIC_PROPAGATION_MANIFEST_REF,
  REVIEW_SEMANTIC_MUTATION_GRAPH_REF,
} = require("../constants");

const SEMANTIC_REVIEW_PROPAGATION_SCHEMA_VERSION = "semantic-review-propagation/1";

const MAX_HINT_VERTEX_SAMPLES = 64;

function mapRiskReachToReviewClassification(reach) {
  if (reach === "local") return "local_review_impact";
  if (reach === "propagated") return "propagated_review_impact";
  if (reach === "wide_propagation") return "wide_review_impact";
  return "idle";
}

function clipSortedKeys(keys) {
  const u = [...new Set(keys.map(String).filter(Boolean))];
  u.sort((a, b) => a.localeCompare(b));
  return u.slice(0, MAX_HINT_VERTEX_SAMPLES);
}

function collectDirectVertexKeys(nodesSorted) {
  const keys = [];
  for (const node of nodesSorted) {
    const d = Number(node.distance_from_root);
    const rc = Array.isArray(node.reason_codes) ? node.reason_codes.map(String) : [];
    if ((Number.isFinite(d) && d === 0) || rc.includes(MutationReasonCodes.DIRECT_CHANGE)) {
      keys.push(String(node.node_id || node.path || ""));
    }
  }
  return keys.filter(Boolean);
}

function collectForwardPropagatedKeys(nodesSorted) {
  const keys = [];
  for (const node of nodesSorted) {
    const d = Number(node.distance_from_root);
    const rc = Array.isArray(node.reason_codes) ? node.reason_codes.map(String) : [];
    const onlyReverse =
      rc.includes(MutationReasonCodes.REVERSE_IMPORT_REACH) &&
      !rc.includes(MutationReasonCodes.IMPORT_REACH) &&
      !rc.includes(MutationReasonCodes.DIRECT_CHANGE);
    if (!Number.isFinite(d) || d <= 0) continue;
    if (onlyReverse) continue;
    keys.push(String(node.node_id || node.path || ""));
  }
  return keys.filter(Boolean);
}

function buildSemanticReviewHintsFromGraph(graphDoc, metrics, reviewClassification) {
  const nodesSorted = sortImpactedNodesLexical(
    graphDoc && Array.isArray(graphDoc.impacted_nodes) ? graphDoc.impacted_nodes : [],
  );
  const hints = [];

  const directKeys = collectDirectVertexKeys(nodesSorted);
  if (directKeys.length) {
    hints.push({
      hint_id: "direct_semantic_impact",
      kind: "direct_semantic_impact",
      summary:
        `Impacto semântico directo: ${directKeys.length} vértice(s) em raiz ou marcados como alteração directa.`,
      evidence: {
        vertex_count: directKeys.length,
        sample_vertex_keys: clipSortedKeys(directKeys),
      },
    });
  }

  const forwardKeys = collectForwardPropagatedKeys(nodesSorted);
  const directCount = directKeys.length;
  const propagatedSignal =
    forwardKeys.length > 0 ||
    (Number(metrics.max_propagation_depth) > 0 &&
      Number(metrics.impacted_nodes_count) > directCount &&
      directCount >= 0);

  if (propagatedSignal) {
    hints.push({
      hint_id: "propagated_semantic_impact",
      kind: "propagated_semantic_impact",
      summary:
        forwardKeys.length > 0
          ? `Impacto semântico propagado (forward): ${forwardKeys.length} vértice(s) além do núcleo directo.`
          : `Impacto semântico propagado: profundidade máxima ${metrics.max_propagation_depth} com ${metrics.impacted_nodes_count} nós totais.`,
      evidence: {
        forward_vertex_count: forwardKeys.length,
        sample_vertex_keys: clipSortedKeys(forwardKeys),
        max_propagation_depth: metrics.max_propagation_depth,
        impacted_nodes_count: metrics.impacted_nodes_count,
      },
    });
  }

  const rev = Number(metrics.reverse_reach_count) || 0;
  if (rev > 0) {
    hints.push({
      hint_id: "reverse_semantic_impact",
      kind: "reverse_semantic_impact",
      summary: `Alcance reverso semântico: ${rev} vértice(s) com código reverse_import_reach.`,
      evidence: {
        reverse_reach_count: rev,
      },
    });
  }

  if (reviewClassification === "wide_review_impact") {
    hints.push({
      hint_id: "wide_semantic_propagation",
      kind: "wide_semantic_propagation",
      summary:
        "Propagação semântica ampla: profundidade, fronteira ou número de nós excede limiares locais.",
      evidence: {
        impacted_nodes_count: metrics.impacted_nodes_count,
        propagation_frontier_size: metrics.propagation_frontier_size,
        max_propagation_depth: metrics.max_propagation_depth,
      },
    });
  }

  hints.sort((a, b) => String(a.hint_id).localeCompare(String(b.hint_id)));
  return hints;
}

function buildSemanticReviewHintsProjectionOnly(metrics, reviewClassification) {
  const hints = [];
  const roots = Number(metrics.semantic_roots_count) || 0;
  const nodes = Number(metrics.impacted_nodes_count) || 0;

  if (nodes > 0) {
    hints.push({
      hint_id: "direct_semantic_impact",
      kind: "direct_semantic_impact",
      summary:
        `Impacto semântico directo (projecção do manifest): ${nodes} nó(s) projectado(s), ${roots} raiz(es).`,
      evidence: {
        impacted_nodes_count: nodes,
        semantic_roots_count: roots,
        metrics_basis: String(metrics.metrics_basis || ""),
      },
    });
  }

  const propagatedSignal =
    Number(metrics.max_propagation_depth) > 0 || (roots > 0 && nodes > roots) || nodes > 1;

  if (propagatedSignal) {
    hints.push({
      hint_id: "propagated_semantic_impact",
      kind: "propagated_semantic_impact",
      summary:
        "Impacto semântico propagado inferido pela projecção (sem vértices completos do grafo).",
      evidence: {
        max_propagation_depth: metrics.max_propagation_depth,
        impacted_nodes_count: nodes,
        semantic_roots_count: roots,
        metrics_basis: String(metrics.metrics_basis || ""),
      },
    });
  }

  if (reviewClassification === "wide_review_impact") {
    hints.push({
      hint_id: "wide_semantic_propagation",
      kind: "wide_semantic_propagation",
      summary: "Propagação semântica ampla (classificação por alcance da projecção).",
      evidence: {
        impacted_nodes_count: nodes,
        propagation_frontier_size: metrics.propagation_frontier_size,
        max_propagation_depth: metrics.max_propagation_depth,
      },
    });
  }

  hints.sort((a, b) => String(a.hint_id).localeCompare(String(b.hint_id)));
  return hints;
}

function buildSemanticReviewMetrics(hints, packMetrics) {
  return {
    impacted_nodes_count: packMetrics.impacted_nodes_count,
    impacted_edges_count: packMetrics.impacted_edges_count,
    semantic_roots_count: packMetrics.semantic_roots_count,
    propagation_frontier_size: packMetrics.propagation_frontier_size,
    max_propagation_depth: packMetrics.max_propagation_depth,
    semantic_review_hint_count: hints.length,
  };
}

function computeSemanticReviewPropagationFingerprint(inp) {
  const hintsStable = (inp.hints || [])
    .slice()
    .sort((a, b) => String(a.hint_id).localeCompare(String(b.hint_id)))
    .map((h) => ({ hint_id: h.hint_id, kind: h.kind }));

  return sha256HexUtf8(
    stableStringify({
      semantic_review_propagation_schema: SEMANTIC_REVIEW_PROPAGATION_SCHEMA_VERSION,
      propagation_fingerprint_sha256: inp.propagation_fingerprint_sha256,
      semantic_review_classification: inp.semantic_review_classification,
      semantic_review_metrics: inp.semantic_review_metrics,
      hints: hintsStable,
    }),
  );
}

function idleFingerprintAndTelemetry(offShadow) {
  const semantic_review_metrics = {
    impacted_nodes_count: 0,
    impacted_edges_count: 0,
    semantic_roots_count: 0,
    propagation_frontier_size: 0,
    max_propagation_depth: 0,
    semantic_review_hint_count: 0,
  };

  const hints = [];
  const semantic_review_classification =
    offShadow === "off" ? null : "idle";

  const propagation_fingerprint_sha256 = null;

  const semantic_review_propagation_fingerprint_sha256 = computeSemanticReviewPropagationFingerprint({
    hints,
    semantic_review_metrics,
    semantic_review_classification: semantic_review_classification || "idle",
    propagation_fingerprint_sha256,
  });

  return { semantic_review_metrics, hints, semantic_review_classification, propagation_fingerprint_sha256, semantic_review_propagation_fingerprint_sha256 };
}

/**
 * @param {{
 *   mode: 'off'|'shadow',
 *   propagationManifestDoc: object|null,
 *   semanticGraphDoc: object|null,
 * }} inp
 */
function buildSemanticReviewPropagationBlock(inp) {
  const propagation_mode = inp.mode === "shadow" ? "shadow" : "off";
  const artifact_refs = {
    propagation_manifest: REVIEW_SEMANTIC_PROPAGATION_MANIFEST_REF,
    semantic_mutation_graph: REVIEW_SEMANTIC_MUTATION_GRAPH_REF,
  };

  if (propagation_mode === "off") {
    const idle = idleFingerprintAndTelemetry("off");
    const telemetry_bundle = {
      semantic_review_propagation_enabled: false,
      semantic_review_hints_generated: 0,
      semantic_review_shadow: false,
      semantic_review_propagation_skipped: true,
    };

    return {
      schema_version: SEMANTIC_REVIEW_PROPAGATION_SCHEMA_VERSION,
      propagation_mode,
      telemetry: telemetry_bundle,
      propagation_summary: null,
      semantic_review_metrics: null,
      semantic_review_hints: [],
      propagation_fingerprint_sha256: null,
      semantic_review_classification: null,
      semantic_review_propagation_fingerprint_sha256: idle.semantic_review_propagation_fingerprint_sha256,
      artifact_refs,
      skipped_reason: "semantic_review_propagation_off",
      extensions: {},
    };
  }

  const proj =
    inp.propagationManifestDoc && typeof inp.propagationManifestDoc === "object"
      ? inp.propagationManifestDoc
      : null;
  const graph =
    inp.semanticGraphDoc && typeof inp.semanticGraphDoc === "object"
      ? inp.semanticGraphDoc
      : null;

  let pack = null;
  let skipped_reason = null;

  if (graph) {
    pack = summarizePropagationFromGraph(graph);
    skipped_reason = null;
  } else if (proj) {
    pack = summarizePropagationFromProjectionOnly(proj);
    skipped_reason = "semantic_mutation_graph_missing_used_projection_fallback";
  } else {
    skipped_reason = "missing_semantic_artifacts";
    const idle = idleFingerprintAndTelemetry("shadow");
    const telemetry_bundle = {
      semantic_review_propagation_enabled: true,
      semantic_review_hints_generated: 0,
      semantic_review_shadow: true,
      semantic_review_propagation_skipped: true,
    };

    return {
      schema_version: SEMANTIC_REVIEW_PROPAGATION_SCHEMA_VERSION,
      propagation_mode,
      telemetry: telemetry_bundle,
      propagation_summary: null,
      semantic_review_metrics: null,
      semantic_review_hints: [],
      propagation_fingerprint_sha256: null,
      semantic_review_classification: null,
      semantic_review_propagation_fingerprint_sha256: idle.semantic_review_propagation_fingerprint_sha256,
      artifact_refs,
      skipped_reason,
      extensions: {},
    };
  }

  const riskReach = classifySemanticRiskReach({
    impacted_nodes_count: pack.metrics.impacted_nodes_count,
    max_propagation_depth: pack.metrics.max_propagation_depth,
    propagation_frontier_size: pack.metrics.propagation_frontier_size,
  });
  const semantic_review_classification = mapRiskReachToReviewClassification(riskReach);

  const hints =
    pack.metrics.metrics_basis === "semantic_mutation_graph"
      ? buildSemanticReviewHintsFromGraph(graph, pack.metrics, semantic_review_classification)
      : buildSemanticReviewHintsProjectionOnly(pack.metrics, semantic_review_classification);

  const semantic_review_metrics = buildSemanticReviewMetrics(hints, pack.metrics);

  const semantic_review_propagation_fingerprint_sha256 = computeSemanticReviewPropagationFingerprint({
    hints,
    semantic_review_metrics,
    semantic_review_classification,
    propagation_fingerprint_sha256: pack.propagation_fingerprint_sha256,
  });

  const telemetry_bundle = {
    semantic_review_propagation_enabled: true,
    semantic_review_hints_generated: hints.length,
    semantic_review_shadow: true,
    semantic_review_propagation_skipped: false,
  };

  return {
    schema_version: SEMANTIC_REVIEW_PROPAGATION_SCHEMA_VERSION,
    propagation_mode,
    telemetry: telemetry_bundle,
    propagation_summary: pack.propagation_summary_stable,
    semantic_review_metrics,
    semantic_review_hints: hints,
    propagation_fingerprint_sha256: pack.propagation_fingerprint_sha256,
    semantic_review_classification,
    semantic_review_propagation_fingerprint_sha256,
    artifact_refs,
    skipped_reason,
    extensions: {},
  };
}

module.exports = {
  SEMANTIC_REVIEW_PROPAGATION_SCHEMA_VERSION,
  MAX_HINT_VERTEX_SAMPLES,
  mapRiskReachToReviewClassification,
  buildSemanticReviewHintsFromGraph,
  buildSemanticReviewHintsProjectionOnly,
  buildSemanticReviewMetrics,
  computeSemanticReviewPropagationFingerprint,
  buildSemanticReviewPropagationBlock,
};
