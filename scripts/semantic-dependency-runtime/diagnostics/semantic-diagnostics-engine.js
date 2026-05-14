"use strict";

/**
 * Motor central de diagnóstico semântico (Fase 4.8.8).
 * Apenas leitura — não altera artefactos nem activa propagação.
 */

const fs = require("fs");
const path = require("path");
const {
  GRAPH_MANIFEST_FILENAME,
  GRAPH_SNAPSHOT_MANIFEST_FILENAME,
  SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION,
  SEMANTIC_DIAGNOSTICS_FILENAME,
} = require("../constants");
const {
  SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION,
  PROPAGATION_MANIFEST_SCHEMA_VERSION,
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  PROPAGATION_MANIFEST_FILENAME,
  MutationReasonCodes,
} = require("../overlay/constants");
const {
  validateDependencyGraph,
  validateSnapshotManifest,
} = require("../validation/graph-validation");
const { classifyImpactedSemanticNode } = require("../../execution-plan/validation-targeting/semantic-validation-propagation");
const { VALIDATION_PROPAGATION_MANIFEST_FILENAME } = require("../../execution-plan/validation-targeting/constants");
const { getSemanticValidationPropagationModeFromEnv } = require("../../execution-plan/feature-flags");
const { getSemanticRiskPropagationModeFromEnv } = require("../../risk-runtime/feature-flags");
const { getSemanticReviewPropagationModeFromEnv } = require("../../review-runtime/feature-flags");
const { getSemanticCorrectionPropagationModeFromEnv } = require("../../correction-runtime/feature-flags");
const { RISK_RUNTIME_MANIFEST_FILENAME } = require("../../risk-runtime/constants");
const {
  REVIEW_RUNTIME_MANIFEST_FILENAME,
  REVIEW_RESULTS_FILENAME,
  REVIEW_SEMANTIC_PROPAGATION_ARTIFACT,
} = require("../../review-runtime/constants");
const {
  CORRECTION_RUNTIME_MANIFEST_FILENAME,
  CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT,
  CORRECTION_RUNTIME_TELEMETRY_LOG,
} = require("../../correction-runtime/constants");
const { stableStringify } = require("../lib/stable-stringify");
const { summarizeSemanticGovernanceContinuity } = require("../../runtime/governance/governance-semantic-continuity");

const SHA256_HEX = /^[a-f0-9]{64}$/;

function readJsonIfExists(absPath) {
  try {
    if (!absPath || !fs.existsSync(absPath)) return null;
    const raw = fs.readFileSync(absPath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function fileExists(absPath) {
  try {
    return Boolean(absPath && fs.existsSync(absPath));
  } catch (_) {
    return false;
  }
}

function sortUniqueStrings(arr) {
  return [...new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function summarizeDependencyGraph(doc, validation) {
  if (!doc || typeof doc !== "object") {
    return {
      present: false,
      validation_ok: false,
      nodes_count: 0,
      edges_count: 0,
      lifecycle_state: null,
      graph_id: null,
      fingerprint_sha256: null,
      fingerprint_matches_validation: false,
    };
  }
  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc.edges) ? doc.edges : [];
  return {
    present: true,
    validation_ok: Boolean(validation && validation.ok),
    nodes_count: nodes.length,
    edges_count: edges.length,
    lifecycle_state: doc.lifecycle_state != null ? String(doc.lifecycle_state) : null,
    graph_id: doc.graph_id != null ? String(doc.graph_id) : null,
    fingerprint_sha256:
      doc.graph_fingerprint_sha256 != null ? String(doc.graph_fingerprint_sha256) : null,
    fingerprint_matches_validation: Boolean(validation && validation.ok),
  };
}

function summarizeSnapshot(doc, validationCtx, validation) {
  if (!doc || typeof doc !== "object") {
    return {
      present: false,
      validation_ok: false,
      snapshot_id: null,
      graph_id: null,
      graph_fingerprint_sha256: null,
    };
  }
  return {
    present: true,
    validation_ok: Boolean(validation && validation.ok),
    snapshot_id: doc.snapshot_id != null ? String(doc.snapshot_id) : null,
    graph_id: doc.graph_id != null ? String(doc.graph_id) : null,
    graph_fingerprint_sha256:
      doc.graph_fingerprint_sha256 != null ? String(doc.graph_fingerprint_sha256) : null,
    generation_policy_sha256:
      doc.generation_policy_sha256 != null ? String(doc.generation_policy_sha256) : null,
    validation_context_used: Boolean(
      validationCtx && (validationCtx.graphFingerprintSha256 != null || validationCtx.generationPolicy != null),
    ),
  };
}

function unresolvedImportsFromDependencyGraph(depGraph) {
  const gp = depGraph && depGraph.generation_policy && typeof depGraph.generation_policy === "object"
    ? depGraph.generation_policy
    : null;
  const raw = gp && Array.isArray(gp.unresolved_imports) ? gp.unresolved_imports : [];
  const normalized = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    normalized.push({
      from_relative: row.from_relative != null ? String(row.from_relative) : "",
      specifier: row.specifier != null ? String(row.specifier) : "",
    });
  }
  normalized.sort((a, b) =>
    `${a.from_relative}\u001e${a.specifier}`.localeCompare(`${b.from_relative}\u001e${b.specifier}`),
  );
  return normalized;
}

function graphCrossConsistency(depGraph, snapDoc) {
  /** @type {string[]} */
  const inconsistencies_sorted = [];
  if (!depGraph || !snapDoc) return { inconsistencies_sorted };

  const gidG = depGraph.graph_id != null ? String(depGraph.graph_id) : "";
  const gidS = snapDoc.graph_id != null ? String(snapDoc.graph_id) : "";
  if (gidG && gidS && gidG !== gidS) {
    inconsistencies_sorted.push(
      `graph-snapshot.json graph_id (${gidS}) não coincide com dependency-graph.json graph_id (${gidG}).`,
    );
  }

  const fpG = depGraph.graph_fingerprint_sha256 != null ? String(depGraph.graph_fingerprint_sha256) : "";
  const fpS = snapDoc.graph_fingerprint_sha256 != null ? String(snapDoc.graph_fingerprint_sha256) : "";
  if (fpG && fpS && fpG !== fpS) {
    inconsistencies_sorted.push(
      "Fingerprint do grafo no snapshot diverge do dependency-graph.json (possível snapshot obsoleto ou grafo substituído).",
    );
  }

  inconsistencies_sorted.sort((a, b) => a.localeCompare(b));
  return { inconsistencies_sorted };
}

function propagationFingerprintConsistency(projDoc, mutGraphDoc) {
  /** @type {string[]} */
  const inconsistencies_sorted = [];
  if (!projDoc || !mutGraphDoc) return { inconsistencies_sorted };

  const a = projDoc.propagation_fingerprint_sha256 != null ? String(projDoc.propagation_fingerprint_sha256) : "";
  const b =
    mutGraphDoc.propagation_fingerprint_sha256 != null ? String(mutGraphDoc.propagation_fingerprint_sha256) : "";

  if (a && b && a !== b) {
    inconsistencies_sorted.push(
      "propagation-manifest.json propagation_fingerprint_sha256 difere de semantic-mutation-graph.json — projecção vs grafo não alinhados.",
    );
  }

  inconsistencies_sorted.sort((x, y) => x.localeCompare(y));
  return { inconsistencies_sorted };
}

function validateSemanticMutationGraphBasic(doc) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["semantic-mutation-graph ausente ou inválido"] };
  }
  if (String(doc.schema_version || "") !== SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION) {
    errors.push(`schema_version esperado ${SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION}`);
  }
  const fp = doc.propagation_fingerprint_sha256 != null ? String(doc.propagation_fingerprint_sha256) : "";
  if (fp && !SHA256_HEX.test(fp)) {
    errors.push("propagation_fingerprint_sha256 com formato inválido");
  }
  if (!Array.isArray(doc.impacted_nodes)) errors.push("impacted_nodes deve ser array");
  return { ok: errors.length === 0, errors };
}

function validatePropagationManifestBasic(doc) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["propagation-manifest ausente ou inválido"] };
  }
  if (String(doc.schema_version || "") !== PROPAGATION_MANIFEST_SCHEMA_VERSION) {
    errors.push(`schema_version esperado ${PROPAGATION_MANIFEST_SCHEMA_VERSION}`);
  }
  const fp = doc.propagation_fingerprint_sha256 != null ? String(doc.propagation_fingerprint_sha256) : "";
  if (fp && !SHA256_HEX.test(fp)) {
    errors.push("propagation_fingerprint_sha256 com formato inválido");
  }
  return { ok: errors.length === 0, errors };
}

function explainLimitsApplied(snapshotLimits, executionLimits) {
  /** @type {string[]} */
  const out = [];
  const snap = snapshotLimits && typeof snapshotLimits === "object" ? snapshotLimits : {};
  const exec = executionLimits && typeof executionLimits === "object" ? executionLimits : {};

  if (Object.keys(snap).length) {
    out.push(
      `Limites configurados no overlay: max_hops=${snap.max_hops}, max_nodes=${snap.max_nodes}, max_edges=${snap.max_edges}, reverse=${snap.enable_reverse_reach !== false}.`,
    );
  }

  function explainBranch(label, branch) {
    if (!branch || typeof branch !== "object") return;
    if (branch.max_edges_hit) {
      out.push(
        `${label}: expansão interrompida — limite max_edges atingido (${snapshotLimits && snapshotLimits.max_edges != null ? snapshotLimits.max_edges : "?"} arestas máx.).`,
      );
    }
    if (branch.max_nodes_hit) {
      out.push(
        `${label}: expansão cortada — limite max_nodes atingido (${snapshotLimits && snapshotLimits.max_nodes != null ? snapshotLimits.max_nodes : "?"} vértices máx.).`,
      );
    }
    const skips = Number(branch.max_hops_truncated_neighbor_skips) || 0;
    if (skips > 0) {
      out.push(
        `${label}: ${skips} vizinho(s) ignorado(s) por profundidade — hops máximo (${snapshotLimits && snapshotLimits.max_hops != null ? snapshotLimits.max_hops : "?"}) impediu expandir mais longe.`,
      );
    }
  }

  explainBranch("Forward (imports)", exec.forward);
  explainBranch("Reverse (importadores)", exec.reverse);

  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function reasonCodeExplanation(code) {
  const c = String(code || "");
  switch (c) {
    case MutationReasonCodes.DIRECT_CHANGE:
      return "associado a alteração directa registada no executor.";
    case MutationReasonCodes.RECONCILIATION_UNEXPECTED:
      return "ligado a mudança inesperada na reconciliação plano vs executor.";
    case MutationReasonCodes.RECONCILIATION_UNMATCHED:
      return "ligado a operação planeada não correspondida na reconciliação.";
    case MutationReasonCodes.IMPORT_REACH:
      return "atingido ao seguir dependências de import estática/relativa no grafo.";
    case MutationReasonCodes.REVERSE_IMPORT_REACH:
      return "atingido pela direcção inversa (módulos que importam o núcleo alterado).";
    case MutationReasonCodes.EXPLICIT_ROOT:
      return "marcado como root explícito na entrada do overlay.";
    default:
      return c ? `motivo técnico registrado: ${c}.` : "sem código de motivo.";
  }
}

function explainImpactedPath(node, rootsSorted) {
  const pth = node.path != null ? String(node.path) : "";
  const nodeId = node.node_id != null ? String(node.node_id) : "";
  const depthRaw = node.distance_from_root;
  const depthNum =
    depthRaw === null || depthRaw === undefined || depthRaw === "" ? NaN : Number(depthRaw);
  const discovered = node.discovered_from != null ? String(node.discovered_from).trim() : "";
  const rc = sortUniqueStrings(Array.isArray(node.reason_codes) ? node.reason_codes : []);

  /** @type {string[]} */
  const explanation_parts = [];

  const rootsThatMatch =
    discovered && rootsSorted.length
      ? rootsSorted.filter((r) => r === discovered || discovered.startsWith(`${r}/`) || r.startsWith(`${discovered}/`))
      : [];

  if (discovered) {
    explanation_parts.push(
      `Primeira descoberta no grafo a partir do caminho «${discovered}» (campeonato de seeds ordenado pelo overlay).`,
    );
  }

  if (!Number.isNaN(depthNum)) {
    explanation_parts.push(`Profundidade de hops desde a seed escolhida: ${depthNum}.`);
  }

  for (const code of rc) {
    explanation_parts.push(`Código ${code}: ${reasonCodeExplanation(code)}`);
  }

  if (rootsThatMatch.length) {
    explanation_parts.push(
      `Raiz(es) de mutação compatível(is) com discovered_from: ${rootsThatMatch.join(", ")}.`,
    );
  } else if (rootsSorted.length && discovered) {
    explanation_parts.push(
      `Nenhuma raiz listada em roots coincide literalmente com discovered_from; seeds podem ter sido normalizadas ou indirectas.`,
    );
  }

  const valKlass = classifyImpactedSemanticNode(node);

  return {
    path: pth,
    node_id: nodeId,
    depth_from_root: Number.isNaN(depthNum) ? null : depthNum,
    reason_codes_sorted: rc,
    discovered_from: discovered || null,
    roots_origin_candidates_sorted: sortUniqueStrings(rootsThatMatch.length ? rootsThatMatch : rootsSorted.slice(0, 8)),
    semantic_candidate_classification: valKlass,
    explanation_parts_sorted: sortUniqueStrings(explanation_parts),
  };
}

function aggregateSemanticClassifications(mutGraphDoc) {
  const nodes = mutGraphDoc && Array.isArray(mutGraphDoc.impacted_nodes) ? mutGraphDoc.impacted_nodes : [];
  const counts = {};
  for (const n of nodes) {
    const k = classifyImpactedSemanticNode(n);
    counts[k] = (counts[k] || 0) + 1;
  }
  const keys = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  const by_classification_sorted = keys.map((k) => ({ classification: k, count: counts[k] }));
  return { by_classification_sorted, distinct_classifications_sorted: keys };
}

function scanSemanticTelemetryNdjson(outputDir) {
  const dir = String(outputDir || "");
  const targets = [
    { label: "correction_runtime", rel: CORRECTION_RUNTIME_TELEMETRY_LOG },
  ];

  /** @type {{ file: string, kinds_sorted: string[], semantic_payloads_sorted: object[] }[]} */
  const per_file = [];

  for (const t of targets) {
    const abs = path.join(dir, t.rel);
    if (!fileExists(abs)) continue;

    /** @type {Set<string>} */
    const kinds = new Set();
    /** @type {object[]} */
    const payloads = [];

    try {
      const lines = fs.readFileSync(abs, "utf8").split("\n");
      for (const line of lines) {
        const s = String(line || "").trim();
        if (!s) continue;
        let obj;
        try {
          obj = JSON.parse(s);
        } catch (_) {
          continue;
        }
        const kind = obj && obj.kind != null ? String(obj.kind) : "";
        const hit = /semantic/i.test(kind);
        if (!hit) continue;

        kinds.add(kind);
        payloads.push({
          ts: obj.ts != null ? String(obj.ts) : "",
          kind,
          semantic_review_propagation_enabled: obj.semantic_review_propagation_enabled,
          semantic_review_hints_generated: obj.semantic_review_hints_generated,
          semantic_review_shadow: obj.semantic_review_shadow,
          semantic_review_propagation_skipped: obj.semantic_review_propagation_skipped,
          semantic_correction_propagation_enabled: obj.semantic_correction_propagation_enabled,
          semantic_correction_hints_generated: obj.semantic_correction_hints_generated,
          semantic_correction_shadow: obj.semantic_correction_shadow,
          semantic_correction_propagation_skipped: obj.semantic_correction_propagation_skipped,
        });
      }
    } catch (_) {
      continue;
    }

    payloads.sort((a, b) =>
      `${a.kind}\u001e${a.ts}`.localeCompare(`${b.kind}\u001e${b.ts}`),
    );

    per_file.push({
      file: t.rel,
      kinds_sorted: [...kinds].sort((a, b) => a.localeCompare(b)),
      semantic_payloads_sorted: payloads.slice(-200),
    });
  }

  per_file.sort((a, b) => a.file.localeCompare(b.file));

  let semantic_correction_propagation_events = 0;
  let semantic_hint_generation_totals = 0;
  for (const pf of per_file) {
    for (const row of pf.semantic_payloads_sorted) {
      if (String(row.kind || "").includes("semantic_correction_propagation")) {
        semantic_correction_propagation_events += 1;
      }
      const hg = Number(row.semantic_correction_hints_generated);
      if (Number.isFinite(hg)) semantic_hint_generation_totals += hg;
    }
  }

  return {
    ndjson_summaries_sorted: per_file,
    aggregates: {
      semantic_correction_propagation_events,
      semantic_correction_hints_generated_sum_observed: semantic_hint_generation_totals,
    },
  };
}

function summarizeValidationIntegration(vpManifest) {
  const envMode = getSemanticValidationPropagationModeFromEnv();
  if (!vpManifest || typeof vpManifest !== "object") {
    return {
      runtime: "validation",
      artifact_present: false,
      env_propagation_mode: envMode,
      manifest_propagation_mode: null,
      semantic_candidates_count: 0,
      semantic_shadow_targets_count: 0,
      propagation_fingerprint_sha256: null,
    };
  }

  const expanded = Array.isArray(vpManifest.expanded_targets) ? vpManifest.expanded_targets : [];
  const shadowTargets = expanded.filter(
    (x) => x && String(x.expansion_source || "") === "semantic_shadow_candidate",
  );

  return {
    runtime: "validation",
    artifact_present: true,
    env_propagation_mode: envMode,
    manifest_propagation_mode: vpManifest.propagation_mode != null ? String(vpManifest.propagation_mode) : null,
    semantic_candidates_count: Array.isArray(vpManifest.semantic_candidates)
      ? vpManifest.semantic_candidates.length
      : 0,
    semantic_shadow_targets_count: shadowTargets.length,
    propagation_fingerprint_sha256:
      vpManifest.propagation_fingerprint_sha256 != null
        ? String(vpManifest.propagation_fingerprint_sha256)
        : null,
  };
}

function integrationBlockFromSemanticPropagation(block, runtimeLabel) {
  if (!block || typeof block !== "object") {
    return {
      runtime: runtimeLabel,
      artifact_block_present: false,
      propagation_mode: null,
      telemetry: null,
      semantic_classification: null,
      propagation_fingerprint_sha256: null,
      semantic_metrics: null,
      hints_generated: null,
    };
  }

  const tel = block.telemetry && typeof block.telemetry === "object" ? block.telemetry : null;
  const metrics =
    block.semantic_risk_metrics ||
    block.semantic_review_metrics ||
    block.semantic_correction_metrics ||
    null;

  const klass =
    block.semantic_risk_classification ||
    block.semantic_review_classification ||
    block.semantic_correction_classification ||
    null;

  let hintsCount = null;
  if (Array.isArray(block.semantic_review_hints)) hintsCount = block.semantic_review_hints.length;
  else if (Array.isArray(block.semantic_correction_hints)) hintsCount = block.semantic_correction_hints.length;
  if (tel && tel.semantic_review_hints_generated != null) hintsCount = Number(tel.semantic_review_hints_generated);
  if (tel && tel.semantic_correction_hints_generated != null) {
    hintsCount = Number(tel.semantic_correction_hints_generated);
  }

  return {
    runtime: runtimeLabel,
    artifact_block_present: true,
    propagation_mode: block.propagation_mode != null ? String(block.propagation_mode) : null,
    telemetry: tel,
    semantic_classification: klass != null ? String(klass) : null,
    propagation_fingerprint_sha256:
      block.propagation_fingerprint_sha256 != null ? String(block.propagation_fingerprint_sha256) : null,
    semantic_metrics: metrics,
    hints_generated: hintsCount,
    skipped_reason: block.skipped_reason != null ? String(block.skipped_reason) : null,
    hints_present:
      Array.isArray(block.semantic_review_hints) || Array.isArray(block.semantic_correction_hints),
  };
}

function buildRuntimeIntegrationsSummary(outputDir, artifacts) {
  const dir = String(outputDir || "");

  const riskManifest = artifacts.risk_runtime_manifest;
  const reviewManifest = artifacts.review_runtime_manifest;
  const reviewResults = artifacts.review_results;
  const correctionManifest = artifacts.correction_runtime_manifest;

  const riskBlock = riskManifest && riskManifest.semantic_propagation ? riskManifest.semantic_propagation : null;
  const reviewBlock =
    reviewManifest && reviewManifest.semantic_propagation
      ? reviewManifest.semantic_propagation
      : reviewResults && reviewResults.extensions && reviewResults.extensions.semantic_propagation
        ? reviewResults.extensions.semantic_propagation
        : null;
  const correctionBlock =
    correctionManifest && correctionManifest.semantic_propagation
      ? correctionManifest.semantic_propagation
      : readJsonIfExists(path.join(dir, CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT));

  return {
    env_modes: {
      validation_semantic_propagation: getSemanticValidationPropagationModeFromEnv(),
      risk_semantic_propagation: getSemanticRiskPropagationModeFromEnv(),
      review_semantic_propagation: getSemanticReviewPropagationModeFromEnv(),
      correction_semantic_propagation: getSemanticCorrectionPropagationModeFromEnv(),
    },
    artifact_refs_present_sorted: sortUniqueStrings([
      fileExists(path.join(dir, VALIDATION_PROPAGATION_MANIFEST_FILENAME))
        ? VALIDATION_PROPAGATION_MANIFEST_FILENAME
        : "",
      fileExists(path.join(dir, RISK_RUNTIME_MANIFEST_FILENAME)) ? RISK_RUNTIME_MANIFEST_FILENAME : "",
      fileExists(path.join(dir, REVIEW_RUNTIME_MANIFEST_FILENAME)) ? REVIEW_RUNTIME_MANIFEST_FILENAME : "",
      fileExists(path.join(dir, REVIEW_RESULTS_FILENAME)) ? REVIEW_RESULTS_FILENAME : "",
      fileExists(path.join(dir, REVIEW_SEMANTIC_PROPAGATION_ARTIFACT)) ? REVIEW_SEMANTIC_PROPAGATION_ARTIFACT : "",
      fileExists(path.join(dir, CORRECTION_RUNTIME_MANIFEST_FILENAME))
        ? CORRECTION_RUNTIME_MANIFEST_FILENAME
        : "",
      fileExists(path.join(dir, CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT))
        ? CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT
        : "",
    ]),
    integrations_sorted: [
      summarizeValidationIntegration(artifacts.validation_propagation_manifest),
      {
        runtime: "risk",
        env_mode: getSemanticRiskPropagationModeFromEnv(),
        ...integrationBlockFromSemanticPropagation(riskBlock, "risk"),
      },
      {
        runtime: "review",
        env_mode: getSemanticReviewPropagationModeFromEnv(),
        ...integrationBlockFromSemanticPropagation(reviewBlock, "review"),
      },
      {
        runtime: "correction",
        env_mode: getSemanticCorrectionPropagationModeFromEnv(),
        ...integrationBlockFromSemanticPropagation(correctionBlock, "correction"),
      },
    ],
  };
}

/**
 * @param {string} outputDir
 * @param {{ includeGeneratedAt?: boolean }} [opts]
 */
function generateSemanticDiagnosticsReport(outputDir, opts = {}) {
  const dir = path.resolve(String(outputDir || ""));
  const includeGeneratedAt = opts.includeGeneratedAt !== false;

  const depPath = path.join(dir, GRAPH_MANIFEST_FILENAME);
  const snapPath = path.join(dir, GRAPH_SNAPSHOT_MANIFEST_FILENAME);
  const mutPath = path.join(dir, SEMANTIC_MUTATION_GRAPH_FILENAME);
  const projPath = path.join(dir, PROPAGATION_MANIFEST_FILENAME);
  const vpPath = path.join(dir, VALIDATION_PROPAGATION_MANIFEST_FILENAME);

  const depGraph = readJsonIfExists(depPath);
  const snapDoc = readJsonIfExists(snapPath);
  const mutGraphDoc = readJsonIfExists(mutPath);
  const projDoc = readJsonIfExists(projPath);
  const vpManifest = readJsonIfExists(vpPath);
  const riskManifest = readJsonIfExists(path.join(dir, RISK_RUNTIME_MANIFEST_FILENAME));
  const reviewManifest = readJsonIfExists(path.join(dir, REVIEW_RUNTIME_MANIFEST_FILENAME));
  const reviewResults = readJsonIfExists(path.join(dir, REVIEW_RESULTS_FILENAME));
  const correctionManifest = readJsonIfExists(path.join(dir, CORRECTION_RUNTIME_MANIFEST_FILENAME));

  const depValidation = validateDependencyGraph(depGraph || {});
  const snapValidation = validateSnapshotManifest(snapDoc || {}, {
    graphFingerprintSha256: depGraph && depGraph.graph_fingerprint_sha256,
    generationPolicy: depGraph && depGraph.generation_policy,
  });

  const mutValidation = validateSemanticMutationGraphBasic(mutGraphDoc);
  const projValidation = validatePropagationManifestBasic(projDoc);

  const artifacts_presence = {
    dependency_graph_json: fileExists(depPath),
    graph_snapshot_json: fileExists(snapPath),
    semantic_mutation_graph_json: fileExists(mutPath),
    propagation_manifest_json: fileExists(projPath),
    validation_propagation_manifest_json: fileExists(vpPath),
    risk_runtime_manifest_json: fileExists(path.join(dir, RISK_RUNTIME_MANIFEST_FILENAME)),
    review_runtime_manifest_json: fileExists(path.join(dir, REVIEW_RUNTIME_MANIFEST_FILENAME)),
    review_results_json: fileExists(path.join(dir, REVIEW_RESULTS_FILENAME)),
    correction_runtime_manifest_json: fileExists(path.join(dir, CORRECTION_RUNTIME_MANIFEST_FILENAME)),
    review_semantic_propagation_json: fileExists(path.join(dir, REVIEW_SEMANTIC_PROPAGATION_ARTIFACT)),
    correction_semantic_propagation_json: fileExists(path.join(dir, CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT)),
  };

  const graph_summary = {
    dependency_graph: summarizeDependencyGraph(depGraph, depValidation),
    graph_snapshot: summarizeSnapshot(snapDoc, {
      graphFingerprintSha256: depGraph && depGraph.graph_fingerprint_sha256,
      generationPolicy: depGraph && depGraph.generation_policy,
    }, snapValidation),
    cross_consistency: graphCrossConsistency(depGraph || {}, snapDoc || {}),
    unresolved_imports_sorted: unresolvedImportsFromDependencyGraph(depGraph || {}),
    unresolved_imports_count:
      unresolvedImportsFromDependencyGraph(depGraph || {}).length,
  };

  const overlay_summary = {
    semantic_mutation_graph_validation: mutValidation,
    propagation_manifest_validation: projValidation,
    propagation_fingerprint_consistency: propagationFingerprintConsistency(projDoc || {}, mutGraphDoc || {}),
    propagation_summary: mutGraphDoc && mutGraphDoc.propagation_summary ? mutGraphDoc.propagation_summary : null,
    roots_paths_sorted: sortUniqueStrings(
      (mutGraphDoc && Array.isArray(mutGraphDoc.roots) ? mutGraphDoc.roots : []).map((r) =>
        r && r.path != null ? String(r.path) : "",
      ),
    ),
    impacted_nodes_count:
      mutGraphDoc && Array.isArray(mutGraphDoc.impacted_nodes) ? mutGraphDoc.impacted_nodes.length : 0,
    impacted_edges_count:
      mutGraphDoc && Array.isArray(mutGraphDoc.impacted_edges) ? mutGraphDoc.impacted_edges.length : 0,
  };

  const limits_snapshot = mutGraphDoc && mutGraphDoc.limits_snapshot ? mutGraphDoc.limits_snapshot : null;
  const limits_execution = mutGraphDoc && mutGraphDoc.limits_execution ? mutGraphDoc.limits_execution : null;

  const limits_explanations_sorted = explainLimitsApplied(limits_snapshot, limits_execution);

  const rootsForExplain = overlay_summary.roots_paths_sorted;
  const path_explanations_sorted =
    mutGraphDoc && Array.isArray(mutGraphDoc.impacted_nodes)
      ? mutGraphDoc.impacted_nodes
          .slice()
          .map((n) => explainImpactedPath(n, rootsForExplain))
          .sort((a, b) => a.path.localeCompare(b.path))
      : [];

  const semantic_classifications = mutGraphDoc
    ? aggregateSemanticClassifications(mutGraphDoc)
    : { by_classification_sorted: [], distinct_classifications_sorted: [] };

  const skippedSignals = [];
  function pushSkipped(label, tel) {
    if (!tel || typeof tel !== "object") return;
    const k =
      tel.semantic_risk_propagation_skipped ??
      tel.semantic_review_propagation_skipped ??
      tel.semantic_correction_propagation_skipped;
    if (k === true) skippedSignals.push(`${label}:propagation_skipped_true`);
  }
  pushSkipped("risk", riskManifest && riskManifest.semantic_propagation && riskManifest.semantic_propagation.telemetry);
  pushSkipped(
    "review",
    reviewManifest && reviewManifest.semantic_propagation && reviewManifest.semantic_propagation.telemetry,
  );
  pushSkipped(
    "correction",
    correctionManifest &&
      correctionManifest.semantic_propagation &&
      correctionManifest.semantic_propagation.telemetry,
  );

  const telemetry_summary = {
    ndjson: scanSemanticTelemetryNdjson(dir),
    skipped_propagation_signals_sorted: sortUniqueStrings(skippedSignals),
    semantic_hint_counts_observed: {
      review:
        reviewManifest &&
        reviewManifest.semantic_propagation &&
        reviewManifest.semantic_propagation.semantic_review_metrics
          ? reviewManifest.semantic_propagation.semantic_review_metrics.semantic_review_hint_count
          : null,
      correction:
        correctionManifest &&
        correctionManifest.semantic_propagation &&
        correctionManifest.semantic_propagation.semantic_correction_metrics
          ? correctionManifest.semantic_propagation.semantic_correction_metrics.semantic_correction_hint_count
          : null,
    },
  };

  const lifecycle_summary = {
    dependency_graph_lifecycle: depGraph && depGraph.lifecycle_state != null ? String(depGraph.lifecycle_state) : null,
    semantic_overlay_created_at: mutGraphDoc && mutGraphDoc.created_at != null ? String(mutGraphDoc.created_at) : null,
    snapshot_created_at: snapDoc && snapDoc.created_at != null ? String(snapDoc.created_at) : null,
  };

  const fingerprints = {
    dependency_graph_sha256: graph_summary.dependency_graph.fingerprint_sha256,
    snapshot_graph_sha256: graph_summary.graph_snapshot.graph_fingerprint_sha256,
    propagation_upstream_sha256:
      mutGraphDoc && mutGraphDoc.propagation_fingerprint_sha256 != null
        ? String(mutGraphDoc.propagation_fingerprint_sha256)
        : projDoc && projDoc.propagation_fingerprint_sha256 != null
          ? String(projDoc.propagation_fingerprint_sha256)
          : null,
  };

  const inconsistencies_sorted = sortUniqueStrings([
    ...(graph_summary.cross_consistency.inconsistencies_sorted || []),
    ...(overlay_summary.propagation_fingerprint_consistency.inconsistencies_sorted || []),
    ...(!depValidation.ok ? depValidation.errors.map((e) => `dependency-graph: ${e}`) : []),
    ...(!snapValidation.ok ? snapValidation.errors.map((e) => `graph-snapshot: ${e}`) : []),
    ...(!mutValidation.ok ? mutValidation.errors.map((e) => `semantic-mutation-graph: ${e}`) : []),
    ...(!projValidation.ok ? projValidation.errors.map((e) => `propagation-manifest: ${e}`) : []),
  ]);

  const artifactsBundle = {
    validation_propagation_manifest: vpManifest,
    risk_runtime_manifest: riskManifest,
    review_runtime_manifest: reviewManifest,
    review_results: reviewResults,
    correction_runtime_manifest: correctionManifest,
  };

  const report = {
    schema_version: SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION,
    ...(includeGeneratedAt ? { generated_at: new Date().toISOString() } : {}),
    output_dir: dir,
    artifacts_presence,
    graph_summary,
    overlay_summary,
    propagation_summary:
      projDoc && typeof projDoc === "object"
        ? {
            impacted_paths_sorted: sortUniqueStrings(
              Array.isArray(projDoc.impacted_paths) ? projDoc.impacted_paths : [],
            ),
            impacted_stats: projDoc.impacted_stats || projDoc.propagation_stats || null,
          }
        : null,
    lifecycle_summary,
    fingerprints,
    limits_applied: {
      limits_snapshot,
      limits_execution,
      explanations_sorted: limits_explanations_sorted,
    },
    semantic_classifications,
    path_explanations_sorted,
    runtime_integrations_summary: buildRuntimeIntegrationsSummary(dir, artifactsBundle),
    telemetry_summary,
    inconsistencies_sorted,
    explanations_consolidated_sorted: sortUniqueStrings([
      ...limits_explanations_sorted,
      ...inconsistencies_sorted.map((x) => `Inconsistência: ${x}`),
    ]),
    diagnostics_meta: {
      engine: "semantic-diagnostics-engine/1",
      read_only: true,
      persistence_filename: SEMANTIC_DIAGNOSTICS_FILENAME,
    },
    governance_semantic_continuity_snapshot: summarizeSemanticGovernanceContinuity(dir),
  };

  return report;
}

function semanticDiagnosticsCanonicalFingerprint(report) {
  const clone = JSON.parse(JSON.stringify(report));
  delete clone.generated_at;
  return stableStringify(clone);
}

module.exports = {
  SEMANTIC_DIAGNOSTICS_FILENAME,
  generateSemanticDiagnosticsReport,
  semanticDiagnosticsCanonicalFingerprint,
  readJsonIfExists,
};
