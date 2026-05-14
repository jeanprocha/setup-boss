"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDeterministicReviewDocument,
  saveDeterministicReviewArtifact,
  loadDeterministicReview,
  aggregateDeterministicReviewForInspect,
  finalizeDeterministicReviewObservability,
  attachDeterministicReviewShadowToReviewResults,
} = require("./deterministic-review-runtime");
const { validateDeterministicReviewShape } = require("./contract/deterministic-review-contract");
const { REVIEW_RESULTS_FILENAME } = require("./constants");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "det-review-"));
}

test("documento vazio — shape válido e fingerprint estável entre duas execuções", () => {
  const dir = tmpDir();
  const a = buildDeterministicReviewDocument(dir);
  const b = buildDeterministicReviewDocument(dir);
  assert.equal(a.fingerprints.deterministic_review_content_sha256, b.fingerprints.deterministic_review_content_sha256);
  assert.ok(validateDeterministicReviewShape(a).length === 0);
  assert.equal(a.summary.findings_total, a.findings.length);
});

test("validation_command_failed e unresolved_validator", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      metadata: { plan_id: "p1", run_id: "r1" },
      fingerprints: { validation_plan_identity_sha256: "planhash" },
      commands: [
        { command_id: "c1", target_id: "t1", validator_id: "v1", status: "unresolved" },
        { command_id: "c2", target_id: "t2", validator_id: "v2", status: "resolved" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "validation-results.json"),
    JSON.stringify({
      version: 1,
      results: [
        {
          command_id: "c2",
          target_id: "t2",
          validator_id: "v2",
          status: "failed",
          exit_code: 1,
          duration_ms: 10,
        },
      ],
      fingerprints: {
        validation_plan_identity_sha256: "planhash",
        validation_results_identity_sha256: "reshash",
      },
      summary: { cache_reused: 0 },
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  const codes = doc.findings.map((f) => f.code).sort();
  assert.ok(codes.includes("unresolved_validator"));
  assert.ok(codes.includes("validation_command_failed"));
  assert.equal(doc.summary.failed_validations_total, 1);
  assert.equal(doc.summary.unresolved_validators_total, 1);
});

test("structural: resolved sem validation-results (4.11.2)", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      metadata: { plan_id: "p1", run_id: "r1" },
      fingerprints: { validation_plan_identity_sha256: "aaa" },
      targets: [{ target_id: "t1", file: "src/x.ts" }],
      commands: [{ command_id: "c1", target_id: "t1", validator_id: "v1", status: "resolved" }],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({ projectRoot: dir }),
    "utf8",
  );
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, "x.ts"), "//", "utf8");
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.type === "structural" && f.code === "structural_resolved_requires_results_artifact"));
  assert.equal(doc.findings.filter((f) => f.code === "validation_gap").length, 0);
  assert.equal(doc.findings.filter((f) => f.code === "validation_artifact_missing").length, 0);
  assert.ok(doc.summary.errors_total >= 1);
});

test("graph_candidates_cap_hit e dependency_graph_truncated", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      metadata: { plan_id: "p1", run_id: "r1" },
      fingerprints: { validation_plan_identity_sha256: "zzz" },
      commands: [],
      graph_impact: {
        graph_fingerprint_sha256: "gf",
        truncation: {
          candidates_truncated: true,
          graph_candidates_cap: 64,
          raw_candidates_before_dedupe: 100,
          targets_with_reverse_truncation: 1,
          targets_with_forward_truncation: 0,
        },
      },
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.code === "graph_candidates_cap_hit"));
  assert.ok(doc.findings.some((f) => f.code === "dependency_graph_truncated"));
});

test("aggregateDeterministicReviewForInspect — por severity, type e code ordenados", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      metadata: { plan_id: "p", run_id: "r" },
      fingerprints: { validation_plan_identity_sha256: "x" },
      commands: [
        { command_id: "a", status: "unresolved", target_id: "t", validator_id: "v" },
        { command_id: "b", status: "resolved", target_id: "t2", validator_id: "v2" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "validation-results.json"),
    JSON.stringify({
      version: 1,
      results: [{ command_id: "b", target_id: "t2", validator_id: "v2", status: "failed" }],
      fingerprints: { validation_plan_identity_sha256: "x" },
      summary: {},
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  const agg = aggregateDeterministicReviewForInspect(doc);
  assert.ok(agg.by_type.validation >= 1);
  const codes = Object.keys(agg.by_code);
  assert.deepEqual(codes, [...codes].sort((a, b) => a.localeCompare(b)));
  assert.ok(agg.by_code.unresolved_validator >= 1);
  assert.ok(agg.risk_summary);
  assert.equal(agg.risk_summary.overall_risk_level, doc.risk_summary.overall_risk_level);
  assert.equal(agg.risk_summary.risk_score, doc.risk_summary.risk_score);
});


test("structural: graph edge dangling e fingerprint inválido", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "dependency-graph.json"),
    JSON.stringify({
      version: 1,
      nodes: [{ node_id: "file:a.ts", type: "file", path: "a.ts" }],
      edges: [{ from: "file:a.ts", to: "file:ghost.ts", relation: "imports" }],
      fingerprints: { graph_content_sha256: "not-a-hash" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({ version: 1, metadata: {}, commands: [], targets: [] }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.code === "structural_graph_edge_dangling"));
  assert.ok(doc.findings.some((f) => f.code === "structural_graph_fingerprint_invalid"));
});

test("structural: manifest referencia ficheiro ausente", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "plan-artifacts.json"),
    JSON.stringify({
      schema_version: 1,
      artifacts: {
        validation_plan: "validation-plan.json",
        execution_plan: "execution-plan.json",
      },
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  const missing = doc.findings.filter((f) => f.code === "structural_referenced_file_missing");
  assert.ok(missing.length >= 1);
  assert.ok(missing.every((f) => f.type === "structural"));
});

test("structural: result órfão e resolved target desconhecido", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      targets: [{ target_id: "t1", file: "a.ts" }],
      commands: [
        { command_id: "c1", target_id: "t1", status: "resolved" },
        { command_id: "c2", target_id: "missing-target", status: "resolved" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "validation-results.json"),
    JSON.stringify({
      version: 1,
      results: [
        { command_id: "c1", target_id: "t1", status: "passed" },
        { command_id: "c2", target_id: "missing-target", status: "passed" },
        { command_id: "orphan", target_id: "t9", status: "passed" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ projectRoot: dir }), "utf8");
  fs.writeFileSync(path.join(dir, "a.ts"), "//", "utf8");
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.code === "structural_result_orphan_command"));
  assert.ok(doc.findings.some((f) => f.code === "structural_resolved_command_unknown_target"));
});

test("semantic 4.11.3: descriptor sem comando, validator unlisted, linked tests, grafo ausente", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      metadata: { plan_id: "p", run_id: "r" },
      fingerprints: { validation_plan_identity_sha256: "planidhashplanidhashplanidhashplanidhash1111" },
      validators: [{ descriptor_id: "eslint", descriptor_kind: "x", schema: "y" }],
      resolved_validators: [{ validator_id: "eslint", status: "resolved" }],
      targets: [{ target_id: "tx", file: "a.ts", inferred_validators: ["eslint"], risk_hints: [] }],
      commands: [
        {
          command_id: "c1",
          target_id: "tx",
          validator_id: "tsc",
          descriptor_id: "tsc",
          status: "resolved",
        },
      ],
      graph_impact: {
        graph_present: true,
        graph_fingerprint_sha256: "ab".repeat(32),
        summary: { linked_tests_total: 2 },
        per_target: [],
        truncation: {},
      },
      risk_hints: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "validation-results.json"), JSON.stringify({ version: 1, results: [], summary: {} }), "utf8");
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.type === "semantic" && f.code === "semantic_descriptor_without_resolved_command"));
  assert.ok(doc.findings.some((f) => f.code === "semantic_resolved_command_validator_unlisted"));
  assert.ok(doc.findings.some((f) => f.code === "semantic_linked_tests_no_test_runner"));
  assert.ok(doc.findings.some((f) => f.code === "semantic_plan_expects_graph_artifact_missing"));
});

test("semantic 4.11.3: truncação sem risk_hint e cobertura de impacto", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      validators: [],
      resolved_validators: [],
      targets: [{ target_id: "t1", file: "src/x.ts" }],
      commands: [],
      graph_impact: {
        graph_present: false,
        truncation: { candidates_truncated: true },
        per_target: [
          {
            file: "src/x.ts",
            graph_validator_targeting: { has_linked_tests: true },
          },
        ],
      },
      risk_hints: [],
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.code === "semantic_graph_truncation_risk_hint_gap"));
  assert.ok(doc.findings.some((f) => f.code === "semantic_graph_impact_missing_target_coverage"));
});

test("semantic 4.11.3: cache reuse com plan identity mismatch", () => {
  const dir = tmpDir();
  const planId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      fingerprints: { validation_plan_identity_sha256: planId },
      validators: [],
      resolved_validators: [],
      targets: [],
      commands: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "validation-results.json"),
    JSON.stringify({
      version: 1,
      results: [],
      summary: { cache_reused: 1 },
      fingerprints: { validation_plan_identity_sha256: planId },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "validation-cache.json"),
    JSON.stringify({
      version: 1,
      schema_contract: "validation-cache/1",
      entries: [
        {
          cache_key: "k1",
          command_id: "c",
          validator_id: "v",
          target_id: "t",
          validation_plan_identity_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          result_fingerprint_sha256: "rf",
          status: "passed",
          exit_code: 0,
        },
      ],
      fingerprints: { cache_entries_identity_sha256: "x" },
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.code === "semantic_cache_plan_identity_mismatch"));
});

test("semantic 4.11.3: risk_hints sem validator inferido", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      targets: [{ target_id: "z1", file: "z.ts", risk_hints: ["x"], inferred_validators: [] }],
      commands: [],
      resolved_validators: [],
      validators: [],
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.findings.some((f) => f.code === "semantic_target_risk_hints_without_validator"));
});

test("finalizeDeterministicReviewObservability — patch em review-results.json", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, REVIEW_RESULTS_FILENAME),
    JSON.stringify({ schema_version: 1, review_id: "rv-x", extensions: {} }, null, 2),
    "utf8",
  );
  finalizeDeterministicReviewObservability(dir, null);
  const rr = JSON.parse(fs.readFileSync(path.join(dir, REVIEW_RESULTS_FILENAME), "utf8"));
  assert.equal(rr.extensions.deterministic_review_ref, "deterministic-review.json");
  assert.ok(loadDeterministicReview(dir));
});

test("attachDeterministicReviewShadowToReviewResults não remove extensions existentes", () => {
  const rr = { extensions: { semantic_propagation: { mode: "off" } } };
  attachDeterministicReviewShadowToReviewResults(rr);
  assert.equal(rr.extensions.deterministic_review_ref, "deterministic-review.json");
  assert.ok(rr.extensions.semantic_propagation);
});

test("risk_summary (4.11.4) — campos, modelo versionado e fingerprint só com findings", () => {
  const dir = tmpDir();
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.risk_summary);
  assert.ok(["low", "medium", "high", "critical"].includes(doc.risk_summary.overall_risk_level));
  assert.equal(typeof doc.risk_summary.risk_score, "number");
  assert.equal(typeof doc.risk_summary.structural_errors, "number");
  assert.equal(typeof doc.risk_summary.semantic_warnings, "number");
  assert.equal(typeof doc.risk_summary.validation_failures, "number");
  assert.equal(typeof doc.risk_summary.graph_truncations, "number");
  assert.equal(typeof doc.risk_summary.cache_inconsistencies, "number");
  assert.ok(Array.isArray(doc.risk_summary.highlights));
  assert.ok(doc.risk_summary.aggregation && doc.risk_summary.aggregation.by_code);
  assert.ok(Array.isArray(doc.risk_summary.top_risk_findings));
  assert.match(doc.risk_summary.score_model.version, /^deterministic-review-risk\//);
  const again = buildDeterministicReviewDocument(dir);
  assert.equal(
    doc.fingerprints.deterministic_review_content_sha256,
    again.fingerprints.deterministic_review_content_sha256,
  );
});

test("risk_summary — falha de validação força nível high (política de thresholds)", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      metadata: { plan_id: "p", run_id: "r" },
      fingerprints: { validation_plan_identity_sha256: "planhash" },
      commands: [{ command_id: "c2", target_id: "t2", validator_id: "v2", status: "resolved" }],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "validation-results.json"),
    JSON.stringify({
      version: 1,
      results: [
        {
          command_id: "c2",
          target_id: "t2",
          validator_id: "v2",
          status: "failed",
          exit_code: 1,
          duration_ms: 10,
        },
      ],
      fingerprints: {
        validation_plan_identity_sha256: "planhash",
        validation_results_identity_sha256: "reshash",
      },
      summary: { cache_reused: 0 },
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  assert.equal(doc.risk_summary.validation_failures, 1);
  assert.ok(["high", "critical"].includes(doc.risk_summary.overall_risk_level));
  assert.ok(doc.risk_summary.top_risk_findings.length >= 1);
  assert.equal(doc.risk_summary.top_risk_findings[0].code, "validation_command_failed");
});

test("risk_summary — truncações de grafo contabilizadas e top findings ordenados por peso/code/id", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "validation-plan.json"),
    JSON.stringify({
      version: 1,
      metadata: { plan_id: "p1", run_id: "r1" },
      fingerprints: { validation_plan_identity_sha256: "zzz" },
      commands: [],
      graph_impact: {
        graph_fingerprint_sha256: "gf",
        truncation: {
          candidates_truncated: true,
          graph_candidates_cap: 64,
          raw_candidates_before_dedupe: 100,
          targets_with_reverse_truncation: 1,
          targets_with_forward_truncation: 0,
        },
      },
    }),
    "utf8",
  );
  const doc = buildDeterministicReviewDocument(dir);
  assert.ok(doc.risk_summary.graph_truncations >= 1);
  const tops = doc.risk_summary.top_risk_findings;
  for (let i = 1; i < tops.length; i++) {
    const prev = tops[i - 1];
    const cur = tops[i];
    if (cur.risk_weight !== prev.risk_weight) {
      assert.ok(cur.risk_weight < prev.risk_weight);
    } else {
      assert.ok(prev.code.localeCompare(cur.code) <= 0);
      if (prev.code === cur.code) {
        assert.ok(prev.finding_id.localeCompare(cur.finding_id) <= 0);
      }
    }
  }
});

test("gate (4.11.5) — bloco gate no artefacto; fingerprint não depende do modo env", () => {
  const dir = tmpDir();
  const prevM = process.env.SETUP_BOSS_REVIEW_GATE_MODE;
  const prevT = process.env.SETUP_BOSS_REVIEW_GATE_THRESHOLD;
  process.env.SETUP_BOSS_REVIEW_GATE_MODE = "enforce";
  process.env.SETUP_BOSS_REVIEW_GATE_THRESHOLD = "high";
  const a = buildDeterministicReviewDocument(dir);
  process.env.SETUP_BOSS_REVIEW_GATE_MODE = "off";
  delete process.env.SETUP_BOSS_REVIEW_GATE_THRESHOLD;
  const b = buildDeterministicReviewDocument(dir);
  assert.equal(a.fingerprints.deterministic_review_content_sha256, b.fingerprints.deterministic_review_content_sha256);
  assert.ok(a.gate && a.gate.mode === "enforce");
  assert.ok(b.gate && b.gate.mode === "off");
  assert.ok(["pass", "warn", "fail"].includes(a.gate.decision));
  if (prevM === undefined) delete process.env.SETUP_BOSS_REVIEW_GATE_MODE;
  else process.env.SETUP_BOSS_REVIEW_GATE_MODE = prevM;
  if (prevT === undefined) delete process.env.SETUP_BOSS_REVIEW_GATE_THRESHOLD;
  else process.env.SETUP_BOSS_REVIEW_GATE_THRESHOLD = prevT;
});
