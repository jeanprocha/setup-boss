/**
 * Continuidade semântica replay-safe (Fase 4.8.9) — fingerprints determinísticos, sem timestamps no digest canónico.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  GRAPH_MANIFEST_FILENAME,
  GRAPH_SNAPSHOT_MANIFEST_FILENAME,
} = require("../../semantic-dependency-runtime/constants");
const {
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  PROPAGATION_MANIFEST_FILENAME,
} = require("../../semantic-dependency-runtime/overlay/constants");
const { VALIDATION_PROPAGATION_MANIFEST_FILENAME } = require("../../execution-plan/validation-targeting/constants");
const { RISK_RUNTIME_MANIFEST_FILENAME } = require("../../risk-runtime/constants");
const { REVIEW_RUNTIME_MANIFEST_FILENAME } = require("../../review-runtime/constants");
const { CORRECTION_RUNTIME_MANIFEST_FILENAME } = require("../../correction-runtime/constants");

/** @note Duplicado propositadamente relativamente a governance-continuity-fingerprint (evita ciclo requires). */
function stableStringify(value) {
  const seen = new WeakSet();
  function walk(x) {
    if (x === null || typeof x !== "object") return x;
    if (seen.has(x)) return "[Circular]";
    seen.add(x);
    if (Array.isArray(x)) return x.map(walk);
    const keys = Object.keys(x).sort();
    const o = {};
    for (const k of keys) {
      o[k] = walk(x[k]);
    }
    return o;
  }
  return JSON.stringify(walk(value));
}

function sha256HexUtf8(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function sha256FileHex(absPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

function readJsonIfExists(absPath) {
  try {
    if (!absPath || !fs.existsSync(absPath)) return null;
    return JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Normaliza vértices do overlay para digest estável (ordem lexical por node_id/path).
 *
 * @param {object[]} raw
 */
function normalizeImpactedNodesForDigest(raw) {
  const rows = [];
  for (const n of Array.isArray(raw) ? raw : []) {
    if (!n || typeof n !== "object") continue;
    const reasons = [...new Set((Array.isArray(n.reason_codes) ? n.reason_codes : []).map((x) => String(x || "")))].sort(
      (a, b) => a.localeCompare(b),
    );
    rows.push({
      node_id: n.node_id != null ? String(n.node_id) : "",
      path: n.path != null ? String(n.path) : "",
      reason_codes_sorted: reasons,
      distance_from_root:
        n.distance_from_root !== null &&
        n.distance_from_root !== undefined &&
        n.distance_from_root !== ""
          ? Number(n.distance_from_root)
          : null,
      discovered_from: n.discovered_from != null ? String(n.discovered_from) : "",
    });
  }
  rows.sort((a, b) =>
    `${a.node_id}\u0001${a.path}`.localeCompare(`${b.node_id}\u0001${b.path}`),
  );
  return rows;
}

/** @param {object[]} edges */
function normalizeImpactedEdgesForDigest(edges) {
  const rows = [];
  for (const e of Array.isArray(edges) ? edges : []) {
    if (!e || typeof e !== "object") continue;
    rows.push({
      from_id: e.from_id != null ? String(e.from_id) : e.from_node_id != null ? String(e.from_node_id) : "",
      to_id: e.to_id != null ? String(e.to_id) : e.to_node_id != null ? String(e.to_node_id) : "",
      kind: e.kind != null ? String(e.kind) : "",
    });
  }
  rows.sort((a, b) => `${a.from_id}\u0001${a.to_id}\u0001${a.kind}`.localeCompare(`${b.from_id}\u0001${b.to_id}\u0001${b.kind}`));
  return rows;
}

/** @param {object[]} roots */
function normalizeRootsDigest(roots) {
  const rows = [];
  for (const r of Array.isArray(roots) ? roots : []) {
    if (!r || typeof r !== "object") continue;
    rows.push({
      path: r.path != null ? String(r.path) : "",
      reason_codes_sorted: [...new Set((Array.isArray(r.reason_codes) ? r.reason_codes : []).map((x) => String(x || "")))].sort(),
    });
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return rows;
}

/**
 * Extrai apenas campos estáveis das integrações risk/review/correction (fingerprints refs/modes).
 *
 * @param {object|null} block
 */
function stableSemanticRuntimeIntegrationBlock(block) {
  if (!block || typeof block !== "object") return null;
  const out = {
    propagation_mode: block.propagation_mode != null ? String(block.propagation_mode) : "",
    propagation_fingerprint_sha256:
      block.propagation_fingerprint_sha256 != null ? String(block.propagation_fingerprint_sha256) : "",
    propagation_manifest_ref:
      block.propagation_manifest_ref != null
        ? String(block.propagation_manifest_ref)
        : block.propagation_manifest_filename != null
          ? String(block.propagation_manifest_filename)
          : "",
    semantic_mutation_graph_ref:
      block.semantic_mutation_graph_ref != null
        ? String(block.semantic_mutation_graph_ref)
        : block.semantic_mutation_graph_filename != null
          ? String(block.semantic_mutation_graph_filename)
          : "",
  };
  return out.propagation_mode || out.propagation_fingerprint_sha256 ? out : null;
}

/** @returns {{ semantic_continuity_inputs: {kind:string,ref:string,value:string}[], semantic_continuity_fingerprint: string }} */
function buildSemanticContinuitySlice(outputDir) {
  const dir = String(outputDir || "");
  /** @type {{ kind: string, ref: string, value: string }[]} */
  const semantic_continuity_inputs = [];

  function pushInput(kind, ref, value) {
    semantic_continuity_inputs.push({
      kind: String(kind || ""),
      ref: String(ref || ""),
      value: String(value != null ? value : ""),
    });
  }

  const depPath = path.join(dir, GRAPH_MANIFEST_FILENAME);
  if (fs.existsSync(depPath)) {
    pushInput("semantic_dependency_graph_artifact_sha256", GRAPH_MANIFEST_FILENAME, sha256FileHex(depPath));
    const dg = readJsonIfExists(depPath);
    const gfp = dg && dg.graph_fingerprint_sha256 != null ? String(dg.graph_fingerprint_sha256) : "";
    const gid = dg && dg.graph_id != null ? String(dg.graph_id) : "";
    pushInput(
      "semantic_dependency_graph_fingerprint_raw",
      `${GRAPH_MANIFEST_FILENAME}:graph_identity`,
      sha256HexUtf8(stableStringify({ graph_id: gid, graph_fingerprint_sha256: gfp })),
    );
  } else {
    pushInput(
      "semantic_dependency_graph_presence",
      GRAPH_MANIFEST_FILENAME,
      "__absent__",
    );
  }

  const snapPath = path.join(dir, GRAPH_SNAPSHOT_MANIFEST_FILENAME);
  if (fs.existsSync(snapPath)) {
    pushInput("semantic_graph_snapshot_artifact_sha256", GRAPH_SNAPSHOT_MANIFEST_FILENAME, sha256FileHex(snapPath));
    const sd = readJsonIfExists(snapPath);
    const gfp = sd && sd.graph_fingerprint_sha256 != null ? String(sd.graph_fingerprint_sha256) : "";
    pushInput(
      "semantic_snapshot_graph_fingerprint_sha256",
      `${GRAPH_SNAPSHOT_MANIFEST_FILENAME}:graph_fingerprint_sha256`,
      gfp || "__missing__",
    );
  } else {
    pushInput(
      "semantic_graph_snapshot_presence",
      GRAPH_SNAPSHOT_MANIFEST_FILENAME,
      "__absent__",
    );
  }

  const mutPath = path.join(dir, SEMANTIC_MUTATION_GRAPH_FILENAME);
  if (fs.existsSync(mutPath)) {
    pushInput("semantic_mutation_overlay_artifact_sha256", SEMANTIC_MUTATION_GRAPH_FILENAME, sha256FileHex(mutPath));
    const mg = readJsonIfExists(mutPath);
    const pfp =
      mg && mg.propagation_fingerprint_sha256 != null ? String(mg.propagation_fingerprint_sha256) : "";
    pushInput(
      "semantic_mutation_propagation_manifest_fingerprint",
      `${SEMANTIC_MUTATION_GRAPH_FILENAME}:propagation_fingerprint_sha256`,
      pfp || "__missing__",
    );
    const overlayPayload = stableStringify({
      roots_normalized: normalizeRootsDigest(mg && Array.isArray(mg.roots) ? mg.roots : []),
      impacted_nodes: normalizeImpactedNodesForDigest(mg && Array.isArray(mg.impacted_nodes) ? mg.impacted_nodes : []),
      impacted_edges: normalizeImpactedEdgesForDigest(mg && Array.isArray(mg.impacted_edges) ? mg.impacted_edges : []),
      graph_id: mg && mg.graph_id != null ? String(mg.graph_id) : "",
      overlay_id: mg && mg.overlay_id != null ? String(mg.overlay_id) : "",
    });
    pushInput(
      "semantic_mutation_overlay_structural_digest",
      `${SEMANTIC_MUTATION_GRAPH_FILENAME}:structural_stable`,
      sha256HexUtf8(overlayPayload),
    );
  } else {
    pushInput(
      "semantic_mutation_overlay_presence",
      SEMANTIC_MUTATION_GRAPH_FILENAME,
      "__absent__",
    );
  }

  const propPath = path.join(dir, PROPAGATION_MANIFEST_FILENAME);
  if (fs.existsSync(propPath)) {
    pushInput("semantic_propagation_manifest_artifact_sha256", PROPAGATION_MANIFEST_FILENAME, sha256FileHex(propPath));
    const pm = readJsonIfExists(propPath);
    const pfp =
      pm && pm.propagation_fingerprint_sha256 != null ? String(pm.propagation_fingerprint_sha256) : "";
    pushInput(
      "semantic_propagation_manifest_fingerprint",
      `${PROPAGATION_MANIFEST_FILENAME}:propagation_fingerprint_sha256`,
      pfp || "__missing__",
    );
    const paths = [...new Set((Array.isArray(pm && pm.impacted_paths) ? pm.impacted_paths : []).map((x) => String(x || "").trim()))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    pushInput(
      "semantic_propagation_manifest_impacted_paths_digest",
      `${PROPAGATION_MANIFEST_FILENAME}:impacted_paths`,
      sha256HexUtf8(stableStringify(paths)),
    );
  } else {
    pushInput(
      "semantic_propagation_manifest_presence",
      PROPAGATION_MANIFEST_FILENAME,
      "__absent__",
    );
  }

  const vpPath = path.join(dir, VALIDATION_PROPAGATION_MANIFEST_FILENAME);
  if (fs.existsSync(vpPath)) {
    pushInput(
      "semantic_validation_propagation_artifact_sha256",
      VALIDATION_PROPAGATION_MANIFEST_FILENAME,
      sha256FileHex(vpPath),
    );
    const vm = readJsonIfExists(vpPath);
    const vfs =
      vm && vm.propagation_fingerprint_sha256 != null ? String(vm.propagation_fingerprint_sha256) : "";
    pushInput(
      "semantic_validation_propagation_fingerprint_raw",
      `${VALIDATION_PROPAGATION_MANIFEST_FILENAME}:propagation_fingerprint_sha256`,
      vfs || "__missing__",
    );
    const refs = {};
    const semRefs = vm && vm.refs && typeof vm.refs === "object" ? vm.refs : {};
    for (const rk of ["propagation_manifest_ref", "semantic_mutation_graph_ref", "validation_targets_ref"].sort()) {
      if (semRefs[rk] != null) refs[rk] = String(semRefs[rk]);
    }
    pushInput(
      "semantic_validation_propagation_refs_digest",
      `${VALIDATION_PROPAGATION_MANIFEST_FILENAME}:refs_stable`,
      sha256HexUtf8(stableStringify(refs)),
    );
  } else {
    pushInput(
      "semantic_validation_propagation_presence",
      VALIDATION_PROPAGATION_MANIFEST_FILENAME,
      "__absent__",
    );
  }

  const integrationSlices = {};

  function loadSemBlock(file, key) {
    const pth = path.join(dir, file);
    if (!fs.existsSync(pth)) {
      integrationSlices[key] = { manifest_presence: false };
      return;
    }
    const jr = readJsonIfExists(pth);
    const sp = jr && jr.semantic_propagation && typeof jr.semantic_propagation === "object"
      ? jr.semantic_propagation
      : null;
    integrationSlices[key] = {
      manifest_presence: true,
      ...(stableSemanticRuntimeIntegrationBlock(sp) || { propagation_only: "__empty_block__" }),
    };
  }

  loadSemBlock(RISK_RUNTIME_MANIFEST_FILENAME, "risk");
  loadSemBlock(REVIEW_RUNTIME_MANIFEST_FILENAME, "review");
  loadSemBlock(CORRECTION_RUNTIME_MANIFEST_FILENAME, "correction");
  pushInput(
    "semantic_runtime_integration_digest",
    "runtime_manifests.semantic_integration",
    sha256HexUtf8(stableStringify(integrationSlices)),
  );

  semantic_continuity_inputs.sort((a, b) => {
    const ka = `${a.kind}\u0001${a.ref}`;
    const kb = `${b.kind}\u0001${b.ref}`;
    return ka.localeCompare(kb);
  });

  const semantic_continuity_fingerprint = sha256HexUtf8(stableStringify(semantic_continuity_inputs));

  return { semantic_continuity_inputs, semantic_continuity_fingerprint };
}

/** @param {object[]|undefined|null} inputs */
function mapSemanticInputsByKey(inputs) {
  const m = new Map();
  for (const x of Array.isArray(inputs) ? inputs : []) {
    if (!x || typeof x !== "object") continue;
    const kk = `${x.kind}\u0001${x.ref}`;
    m.set(kk, String(x.value != null ? x.value : ""));
  }
  return m;
}

/**
 * @param {object[]} bound
 * @param {object[]} current
 */
function diffSemanticInputsByKind(bound, current) {
  const bMap = mapSemanticInputsByKey(bound);
  const cMap = mapSemanticInputsByKey(current);
  const divergentKinds = [];
  const reasons = [];
  const union = [...new Set([...bMap.keys(), ...cMap.keys()])].sort((a, x) => a.localeCompare(x));
  for (const kk of union) {
    const [kindRaw, refRaw] = kk.split("\u0001");
    const bv = bMap.has(kk) ? bMap.get(kk) : null;
    const cv = cMap.has(kk) ? cMap.get(kk) : null;
    if (bv !== null && cv !== null && bv === cv) continue;
    if (bv === null) {
      divergentKinds.push({ kind: kindRaw, ref: refRaw || "", asymmetry: "only_in_current" });
      reasons.push(`${kindRaw} (${refRaw || ""}) presente apenas na linha temporal actual.`);
    } else if (cv === null) {
      divergentKinds.push({ kind: kindRaw, ref: refRaw || "", asymmetry: "only_in_bound" });
      reasons.push(`${kindRaw} (${refRaw || ""}) presente apenas no bundle da aprovação — artefactos semânticos removidos ou alteração de layout.`);
    } else {
      divergentKinds.push({ kind: kindRaw, ref: refRaw || "", asymmetry: "value_mismatch" });
      reasons.push(`${kindRaw} (${refRaw || ""}) valor digest diverge.`);
    }
  }
  divergentKinds.sort((a, b) => `${a.kind}\u0001${a.ref}`.localeCompare(`${b.kind}\u0001${b.ref}`));
  reasons.sort((a, b) => a.localeCompare(b));
  return {
    divergence_kinds_sorted: divergentKinds,
    reasons_sorted: reasons,
  };
}

/**
 * Avalia só camadas semânticas (para telemetry/diagnostics granular).
 *
 * @param {string|null|undefined} approvalSemFp — fingerprint registado na aprovação
 * @param {string|null|undefined} currentSemFp
 * @param {object[]} approvalSemInputs — inputs persistidos na aprovação
 * @param {object[]} currentSemInputs — inputs actuais
 */
function classifySemanticStale(
  approvalSemFp,
  currentSemFp,
  approvalSemInputs,
  currentSemInputs,
) {
  const bound = approvalSemFp != null ? String(approvalSemFp) : "";
  const cur = currentSemFp != null ? String(currentSemFp) : "";
  if (!bound || !cur) {
    return { semantic_stale: false, divergence: diffSemanticInputsByKind([], []) };
  }
  if (bound !== cur) {
    return {
      semantic_stale: true,
      divergence: diffSemanticInputsByKind(approvalSemInputs, currentSemInputs),
    };
  }
  return {
    semantic_stale: false,
    divergence: diffSemanticInputsByKind([], []),
  };
}

const { loadGovernanceApprovalManifest } = require("./governance-approval-manifest");

/**
 * Snapshot só leitura para inspect (governance ou semantic).
 *
 * @param {string} outputDir
 */
function summarizeSemanticGovernanceContinuity(outputDir) {
  const dir = String(outputDir || "");
  const currentSlice = buildSemanticContinuitySlice(dir);
  const approval = loadGovernanceApprovalManifest(dir);
  const semBound =
    approval && approval.semantic_continuity_fingerprint != null
      ? String(approval.semantic_continuity_fingerprint)
      : "";
  const semInputsBound = approval && Array.isArray(approval.semantic_continuity_inputs)
    ? approval.semantic_continuity_inputs
    : [];
  const divergence =
    semBound && semBound !== currentSlice.semantic_continuity_fingerprint
      ? diffSemanticInputsByKind(semInputsBound, currentSlice.semantic_continuity_inputs)
      : { divergence_kinds_sorted: [], reasons_sorted: [] };

  const propagationKinds = [
    "semantic_propagation_manifest_fingerprint",
    "semantic_mutation_propagation_manifest_fingerprint",
    "semantic_propagation_manifest_impacted_paths_digest",
  ];
  const propagationDivergence = (divergence.divergence_kinds_sorted || []).filter((row) =>
    propagationKinds.some((pk) =>
      `${row.kind}`.startsWith(pk) ||
      `${String(row.kind || "").toLowerCase()}`.includes("propagation"),
    ),
  );

  const statusSemantic =
    !semBound ? "skipped_no_bound_semantic"
    : divergence.reasons_sorted && divergence.reasons_sorted.length === 0
      ? "ok"
      : "stale";

  return {
    status: statusSemantic,
    semantic_continuity_fingerprint_prefix: String(currentSlice.semantic_continuity_fingerprint || "").slice(0, 16),
    bound_semantic_prefix: semBound.slice(0, 16),
    stale_reasons_sorted: divergence.reasons_sorted || [],
    fingerprint_divergence_kinds_sorted: divergence.divergence_kinds_sorted || [],
    propagation_divergence_sorted: propagationDivergence.slice().sort((a, b) =>
      `${a.kind}`.localeCompare(`${b.kind}`),
    ),
  };
}

module.exports = {
  buildSemanticContinuitySlice,
  diffSemanticInputsByKind,
  classifySemanticStale,
  stableStringifySemanticContinuityPayload: stableStringify,
  summarizeSemanticGovernanceContinuity,
};
