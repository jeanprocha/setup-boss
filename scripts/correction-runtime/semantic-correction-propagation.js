"use strict";

/**
 * Semantic correction propagation — Fase 4.8.7 (shadow / report-only).
 * Consome propagation-manifest.json + semantic-mutation-graph.json.
 * Não altera decisões de retry nem políticas de correção.
 */

const {
  stableStringify,
  sha256HexUtf8,
} = require("../execution-plan/fingerprint/plan-fingerprint");
const {
  MutationReasonCodes,
} = require("../semantic-dependency-runtime/overlay/constants");
const {
  classifySemanticRiskReach,
  sortImpactedNodesLexical,
  summarizePropagationFromGraph,
  summarizePropagationFromProjectionOnly,
} = require("../risk-runtime/semantic-risk-propagation");
const {
  CORRECTION_SEMANTIC_PROPAGATION_MANIFEST_REF,
  CORRECTION_SEMANTIC_MUTATION_GRAPH_REF,
} = require("./constants");

const SEMANTIC_CORRECTION_PROPAGATION_SCHEMA_VERSION = "semantic-correction-propagation/1";
const SEMANTIC_CORRECTION_LINEAGE_REFS_SCHEMA_VERSION = "semantic-correction-lineage-refs/1";

const MAX_HINT_VERTEX_SAMPLES = 64;
const MAX_LINEAGE_PATHS = 512;

function mapRiskReachToCorrectionClassification(reach) {
  if (reach === "local") return "local_correction_impact";
  if (reach === "propagated") return "propagated_correction_impact";
  if (reach === "wide_propagation") return "wide_correction_impact";
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

function buildSemanticCorrectionHintsFromGraph(graphDoc, metrics, correctionClassification) {
  const nodesSorted = sortImpactedNodesLexical(
    graphDoc && Array.isArray(graphDoc.impacted_nodes) ? graphDoc.impacted_nodes : [],
  );
  const hints = [];

  const directKeys = collectDirectVertexKeys(nodesSorted);
  if (directKeys.length) {
    hints.push({
      hint_id: "direct_semantic_correction_impact",
      kind: "direct_semantic_correction_impact",
      summary:
        `Impacto semântico directo (correcção): ${directKeys.length} vértice(s) na raiz ou alteração directa.`,
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
      hint_id: "propagated_semantic_correction_impact",
      kind: "propagated_semantic_correction_impact",
      summary:
        forwardKeys.length > 0
          ? `Propagação semântica forward (correcção): ${forwardKeys.length} vértice(s) para além do núcleo directo.`
          : `Propagação semântica (correcção): profundidade máxima ${metrics.max_propagation_depth}, ${metrics.impacted_nodes_count} nós.`,
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
      hint_id: "reverse_semantic_correction_impact",
      kind: "reverse_semantic_correction_impact",
      summary: `Alcance reverso semântico (correcção): ${rev} vértice(s) com reverse_import_reach.`,
      evidence: {
        reverse_reach_count: rev,
      },
    });
  }

  if (correctionClassification === "wide_correction_impact") {
    hints.push({
      hint_id: "wide_semantic_correction_propagation",
      kind: "wide_semantic_correction_propagation",
      summary:
        "Propagação semântica ampla (correcção): alcance/profundidade/fronteira acima dos limiares locais.",
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

function buildSemanticCorrectionHintsProjectionOnly(metrics, correctionClassification) {
  const hints = [];
  const roots = Number(metrics.semantic_roots_count) || 0;
  const nodes = Number(metrics.impacted_nodes_count) || 0;

  if (nodes > 0) {
    hints.push({
      hint_id: "direct_semantic_correction_impact",
      kind: "direct_semantic_correction_impact",
      summary:
        `Impacto semântico directo por projecção (correcção): ${nodes} nó(s), ${roots} raiz(es).`,
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
      hint_id: "propagated_semantic_correction_impact",
      kind: "propagated_semantic_correction_impact",
      summary:
        "Propagação inferida pela projecção do manifest (sem grafo completo).",
      evidence: {
        max_propagation_depth: metrics.max_propagation_depth,
        impacted_nodes_count: nodes,
        semantic_roots_count: roots,
        metrics_basis: String(metrics.metrics_basis || ""),
      },
    });
  }

  if (correctionClassification === "wide_correction_impact") {
    hints.push({
      hint_id: "wide_semantic_correction_propagation",
      kind: "wide_semantic_correction_propagation",
      summary: "Propagação ampla por classificação de alcance (projecção).",
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

function buildSemanticCorrectionMetrics(hints, packMetrics) {
  return {
    impacted_nodes_count: packMetrics.impacted_nodes_count,
    impacted_edges_count: packMetrics.impacted_edges_count,
    semantic_roots_count: packMetrics.semantic_roots_count,
    propagation_frontier_size: packMetrics.propagation_frontier_size,
    max_propagation_depth: packMetrics.max_propagation_depth,
    semantic_correction_hint_count: hints.length,
  };
}

function clipSortedPaths(paths) {
  const u = [...new Set(paths.map(String).filter(Boolean))];
  u.sort((a, b) => a.localeCompare(b));
  return u.slice(0, MAX_LINEAGE_PATHS);
}

/**
 * @param {{
 *   propagationManifestDoc: object|null,
 *   semanticGraphDoc: object|null,
 *   pack: { propagation_fingerprint_sha256: string|null },
 *   lineageContext: { correction_analysis_id?: string, plan_id?: string, run_id?: string },
 * }} inp
 */
function buildSemanticLineageRefs(inp) {
  const proj = inp.propagationManifestDoc && typeof inp.propagationManifestDoc === "object"
    ? inp.propagationManifestDoc
    : null;
  const graph = inp.semanticGraphDoc && typeof inp.semanticGraphDoc === "object"
    ? inp.semanticGraphDoc
    : null;
  const pack = inp.pack && typeof inp.pack === "object" ? inp.pack : {};
  const ctx = inp.lineageContext && typeof inp.lineageContext === "object" ? inp.lineageContext : {};

  const pathSet = new Set();
  if (proj && Array.isArray(proj.impacted_paths)) {
    for (const pth of proj.impacted_paths) {
      if (pth) pathSet.add(String(pth));
    }
  }
  if (graph && Array.isArray(graph.impacted_nodes)) {
    for (const n of graph.impacted_nodes) {
      if (n && n.path) pathSet.add(String(n.path));
    }
  }

  const rootsSet = new Set();
  if (graph && Array.isArray(graph.roots)) {
    for (const r of graph.roots) {
      if (r && r.path) rootsSet.add(String(r.path));
    }
  }
  if (proj && Array.isArray(proj.roots_summary)) {
    for (const r of proj.roots_summary) {
      if (r && r.path) rootsSet.add(String(r.path));
    }
  }

  const corrId = ctx.correction_analysis_id != null ? String(ctx.correction_analysis_id) : "";
  const runId = ctx.run_id != null ? String(ctx.run_id) : "";
  const planId = ctx.plan_id != null ? String(ctx.plan_id) : "";

  const related_correction_ids_sorted = corrId ? [corrId].sort((a, b) => a.localeCompare(b)) : [];
  const related_run_ids_sorted = runId ? [runId].sort((a, b) => a.localeCompare(b)) : [];

  return {
    schema_version: SEMANTIC_CORRECTION_LINEAGE_REFS_SCHEMA_VERSION,
    impacted_paths_sorted: clipSortedPaths([...pathSet]),
    semantic_roots_sorted: clipSortedPaths([...rootsSet]),
    propagation_fingerprint_sha256:
      pack.propagation_fingerprint_sha256 != null ? String(pack.propagation_fingerprint_sha256) : null,
    correction_analysis_id: corrId,
    plan_id: planId,
    run_id: runId,
    related_correction_ids_sorted,
    related_run_ids_sorted,
  };
}

function minimalSemanticLineageRefs(lineageContext) {
  const ctx = lineageContext && typeof lineageContext === "object" ? lineageContext : {};
  return buildSemanticLineageRefs({
    propagationManifestDoc: null,
    semanticGraphDoc: null,
    pack: { propagation_fingerprint_sha256: null },
    lineageContext: ctx,
  });
}

function computeSemanticCorrectionPropagationFingerprint(inp) {
  const hintsStable = (inp.hints || [])
    .slice()
    .sort((a, b) => String(a.hint_id).localeCompare(String(b.hint_id)))
    .map((h) => ({ hint_id: h.hint_id, kind: h.kind }));

  return sha256HexUtf8(
    stableStringify({
      semantic_correction_propagation_schema: SEMANTIC_CORRECTION_PROPAGATION_SCHEMA_VERSION,
      propagation_fingerprint_sha256: inp.propagation_fingerprint_sha256,
      semantic_correction_classification: inp.semantic_correction_classification,
      semantic_correction_metrics: inp.semantic_correction_metrics,
      hints: hintsStable,
      semantic_lineage_refs_digest: inp.semantic_lineage_refs_digest || null,
    }),
  );
}

function lineageRefsStableDigest(refs) {
  if (!refs || typeof refs !== "object") return null;
  return stableStringify({
    impacted_paths_sorted: refs.impacted_paths_sorted,
    semantic_roots_sorted: refs.semantic_roots_sorted,
    propagation_fingerprint_sha256: refs.propagation_fingerprint_sha256,
    related_correction_ids_sorted: refs.related_correction_ids_sorted,
    related_run_ids_sorted: refs.related_run_ids_sorted,
  });
}

function idleFingerprintBundle(offShadow, lineageContext) {
  const semantic_correction_metrics = {
    impacted_nodes_count: 0,
    impacted_edges_count: 0,
    semantic_roots_count: 0,
    propagation_frontier_size: 0,
    max_propagation_depth: 0,
    semantic_correction_hint_count: 0,
  };
  const hints = [];
  const semantic_correction_classification = offShadow === "off" ? null : "idle";
  const lineageRefs =
    offShadow === "shadow" && lineageContext
      ? minimalSemanticLineageRefs(lineageContext)
      : null;

  const semantic_lineage_refs_digest = lineageRefs ? lineageRefsStableDigest(lineageRefs) : null;

  const semantic_correction_propagation_fingerprint_sha256 = computeSemanticCorrectionPropagationFingerprint({
    hints,
    semantic_correction_metrics,
    semantic_correction_classification: semantic_correction_classification || "idle",
    propagation_fingerprint_sha256: null,
    semantic_lineage_refs_digest,
  });

  return {
    semantic_correction_metrics,
    hints,
    semantic_correction_classification,
    propagation_fingerprint_sha256: null,
    semantic_correction_propagation_fingerprint_sha256,
    semantic_lineage_refs: lineageRefs,
  };
}

/**
 * @param {{
 *   mode: 'off'|'shadow',
 *   propagationManifestDoc: object|null,
 *   semanticGraphDoc: object|null,
 *   lineageContext?: { correction_analysis_id?: string, plan_id?: string, run_id?: string },
 * }} inp
 */
function buildSemanticCorrectionPropagationBlock(inp) {
  const propagation_mode = inp.mode === "shadow" ? "shadow" : "off";
  const lineageContext = inp.lineageContext && typeof inp.lineageContext === "object" ? inp.lineageContext : {};

  const artifact_refs = {
    propagation_manifest: CORRECTION_SEMANTIC_PROPAGATION_MANIFEST_REF,
    semantic_mutation_graph: CORRECTION_SEMANTIC_MUTATION_GRAPH_REF,
  };

  if (propagation_mode === "off") {
    const idle = idleFingerprintBundle("off", null);
    const telemetry_bundle = {
      semantic_correction_propagation_enabled: false,
      semantic_correction_hints_generated: 0,
      semantic_correction_shadow: false,
      semantic_correction_propagation_skipped: true,
    };

    return {
      schema_version: SEMANTIC_CORRECTION_PROPAGATION_SCHEMA_VERSION,
      propagation_mode,
      telemetry: telemetry_bundle,
      propagation_summary: null,
      semantic_correction_metrics: null,
      semantic_correction_hints: [],
      propagation_fingerprint_sha256: null,
      semantic_correction_classification: null,
      semantic_correction_propagation_fingerprint_sha256: idle.semantic_correction_propagation_fingerprint_sha256,
      semantic_lineage_refs: null,
      artifact_refs,
      skipped_reason: "semantic_correction_propagation_off",
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
    const idle = idleFingerprintBundle("shadow", lineageContext);
    const telemetry_bundle = {
      semantic_correction_propagation_enabled: true,
      semantic_correction_hints_generated: 0,
      semantic_correction_shadow: true,
      semantic_correction_propagation_skipped: true,
    };

    return {
      schema_version: SEMANTIC_CORRECTION_PROPAGATION_SCHEMA_VERSION,
      propagation_mode,
      telemetry: telemetry_bundle,
      propagation_summary: null,
      semantic_correction_metrics: null,
      semantic_correction_hints: [],
      propagation_fingerprint_sha256: null,
      semantic_correction_classification: null,
      semantic_correction_propagation_fingerprint_sha256: idle.semantic_correction_propagation_fingerprint_sha256,
      semantic_lineage_refs: idle.semantic_lineage_refs,
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
  const semantic_correction_classification = mapRiskReachToCorrectionClassification(riskReach);

  const hints =
    pack.metrics.metrics_basis === "semantic_mutation_graph"
      ? buildSemanticCorrectionHintsFromGraph(graph, pack.metrics, semantic_correction_classification)
      : buildSemanticCorrectionHintsProjectionOnly(pack.metrics, semantic_correction_classification);

  const semantic_correction_metrics = buildSemanticCorrectionMetrics(hints, pack.metrics);

  const semantic_lineage_refs = buildSemanticLineageRefs({
    propagationManifestDoc: proj,
    semanticGraphDoc: graph,
    pack,
    lineageContext,
  });

  const semantic_correction_propagation_fingerprint_sha256 = computeSemanticCorrectionPropagationFingerprint({
    hints,
    semantic_correction_metrics,
    semantic_correction_classification,
    propagation_fingerprint_sha256: pack.propagation_fingerprint_sha256,
    semantic_lineage_refs_digest: lineageRefsStableDigest(semantic_lineage_refs),
  });

  const telemetry_bundle = {
    semantic_correction_propagation_enabled: true,
    semantic_correction_hints_generated: hints.length,
    semantic_correction_shadow: true,
    semantic_correction_propagation_skipped: false,
  };

  return {
    schema_version: SEMANTIC_CORRECTION_PROPAGATION_SCHEMA_VERSION,
    propagation_mode,
    telemetry: telemetry_bundle,
    propagation_summary: pack.propagation_summary_stable,
    semantic_correction_metrics,
    semantic_correction_hints: hints,
    propagation_fingerprint_sha256: pack.propagation_fingerprint_sha256,
    semantic_correction_classification,
    semantic_correction_propagation_fingerprint_sha256,
    semantic_lineage_refs,
    artifact_refs,
    skipped_reason,
    extensions: {},
  };
}

module.exports = {
  SEMANTIC_CORRECTION_PROPAGATION_SCHEMA_VERSION,
  SEMANTIC_CORRECTION_LINEAGE_REFS_SCHEMA_VERSION,
  MAX_HINT_VERTEX_SAMPLES,
  MAX_LINEAGE_PATHS,
  mapRiskReachToCorrectionClassification,
  buildSemanticLineageRefs,
  buildSemanticCorrectionPropagationBlock,
  computeSemanticCorrectionPropagationFingerprint,
};
