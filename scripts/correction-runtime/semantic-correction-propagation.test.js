/**
 * Semantic correction propagation — Fase 4.8.7.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  MutationReasonCodes,
} = require("../semantic-dependency-runtime/overlay/constants");
const { THRESHOLDS } = require("../risk-runtime/semantic-risk-propagation");
const {
  buildSemanticCorrectionPropagationBlock,
  computeSemanticCorrectionPropagationFingerprint,
  mapRiskReachToCorrectionClassification,
} = require("./semantic-correction-propagation");
const { persistFullCorrectionArtifacts } = require("./correction-pipeline");
const {
  CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT,
  CORRECTION_ANALYSIS_FILENAME,
  CORRECTION_LINEAGE_FILENAME,
  CORRECTION_RUNTIME_MANIFEST_FILENAME,
} = require("./constants");

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function baseGraphDoc(extra = {}) {
  return {
    schema_version: "semantic-mutation-graph/1",
    propagation_fingerprint_sha256: "upstream-correction-fp",
    roots: [{ path: "src/root.ts", reason_codes: ["direct_change"] }],
    propagation_summary: {
      mutation_roots_paths_total: 1,
      impacted_nodes_count: 3,
      impacted_edges_count: 2,
    },
    impacted_nodes: [
      {
        node_id: "nb",
        path: "src/b.ts",
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
        distance_from_root: 1,
      },
      {
        node_id: "na",
        path: "src/root.ts",
        reason_codes: [MutationReasonCodes.DIRECT_CHANGE],
        distance_from_root: 0,
      },
      {
        node_id: "nz",
        path: "src/z.ts",
        reason_codes: [MutationReasonCodes.REVERSE_IMPORT_REACH],
        distance_from_root: 2,
      },
    ],
    impacted_edges: [],
    ...extra,
  };
}

test("modo off — skipped", () => {
  const b = buildSemanticCorrectionPropagationBlock({
    mode: "off",
    propagationManifestDoc: {},
    semanticGraphDoc: baseGraphDoc(),
    lineageContext: { correction_analysis_id: "ca1", run_id: "r1", plan_id: "p1" },
  });
  assert.equal(b.propagation_mode, "off");
  assert.equal(b.telemetry.semantic_correction_propagation_skipped, true);
  assert.equal(b.semantic_correction_classification, null);
  assert.equal(b.semantic_lineage_refs, null);
});

test("shadow — hints, lineage refs, classificação", () => {
  const ctx = { correction_analysis_id: "ca-x", run_id: "rx", plan_id: "px" };
  const block = buildSemanticCorrectionPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: { impacted_paths: ["pkg/a.ts", "src/root.ts"] },
    semanticGraphDoc: baseGraphDoc(),
    lineageContext: ctx,
  });
  assert.equal(block.telemetry.semantic_correction_shadow, true);
  assert.ok(block.semantic_lineage_refs.related_correction_ids_sorted.includes("ca-x"));
  assert.ok(block.semantic_lineage_refs.impacted_paths_sorted.includes("pkg/a.ts"));
  assert.ok(block.semantic_correction_hints.some((h) => h.kind === "reverse_semantic_correction_impact"));
  assert.equal(block.semantic_correction_classification, "propagated_correction_impact");
});

test("wide_correction_impact + hint correspondente", () => {
  const block = buildSemanticCorrectionPropagationBlock({
    mode: "shadow",
    lineageContext: { correction_analysis_id: "c", run_id: "r", plan_id: "p" },
    propagationManifestDoc: null,
    semanticGraphDoc: {
      propagation_fingerprint_sha256: "h",
      roots: [{ path: "x" }],
      propagation_summary: { impacted_nodes_count: THRESHOLDS.WIDE_MIN_NODES },
      impacted_nodes: [{ node_id: "n1", path: "a.ts", distance_from_root: 0 }],
    },
  });
  assert.equal(block.semantic_correction_classification, "wide_correction_impact");
  assert.ok(block.semantic_correction_hints.some((h) => h.kind === "wide_semantic_correction_propagation"));
});

test("fingerprints estáveis ao baralhar vértices", () => {
  const ctx = { correction_analysis_id: "cid", run_id: "rid", plan_id: "pid" };
  const d1 = baseGraphDoc();
  const d2 = {
    ...d1,
    impacted_nodes: [...d1.impacted_nodes].sort((x, y) =>
      String(y.node_id).localeCompare(String(x.node_id)),
    ),
  };

  const a = buildSemanticCorrectionPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: d1,
    lineageContext: ctx,
  });
  const b = buildSemanticCorrectionPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: d2,
    lineageContext: ctx,
  });
  assert.equal(
    a.semantic_correction_propagation_fingerprint_sha256,
    b.semantic_correction_propagation_fingerprint_sha256,
  );
});

test("shadow sem artefactos — skipped com lineage refs mínimos", () => {
  const ctx = { correction_analysis_id: "ca-miss", run_id: "r-miss", plan_id: "p-miss" };
  const b = buildSemanticCorrectionPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: null,
    lineageContext: ctx,
  });
  assert.equal(b.skipped_reason, "missing_semantic_artifacts");
  assert.ok(b.semantic_lineage_refs);
  assert.equal(b.semantic_lineage_refs.correction_analysis_id, "ca-miss");
});

test("mapRiskReachToCorrectionClassification", () => {
  assert.equal(mapRiskReachToCorrectionClassification("local"), "local_correction_impact");
  assert.equal(mapRiskReachToCorrectionClassification("propagated"), "propagated_correction_impact");
  assert.equal(mapRiskReachToCorrectionClassification("wide_propagation"), "wide_correction_impact");
});

test("fingerprints diferem quando hints diferem", () => {
  const m = {
    impacted_nodes_count: 1,
    impacted_edges_count: 0,
    semantic_roots_count: 1,
    propagation_frontier_size: 1,
    max_propagation_depth: 0,
    semantic_correction_hint_count: 1,
  };
  const f1 = computeSemanticCorrectionPropagationFingerprint({
    hints: [{ hint_id: "a", kind: "a" }],
    semantic_correction_metrics: m,
    semantic_correction_classification: "local_correction_impact",
    propagation_fingerprint_sha256: null,
    semantic_lineage_refs_digest: "x",
  });
  const f2 = computeSemanticCorrectionPropagationFingerprint({
    hints: [{ hint_id: "b", kind: "b" }],
    semantic_correction_metrics: m,
    semantic_correction_classification: "local_correction_impact",
    propagation_fingerprint_sha256: null,
    semantic_lineage_refs_digest: "x",
  });
  assert.notEqual(f1, f2);
});

function seedCorrectionFixture(dir, graphExtra = {}) {
  writeJson(path.join(dir, "execution-plan.json"), {
    plan_id: "p-corr-sem",
    run_id: "r-corr-sem",
    lifecycle_state: "EXECUTING",
    operations: [{ operation_id: "o1", type: "FILE_SCOPE", file: "src/a.js" }],
  });
  writeJson(path.join(dir, "executor-changes.json"), []);
  writeJson(path.join(dir, "execution-reconciliation.json"), {
    status: "ok",
    unexpected_changes: [],
    unmatched_operations: [],
  });
  writeJson(path.join(dir, "validation-results.json"), {
    summary: { status: "failed", failed_validators: 1 },
    validators: [{ id: "v1", status: "fail" }],
  });
  writeJson(path.join(dir, "metadata.json"), { runId: "r-corr-sem" });
  writeJson(path.join(dir, "review-results.json"), {
    plan_id: "p-corr-sem",
    run_id: "r-corr-sem",
    violations: [],
    summary: { requires_correction: true },
    correction_hints: { validation_fix_required: true },
  });

  writeJson(path.join(dir, "propagation-manifest.json"), {
    impacted_paths: ["pkg/x.ts", "pkg/y.ts"],
    roots_summary: [{ path: "pkg/x.ts" }],
    propagation_stats: { impacted_nodes_total: 2 },
  });

  const extraNodes = Array.isArray(graphExtra.extra_nodes) ? graphExtra.extra_nodes : [];
  const { extra_nodes: _ignoreExtra, ...restGraphExtra } = graphExtra;

  writeJson(path.join(dir, "semantic-mutation-graph.json"), {
    propagation_fingerprint_sha256: "corr-sem-fp",
    roots: [{ path: "pkg/x.ts" }],
    propagation_summary: { impacted_nodes_count: 3, impacted_edges_count: 1 },
    impacted_nodes: [
      {
        node_id: "nx",
        path: "pkg/x.ts",
        distance_from_root: 0,
        reason_codes: ["direct_change"],
      },
      {
        node_id: "ny",
        path: "pkg/y.ts",
        distance_from_root: 1,
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
      },
      ...extraNodes,
    ],
    ...restGraphExtra,
  });
}

test("integração pipeline — shadow preserva summary adaptativo", () => {
  const prevEng = process.env.SETUP_BOSS_CORRECTION_ENGINE;
  const prevSem = process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION;
  process.env.SETUP_BOSS_CORRECTION_ENGINE = "guided";
  try {
    const dirShadow = fs.mkdtempSync(path.join(os.tmpdir(), "sb-corr-sem-yes-"));
    seedCorrectionFixture(dirShadow);
    process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION = "shadow";
    const rShadow = persistFullCorrectionArtifacts({ outputDir: dirShadow, telemetry: null });

    const dirOff = fs.mkdtempSync(path.join(os.tmpdir(), "sb-corr-sem-no-"));
    seedCorrectionFixture(dirOff);
    process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION = "off";
    const rOff = persistFullCorrectionArtifacts({ outputDir: dirOff, telemetry: null });

    assert.equal(rShadow.ok, true);
    assert.equal(rOff.ok, true);

    const aShadow = JSON.parse(
      fs.readFileSync(path.join(dirShadow, CORRECTION_ANALYSIS_FILENAME), "utf8"),
    );
    const aOff = JSON.parse(fs.readFileSync(path.join(dirOff, CORRECTION_ANALYSIS_FILENAME), "utf8"));

    assert.equal(aShadow.summary.retry_recommended, aOff.summary.retry_recommended);
    assert.equal(aShadow.summary.suppress_retry, aOff.summary.suppress_retry);
    assert.equal(aShadow.failure_signature_sha256, aOff.failure_signature_sha256);

    assert.ok(fs.existsSync(path.join(dirShadow, CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT)));
    const lineage = JSON.parse(fs.readFileSync(path.join(dirShadow, CORRECTION_LINEAGE_FILENAME), "utf8"));
    assert.ok(lineage.extensions && lineage.extensions.semantic_lineage_refs);
    assert.ok(lineage.extensions.semantic_lineage_refs.impacted_paths_sorted.includes("pkg/y.ts"));

    const manifest = JSON.parse(
      fs.readFileSync(path.join(dirShadow, CORRECTION_RUNTIME_MANIFEST_FILENAME), "utf8"),
    );
    assert.ok(manifest.semantic_propagation);
    assert.ok(aShadow.semantic_propagation.semantic_correction_hints.length > 0);
  } finally {
    if (prevEng === undefined) delete process.env.SETUP_BOSS_CORRECTION_ENGINE;
    else process.env.SETUP_BOSS_CORRECTION_ENGINE = prevEng;
    if (prevSem === undefined) delete process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION;
    else process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION = prevSem;
  }
});

test("telemetry correction.semantic_correction_propagation_completed", () => {
  const prevEng = process.env.SETUP_BOSS_CORRECTION_ENGINE;
  const prevSem = process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION;
  process.env.SETUP_BOSS_CORRECTION_ENGINE = "guided";
  process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION = "shadow";
  try {
    const events = [];
    const telemetry = {
      emit(type, payload) {
        events.push({ type, payload });
      },
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-corr-tel-"));
    seedCorrectionFixture(dir);
    persistFullCorrectionArtifacts({ outputDir: dir, telemetry });

    const hit = events.find((e) => e.type === "correction.semantic_correction_propagation_completed");
    assert.ok(hit);
    assert.equal(typeof hit.payload.semantic_correction_propagation_enabled, "boolean");
    assert.equal(typeof hit.payload.semantic_correction_hints_generated, "number");
    assert.equal(typeof hit.payload.semantic_correction_shadow, "boolean");
    assert.equal(typeof hit.payload.semantic_correction_propagation_skipped, "boolean");
  } finally {
    if (prevEng === undefined) delete process.env.SETUP_BOSS_CORRECTION_ENGINE;
    else process.env.SETUP_BOSS_CORRECTION_ENGINE = prevEng;
    if (prevSem === undefined) delete process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION;
    else process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION = prevSem;
  }
});
