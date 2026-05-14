/**
 * Semantic review propagation — Fase 4.8.6.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  MutationReasonCodes,
} = require("../../semantic-dependency-runtime/overlay/constants");
const { THRESHOLDS } = require("../../risk-runtime/semantic-risk-propagation");
const {
  buildSemanticReviewPropagationBlock,
  computeSemanticReviewPropagationFingerprint,
  mapRiskReachToReviewClassification,
} = require("./semantic-review-propagation");
const { runReviewOrchestration } = require("../orchestration/review-orchestrator");
const {
  REVIEW_SEMANTIC_PROPAGATION_ARTIFACT,
  REVIEW_RESULTS_FILENAME,
  REVIEW_RUNTIME_MANIFEST_FILENAME,
} = require("../constants");

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function baseGraphDoc(extra = {}) {
  return {
    schema_version: "semantic-mutation-graph/1",
    propagation_fingerprint_sha256: "upstream-review-fp",
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

test("modo off — skipped, sem métricas no output principal", () => {
  const b = buildSemanticReviewPropagationBlock({
    mode: "off",
    propagationManifestDoc: {},
    semanticGraphDoc: baseGraphDoc(),
  });
  assert.equal(b.propagation_mode, "off");
  assert.equal(b.telemetry.semantic_review_propagation_skipped, true);
  assert.equal(b.semantic_review_classification, null);
  assert.deepEqual(b.semantic_review_hints, []);
});

test("shadow — hints, métricas, classificação e fingerprint upstream", () => {
  const doc = baseGraphDoc();
  const block = buildSemanticReviewPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: { impacted_paths: ["x"] },
    semanticGraphDoc: doc,
  });
  assert.equal(block.telemetry.semantic_review_shadow, true);
  assert.equal(block.telemetry.semantic_review_hints_generated, block.semantic_review_hints.length);
  assert.ok(block.semantic_review_hints.some((h) => h.kind === "direct_semantic_impact"));
  assert.ok(block.semantic_review_hints.some((h) => h.kind === "propagated_semantic_impact"));
  assert.ok(block.semantic_review_hints.some((h) => h.kind === "reverse_semantic_impact"));
  assert.equal(block.propagation_fingerprint_sha256, "upstream-review-fp");
  assert.equal(block.semantic_review_classification, "propagated_review_impact");
  assert.equal(block.semantic_review_metrics.semantic_review_hint_count, block.semantic_review_hints.length);
});

test("classificação wide → wide_review_impact + hint wide_semantic_propagation", () => {
  const block = buildSemanticReviewPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: {
      propagation_fingerprint_sha256: "h",
      roots: [{ path: "x" }],
      propagation_summary: { impacted_nodes_count: THRESHOLDS.WIDE_MIN_NODES },
      impacted_nodes: [{ node_id: "n1", path: "a.ts", distance_from_root: 0 }],
    },
  });
  assert.equal(block.semantic_review_classification, "wide_review_impact");
  assert.ok(block.semantic_review_hints.some((h) => h.kind === "wide_semantic_propagation"));
});

test("fingerprints estáveis ao baralhar vértices", () => {
  const d1 = baseGraphDoc();
  const d2 = {
    ...d1,
    impacted_nodes: [...d1.impacted_nodes].sort((x, y) =>
      String(y.node_id).localeCompare(String(x.node_id)),
    ),
  };

  const a = buildSemanticReviewPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: d1,
  });
  const b = buildSemanticReviewPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: d2,
  });
  assert.equal(
    a.semantic_review_propagation_fingerprint_sha256,
    b.semantic_review_propagation_fingerprint_sha256,
  );
});

test("shadow sem artefactos — skipped", () => {
  const b = buildSemanticReviewPropagationBlock({
    mode: "shadow",
    propagationManifestDoc: null,
    semanticGraphDoc: null,
  });
  assert.equal(b.skipped_reason, "missing_semantic_artifacts");
  assert.equal(b.telemetry.semantic_review_propagation_skipped, true);
  assert.equal(b.telemetry.semantic_review_hints_generated, 0);
});

test("mapRiskReachToReviewClassification cobre ramos", () => {
  assert.equal(mapRiskReachToReviewClassification("local"), "local_review_impact");
  assert.equal(mapRiskReachToReviewClassification("propagated"), "propagated_review_impact");
  assert.equal(mapRiskReachToReviewClassification("wide_propagation"), "wide_review_impact");
  assert.equal(mapRiskReachToReviewClassification("unknown"), "idle");
});

test("integração orchestrator — shadow preserva score final vs baseline", () => {
  const prev = process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION;
  process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION = "shadow";
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rev-sem-"));
    writeJson(path.join(dir, "metadata.json"), { projectRoot: dir, runId: "r-sem" });
    writeJson(path.join(dir, "execution-plan.json"), {
      plan_id: "p-sem",
      run_id: "r-sem",
      lifecycle_state: "EXECUTING",
      operations: [],
    });
    writeJson(path.join(dir, "executor-changes.json"), []);
    writeJson(path.join(dir, "executor-result.json"), { status: "success", summary: "ok" });
    writeJson(path.join(dir, "validation-results.json"), {
      summary: { status: "ok", failed_validators: 0 },
    });

    writeJson(path.join(dir, "propagation-manifest.json"), {
      impacted_paths: ["pkg/x.ts"],
      propagation_stats: { impacted_nodes_total: 2 },
    });

    writeJson(path.join(dir, "semantic-mutation-graph.json"), {
      propagation_fingerprint_sha256: "ux",
      roots: [{ path: "pkg/x.ts" }],
      propagation_summary: { impacted_nodes_count: 3, impacted_edges_count: 1 },
      impacted_nodes: [
        { node_id: "nx", path: "pkg/x.ts", distance_from_root: 0, reason_codes: ["direct_change"] },
        {
          node_id: "ny",
          path: "pkg/y.ts",
          distance_from_root: 1,
          reason_codes: [MutationReasonCodes.IMPORT_REACH],
        },
      ],
    });

    const r1 = runReviewOrchestration({
      outputDir: dir,
      telemetry: null,
      reviewEngineMode: "structural",
      outputFs: null,
    });

    process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION = "off";
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rev-sem-off-"));
    writeJson(path.join(dir2, "metadata.json"), { projectRoot: dir2, runId: "r-sem2" });
    writeJson(path.join(dir2, "execution-plan.json"), {
      plan_id: "p-sem",
      run_id: "r-sem2",
      lifecycle_state: "EXECUTING",
      operations: [],
    });
    writeJson(path.join(dir2, "executor-changes.json"), []);
    writeJson(path.join(dir2, "executor-result.json"), { status: "success", summary: "ok" });
    writeJson(path.join(dir2, "validation-results.json"), {
      summary: { status: "ok", failed_validators: 0 },
    });

    const r2 = runReviewOrchestration({
      outputDir: dir2,
      telemetry: null,
      reviewEngineMode: "structural",
      outputFs: null,
    });

    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r1.review_results.summary.score, r2.review_results.summary.score);
    assert.equal(r1.review_results.summary.status, r2.review_results.summary.status);

    assert.ok(r1.review_manifest.semantic_propagation);
    assert.equal(r1.review_manifest.semantic_propagation.propagation_mode, "shadow");
    assert.ok(fs.existsSync(path.join(dir, REVIEW_SEMANTIC_PROPAGATION_ARTIFACT)));

    const rr = JSON.parse(fs.readFileSync(path.join(dir, REVIEW_RESULTS_FILENAME), "utf8"));
    assert.ok(rr.extensions.semantic_propagation);
    assert.ok(rr.extensions.semantic_propagation.semantic_review_hints.length > 0);

    const man = JSON.parse(fs.readFileSync(path.join(dir, REVIEW_RUNTIME_MANIFEST_FILENAME), "utf8"));
    assert.ok(man.semantic_propagation.semantic_review_propagation_fingerprint_sha256);
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION;
    else process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION = prev;
  }
});

test("orchestrator — evento review.semantic_review_propagation_completed", () => {
  const prev = process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION;
  process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION = "shadow";
  try {
    const events = [];
    const telemetry = {
      emit(type, payload) {
        events.push({ type, payload });
      },
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rev-tel-"));
    writeJson(path.join(dir, "metadata.json"), { projectRoot: dir, runId: "r-tel" });
    writeJson(path.join(dir, "execution-plan.json"), {
      plan_id: "p-tel",
      run_id: "r-tel",
      lifecycle_state: "EXECUTING",
      operations: [],
    });
    writeJson(path.join(dir, "executor-changes.json"), []);
    writeJson(path.join(dir, "executor-result.json"), { status: "success", summary: "ok" });
    writeJson(path.join(dir, "validation-results.json"), {
      summary: { status: "ok", failed_validators: 0 },
    });
    writeJson(path.join(dir, "semantic-mutation-graph.json"), {
      propagation_fingerprint_sha256: "tel-fp",
      roots: [{ path: "a.ts" }],
      propagation_summary: { impacted_nodes_count: 1 },
      impacted_nodes: [
        { node_id: "n1", path: "a.ts", distance_from_root: 0, reason_codes: ["direct_change"] },
      ],
    });
    writeJson(path.join(dir, "propagation-manifest.json"), { impacted_paths: ["a.ts"] });

    runReviewOrchestration({
      outputDir: dir,
      telemetry,
      reviewEngineMode: "structural",
      outputFs: null,
    });

    const sem = events.find((e) => e.type === "review.semantic_review_propagation_completed");
    assert.ok(sem);
    assert.equal(typeof sem.payload.semantic_review_propagation_enabled, "boolean");
    assert.equal(typeof sem.payload.semantic_review_hints_generated, "number");
    assert.equal(typeof sem.payload.semantic_review_shadow, "boolean");
    assert.equal(typeof sem.payload.semantic_review_propagation_skipped, "boolean");
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION;
    else process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION = prev;
  }
});

test("fingerprints diferentes quando hints diferem", () => {
  const h1 = [{ hint_id: "a", kind: "a" }];
  const h2 = [{ hint_id: "b", kind: "b" }];
  const m = {
    impacted_nodes_count: 1,
    impacted_edges_count: 0,
    semantic_roots_count: 1,
    propagation_frontier_size: 1,
    max_propagation_depth: 0,
    semantic_review_hint_count: 1,
  };
  const f1 = computeSemanticReviewPropagationFingerprint({
    hints: h1,
    semantic_review_metrics: m,
    semantic_review_classification: "local_review_impact",
    propagation_fingerprint_sha256: null,
  });
  const f2 = computeSemanticReviewPropagationFingerprint({
    hints: h2,
    semantic_review_metrics: m,
    semantic_review_classification: "local_review_impact",
    propagation_fingerprint_sha256: null,
  });
  assert.notEqual(f1, f2);
});
