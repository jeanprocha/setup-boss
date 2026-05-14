"use strict";

/**
 * Semantic Validation Propagation v1 — liga propagation-manifest ao validation-targeting (report-only/shadow).
 * Não altera validation-targets.json nem validators executados.
 */

const path = require("path");
const fs = require("fs");
const {
  stableStringify,
  sha256HexUtf8,
} = require("../fingerprint/plan-fingerprint");
const { normalizePath } = require("../normalization/operation-normalizer");
const { inferValidationScope } = require("./scope-inference");
const { inferValidators } = require("./validator-inference");
const {
  PROPAGATION_MANIFEST_FILENAME,
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  MutationReasonCodes,
} = require("../../semantic-dependency-runtime/overlay/constants");
const {
  VALIDATION_PROPAGATION_MANIFEST_FILENAME,
  VALIDATION_PROPAGATION_MANIFEST_SCHEMA_VERSION,
  VALIDATION_SEMANTIC_EXPANSION_CANDIDATE_CAP_DEFAULT,
} = require("./constants");

const SEMANTIC_CANDIDATE_CLASSIFICATION = Object.freeze({
  DIRECT_SEMANTIC_DEPENDENCY: "direct_semantic_dependency",
  TRANSITIVE_SEMANTIC_DEPENDENCY: "transitive_semantic_dependency",
  REVERSE_SEMANTIC_DEPENDENCY: "reverse_semantic_dependency",
  RECONCILIATION_RELATED: "reconciliation_related",
});

/** @typedef {'off'|'shadow'} SemanticPropagationMode */

/**
 * Prioridade numérica menor = mais forte (merge determinístico).
 */
function classificationRank(klass) {
  const order = [
    SEMANTIC_CANDIDATE_CLASSIFICATION.RECONCILIATION_RELATED,
    SEMANTIC_CANDIDATE_CLASSIFICATION.REVERSE_SEMANTIC_DEPENDENCY,
    SEMANTIC_CANDIDATE_CLASSIFICATION.TRANSITIVE_SEMANTIC_DEPENDENCY,
    SEMANTIC_CANDIDATE_CLASSIFICATION.DIRECT_SEMANTIC_DEPENDENCY,
  ];
  const i = order.indexOf(klass);
  return i === -1 ? order.length + 99 : i;
}

/**
 * @param {object|null} impactedNode vértice de semantic-mutation-graph (impacted_nodes) ou null
 */
function classifyImpactedSemanticNode(impactedNode) {
  if (!impactedNode || typeof impactedNode !== "object") {
    return SEMANTIC_CANDIDATE_CLASSIFICATION.TRANSITIVE_SEMANTIC_DEPENDENCY;
  }
  const reasons = new Set(
    Array.isArray(impactedNode.reason_codes)
      ? impactedNode.reason_codes.map((x) => String(x || "").trim())
      : [],
  );
  const distRaw = impactedNode.distance_from_root;
  const distNum =
    distRaw === null || distRaw === undefined || distRaw === "" ? NaN : Number(distRaw);

  if (
    reasons.has(MutationReasonCodes.RECONCILIATION_UNEXPECTED) ||
    reasons.has(MutationReasonCodes.RECONCILIATION_UNMATCHED)
  ) {
    return SEMANTIC_CANDIDATE_CLASSIFICATION.RECONCILIATION_RELATED;
  }

  if (reasons.has(MutationReasonCodes.REVERSE_IMPORT_REACH)) {
    return SEMANTIC_CANDIDATE_CLASSIFICATION.REVERSE_SEMANTIC_DEPENDENCY;
  }

  if (!Number.isNaN(distNum) && distNum > 0 && reasons.has(MutationReasonCodes.IMPORT_REACH)) {
    return SEMANTIC_CANDIDATE_CLASSIFICATION.TRANSITIVE_SEMANTIC_DEPENDENCY;
  }

  if (
    reasons.has(MutationReasonCodes.DIRECT_CHANGE) ||
    reasons.has(MutationReasonCodes.EXPLICIT_ROOT)
  ) {
    return SEMANTIC_CANDIDATE_CLASSIFICATION.DIRECT_SEMANTIC_DEPENDENCY;
  }

  if (!Number.isNaN(distNum) && distNum === 0 && reasons.size === 0) {
    return SEMANTIC_CANDIDATE_CLASSIFICATION.DIRECT_SEMANTIC_DEPENDENCY;
  }

  if (reasons.has(MutationReasonCodes.IMPORT_REACH)) {
    return SEMANTIC_CANDIDATE_CLASSIFICATION.TRANSITIVE_SEMANTIC_DEPENDENCY;
  }

  return SEMANTIC_CANDIDATE_CLASSIFICATION.TRANSITIVE_SEMANTIC_DEPENDENCY;
}

/** @returns {typeof SEMANTIC_CANDIDATE_CLASSIFICATION[keyof typeof SEMANTIC_CANDIDATE_CLASSIFICATION]} */
function pickStrongerClassification(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ra = classificationRank(a);
  const rb = classificationRank(b);
  if (rb < ra) return b;
  if (ra < rb) return a;
  return String(a).localeCompare(String(b)) <= 0 ? a : b;
}

function posixDirForPath(relPath) {
  const raw = normalizePath(relPath || "");
  if (!raw || raw === ".") return ".";
  return path.posix.dirname(raw);
}

function surrogateFileForModule(directory, impactedPathsSorted) {
  const d = POSIX_KEY(directory);
  const pref = d === "." ? "" : `${d}/`;
  const cand = impactedPathsSorted.filter(
    (p) => POSIX_KEY(p) === d || POSIX_KEY(p).startsWith(pref),
  );
  if (!cand.length) return "";
  return cand
    .slice()
    .sort((a, b) => POSIX_KEY(a).localeCompare(POSIX_KEY(b)))[0];
}

/**
 * path POSIX normalizado → nó lexicalmente mínimo por node_id entre duplicados.
 * @returns {Map<string, object>}
 */
function indexSemanticNodesByPath(semanticGraphDoc) {
  /** @type {Map<string, object>} */
  const m = new Map();
  const nodes =
    semanticGraphDoc && Array.isArray(semanticGraphDoc.impacted_nodes)
      ? semanticGraphDoc.impacted_nodes
      : [];
  for (const row of nodes) {
    const pKey = normalizePath(row && row.path != null ? String(row.path) : "");
    if (!pKey) continue;
    const prev = m.get(pKey);
    const nidNow = row && row.node_id != null ? String(row.node_id) : "";
    if (!prev) {
      m.set(pKey, row);
      continue;
    }
    const nidPrev = prev.node_id != null ? String(prev.node_id) : "";
    if (!nidPrev || nidNow.localeCompare(nidPrev) < 0) m.set(pKey, row);
  }
  return m;
}

function semanticCandidateDedupeKey(candidate) {
  if (candidate.candidate_kind === "module_scope") {
    const d = POSIX_KEY(candidate.module_directory || "");
    return `m:${d}`;
  }
  const f = POSIX_KEY(candidate.file || "");
  return `f:${f}`;
}

function POSIX_KEY(p) {
  return normalizePath(p || "");
}

/**
 * @param {{
 *   mode: SemanticPropagationMode,
 *   targetsDoc: object,
 *   propagationManifestDoc: object|null,
 *   semanticMutationGraphDoc: object|null,
 *   projectRoot: string|null,
 *   candidateCap?: number,
 *   createdAt?: string,
 * }} opts
 */
function buildValidationPropagationManifest(opts) {
  const propagation_mode = opts.mode === "shadow" ? "shadow" : "off";

  const targetsDoc =
    opts.targetsDoc && typeof opts.targetsDoc === "object"
      ? opts.targetsDoc
      : { targets: [] };
  const tgtArr =
    targetsDoc.targets && Array.isArray(targetsDoc.targets)
      ? targetsDoc.targets.slice()
      : [];

  const original_targets = tgtArr
    .map((t) => {
      const validators = [
        ...(Array.isArray(t.inferred_validators) ? t.inferred_validators : []),
      ].sort((a, b) => String(a).localeCompare(String(b)));
      return {
        target_id: t.target_id != null ? String(t.target_id) : "",
        file: normalizePath(t.file != null ? t.file : ""),
        validation_scope: t.validation_scope != null ? String(t.validation_scope) : "",
        inferred_validators: validators,
      };
    })
    .filter((row) => row.file)
    .sort((a, b) => a.file.localeCompare(b.file));

  const originalFiles = new Set(original_targets.map((r) => r.file));

  const proj =
    opts.propagationManifestDoc && typeof opts.propagationManifestDoc === "object"
      ? opts.propagationManifestDoc
      : null;
  const graph =
    opts.semanticMutationGraphDoc && typeof opts.semanticMutationGraphDoc === "object"
      ? opts.semanticMutationGraphDoc
      : null;

  const impactedPathsSorted = [
    ...new Set(proj && Array.isArray(proj.impacted_paths) ? proj.impacted_paths : []),
  ]
    .map((p) => normalizePath(String(p)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const impactedModulesSorted = [
    ...new Set(proj && Array.isArray(proj.impacted_modules) ? proj.impacted_modules : []),
  ]
    .map((p) => normalizePath(String(p)))
    .filter((d) => d && d !== ".")
    .sort((a, b) => a.localeCompare(b));

  const pathIndex = graph ? indexSemanticNodesByPath(graph) : new Map();

  /** @type {object[]} */
  const semantic_candidates = [];
  /** @type {object[]} */
  const skipped_candidates = [];

  /** @type {string|null} */
  let semantic_expansion_reason =
    propagation_mode !== "shadow" ? "semantic_propagation_mode_off" : null;

  const hasUpstreamProjection = Boolean(
    proj && (impactedPathsSorted.length > 0 || impactedModulesSorted.length > 0),
  );

  if (propagation_mode === "shadow") {
    if (!proj) semantic_expansion_reason = "missing_propagation_manifest";
    else if (!hasUpstreamProjection) semantic_expansion_reason = "upstream_empty_projection";
  }

  /** @type {boolean} */
  let semantic_expansion_skipped =
    propagation_mode !== "shadow" ||
    (!proj || !hasUpstreamProjection);

  const capRaw = opts.candidateCap != null ? Number(opts.candidateCap) : null;
  let cap =
    capRaw !== null &&
    Number.isFinite(capRaw) &&
    Number(capRaw) > 0 &&
    Number.isInteger(Number(capRaw))
      ? Number(capRaw)
      : VALIDATION_SEMANTIC_EXPANSION_CANDIDATE_CAP_DEFAULT;

  cap = Math.min(Math.max(cap, 1), 50000);

  const projectRoot = opts.projectRoot != null ? String(opts.projectRoot) : null;

  if (propagation_mode === "shadow" && proj && hasUpstreamProjection) {
    semantic_expansion_skipped = false;
    semantic_expansion_reason = null;

    const seenKeys = new Set();

    for (const fp of impactedPathsSorted) {
      const np = POSIX_KEY(fp);
      if (!np) continue;

      const dedupeKey = semanticCandidateDedupeKey({ candidate_kind: "file_path", file: np });
      if (originalFiles.has(np)) {
        skipped_candidates.push({
          kind: "file_path",
          path: np,
          reason_code: "already_original_target",
        });
        seenKeys.add(dedupeKey);
        continue;
      }

      if (semantic_candidates.length >= cap) {
        skipped_candidates.push({
          kind: "file_path",
          path: np,
          reason_code: "semantic_candidate_cap_exceeded",
        });
        continue;
      }

      if (seenKeys.has(dedupeKey)) {
        skipped_candidates.push({
          kind: "file_path",
          path: np,
          reason_code: "duplicate_semantic_candidate",
        });
        continue;
      }

      seenKeys.add(dedupeKey);

      const nodeMeta = pathIndex.get(np);
      const classification = classifyImpactedSemanticNode(nodeMeta);

      semantic_candidates.push({
        candidate_kind: "file_path",
        file: np,
        semantic_classification: classification,
        validation_scope: inferValidationScope(np),
        inferred_validators: inferValidators(np, { projectRoot })
          .slice()
          .sort((a, b) => a.localeCompare(b)),
        ...(nodeMeta && typeof nodeMeta === "object"
          ? {
              distance_from_root:
                nodeMeta.distance_from_root === undefined || nodeMeta.distance_from_root === ""
                  ? null
                  : nodeMeta.distance_from_root,
              graph_reason_codes: [...(nodeMeta.reason_codes || [])]
                .map(String)
                .sort((a, b) => a.localeCompare(b)),
              discovered_from_graph:
                nodeMeta.discovered_from != null ? String(nodeMeta.discovered_from) : null,
            }
          : { graph_reason_codes: [], distance_from_root: null }),
      });
    }

    for (const modDirRaw of impactedModulesSorted) {
      const modDir = POSIX_KEY(modDirRaw);
      if (!modDir || modDir === ".") continue;
      const modKey = semanticCandidateDedupeKey({
        candidate_kind: "module_scope",
        module_directory: modDir,
      });

      let moduleHadFileCandidate = false;
      for (const c of semantic_candidates) {
        if (
          c &&
          c.candidate_kind === "file_path" &&
          c.file &&
          posixDirForPath(c.file) === modDir
        ) {
          moduleHadFileCandidate = true;
          break;
        }
      }

      let moduleSkipReason = null;
      if (moduleHadFileCandidate) moduleSkipReason = "module_covered_by_file_candidates";

      let klass = SEMANTIC_CANDIDATE_CLASSIFICATION.TRANSITIVE_SEMANTIC_DEPENDENCY;
      const prefixed = impactedPathsSorted.filter(
        (p) =>
          posixDirForPath(p) === modDir || posixDirForPath(p).startsWith(`${modDir}/`),
      );
      for (const p of prefixed.slice().sort((a, b) => POSIX_KEY(a).localeCompare(POSIX_KEY(b)))) {
        klass = pickStrongerClassification(
          klass,
          classifyImpactedSemanticNode(pathIndex.get(POSIX_KEY(p))),
        );
      }

      if (moduleSkipReason) {
        skipped_candidates.push({
          kind: "module_scope",
          module_directory: modDir,
          reason_code: moduleSkipReason,
          semantic_classification: klass,
        });
        continue;
      }

      if (semantic_candidates.length >= cap) {
        skipped_candidates.push({
          kind: "module_scope",
          module_directory: modDir,
          reason_code: "semantic_candidate_cap_exceeded",
          semantic_classification: klass,
        });
        continue;
      }

      if (seenKeys.has(modKey)) {
        skipped_candidates.push({
          kind: "module_scope",
          module_directory: modDir,
          reason_code: "duplicate_semantic_candidate",
          semantic_classification: klass,
        });
        continue;
      }

      seenKeys.add(modKey);

      const surrogate = surrogateFileForModule(modDir, impactedPathsSorted);
      const validators = surrogate
        ? inferValidators(surrogate, { projectRoot }).slice().sort((a, b) => a.localeCompare(b))
        : [];

      semantic_candidates.push({
        candidate_kind: "module_scope",
        module_directory: modDir,
        surrogate_inference_file: surrogate || null,
        semantic_classification: klass,
        validation_scope: surrogate ? inferValidationScope(surrogate) : "module",
        inferred_validators: validators,
      });
    }
  }

  semantic_candidates.sort((a, b) => {
    const k = String(a.candidate_kind || "").localeCompare(String(b.candidate_kind || ""));
    if (k !== 0) return k;
    const pa = POSIX_KEY(a.file || a.module_directory || "");
    const pb = POSIX_KEY(b.file || b.module_directory || "");
    return pa.localeCompare(pb);
  });

  skipped_candidates.sort((a, b) => {
    const rk = String(a.reason_code || "").localeCompare(String(b.reason_code || ""));
    if (rk !== 0) return rk;
    const pa = POSIX_KEY(a.path || a.module_directory || "");
    const pb = POSIX_KEY(b.path || b.module_directory || "");
    return pa.localeCompare(pb);
  });

  /** @type {object[]} */
  const expanded_targets = [];

  for (const o of original_targets) {
    expanded_targets.push({
      expansion_source: "original_validation_targeting",
      target_id: o.target_id,
      file: o.file,
      validation_scope: o.validation_scope,
      inferred_validators: o.inferred_validators.slice(),
    });
  }

  for (const c of semantic_candidates) {
    if (c.candidate_kind === "file_path") {
      if (originalFiles.has(c.file)) continue;
      expanded_targets.push({
        expansion_source: "semantic_shadow_candidate",
        file: c.file,
        semantic_classification: c.semantic_classification,
        validation_scope: c.validation_scope,
        inferred_validators: c.inferred_validators.slice(),
      });
      continue;
    }
    expanded_targets.push({
      expansion_source: "semantic_shadow_module_scope",
      module_directory: c.module_directory,
      surrogate_inference_file: c.surrogate_inference_file,
      semantic_classification: c.semantic_classification,
      validation_scope: c.validation_scope,
      inferred_validators: c.inferred_validators.slice(),
    });
  }

  expanded_targets.sort((a, b) => {
    const fa = POSIX_KEY(a.file || "");
    const fb = POSIX_KEY(b.file || "");
    const fd = fa.localeCompare(fb);
    if (fd !== 0) return fd;
    const da = POSIX_KEY(a.module_directory || "");
    const db = POSIX_KEY(b.module_directory || "");
    return da.localeCompare(db);
  });

  const upstream_fp =
    proj && proj.propagation_fingerprint_sha256 != null ? String(proj.propagation_fingerprint_sha256) : null;

  const propagation_stats = {
    originals_total: original_targets.length,
    semantic_candidates_total: propagation_mode === "shadow" ? semantic_candidates.length : 0,
    expanded_targets_total: expanded_targets.length,
    skipped_candidates_total: skipped_candidates.length,
    semantic_candidate_cap: cap,
    upstream_propagation_manifest_present: Boolean(proj),
    upstream_semantic_mutation_graph_present: Boolean(graph),
    upstream_impacted_paths_unique: impactedPathsSorted.length,
    upstream_propagation_fingerprint_sha256: upstream_fp,
  };

  const propagation_fingerprint_sha256 = sha256HexUtf8(
    stableStringify({
      schema_version: VALIDATION_PROPAGATION_MANIFEST_SCHEMA_VERSION,
      propagation_mode,
      original_targets,
      semantic_candidates: propagation_mode === "shadow" ? semantic_candidates : [],
      expanded_targets,
      skipped_candidates,
      propagation_stats_canonical: {
        originals_total: propagation_stats.originals_total,
        semantic_candidates_total:
          propagation_mode === "shadow" ? propagation_stats.semantic_candidates_total : 0,
        expanded_targets_total: propagation_stats.expanded_targets_total,
        skipped_candidates_total: propagation_stats.skipped_candidates_total,
        semantic_candidate_cap: propagation_stats.semantic_candidate_cap,
        upstream_propagation_manifest_present: propagation_stats.upstream_propagation_manifest_present,
        upstream_semantic_mutation_graph_present: propagation_stats.upstream_semantic_mutation_graph_present,
        upstream_impacted_paths_unique: propagation_stats.upstream_impacted_paths_unique,
      },
    }),
  );

  const propagation_id = propagation_fingerprint_sha256.slice(0, 16);

  const created_at =
    opts.createdAt != null && String(opts.createdAt).trim()
      ? String(opts.createdAt)
      : new Date().toISOString();

  const doc = {
    schema_version: VALIDATION_PROPAGATION_MANIFEST_SCHEMA_VERSION,
    propagation_id,
    propagation_mode,
    original_targets,
    semantic_candidates: propagation_mode === "shadow" ? semantic_candidates : [],
    expanded_targets,
    skipped_candidates,
    propagation_stats,
    propagation_fingerprint_sha256,
    refs: {
      validation_targets_ref: "validation-targets.json",
      propagation_manifest_ref:
        propagation_mode === "shadow"
          ? proj
            ? PROPAGATION_MANIFEST_FILENAME
            : null
          : null,
      semantic_mutation_graph_ref:
        propagation_mode === "shadow" ? graph ? SEMANTIC_MUTATION_GRAPH_FILENAME : null : null,
    },
    created_at,
    extensions: {},
  };

  const telemetry_semantic_candidates_generated =
    propagation_mode === "shadow" ? semantic_candidates.length : 0;

  return {
    manifest: doc,
    telemetry_snapshot: {
      semantic_propagation_enabled: propagation_mode === "shadow",
      semantic_candidates_generated: telemetry_semantic_candidates_generated,
      semantic_expansion_skipped: semantic_expansion_skipped,
      semantic_propagation_shadow: propagation_mode === "shadow",
      semantic_expansion_reason: semantic_expansion_reason,
      propagation_mode,
      propagation_id,
    },
  };
}

function validationPropagationManifestPath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_PROPAGATION_MANIFEST_FILENAME);
}

function saveValidationPropagationManifest(outputDir, manifestDoc) {
  const dir = String(outputDir || "");
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fp = validationPropagationManifestPath(dir);
  fs.writeFileSync(fp, JSON.stringify(manifestDoc, null, 2), "utf8");
}

function loadValidationPropagationManifest(outputDir) {
  const fp = validationPropagationManifestPath(String(outputDir || ""));
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (_) {
    return null;
  }
}

module.exports = {
  SEMANTIC_CANDIDATE_CLASSIFICATION,
  classifyImpactedSemanticNode,
  buildValidationPropagationManifest,
  validationPropagationManifestPath,
  saveValidationPropagationManifest,
  loadValidationPropagationManifest,
};
