"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  computeStructuralFingerprint,
  buildStructuralFingerprintReport,
  writeStructuralReplayFoundationArtifacts,
} = require("./structural-fingerprint");
const { buildStructuralLineageReport } = require("./structural-lineage");
const {
  buildStructuralStaleAnalysisReport,
} = require("./structural-stale-detector");
const { detectAlreadyAppliedHeuristic } = require("./structural-idempotency");

function snap() {
  return {
    STRUCTURAL_REPLAY_FOUNDATION_ENABLED: process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED,
    STRUCTURAL_IDEMPOTENCY_ENABLED: process.env.STRUCTURAL_IDEMPOTENCY_ENABLED,
    STRUCTURAL_GOVERNANCE_ENABLED: process.env.STRUCTURAL_GOVERNANCE_ENABLED,
  };
}

function restoreEnv(s) {
  for (const key of Object.keys(s)) {
    if (s[key] === undefined) delete process.env[key];
    else process.env[key] = s[key];
  }
}

const INITIAL = snap();

after(() => restoreEnv(INITIAL));

test("4.9.6.1 — fingerprint determinístico", () => {
  const pe = {
    op: "replace_node",
    node_kind: "VariableDeclaration",
    node_path_hint: "program.body[0]",
    mapping_status: "mapped",
    node_span: { start: 0, end: 12 },
    search: "a",
    replace: "b",
  };
  const row = { patch_index: 0, path: "x.js", structural_replay: { span_content_sha256: "abc", before_file_sha256: "def" } };

  const a = computeStructuralFingerprint(pe, row, row.structural_replay);
  const b = computeStructuralFingerprint(pe, row, row.structural_replay);

  assert.equal(a.fingerprint_sha256, b.fingerprint_sha256);
  assert.ok(a.fingerprint_sha256.length === 64);
});

test("4.9.6.1 — selector stale (search_missing_in_span)", () => {
  restoreEnv(INITIAL);

  const rows = [
    {
      patch_index: 0,
      path: "a.js",
      plan_entry: {
        op: "replace_node",
        node_kind: "VariableDeclaration",
        node_path_hint: "program.body[0]",
        mapping_status: "mapped",
        node_span: { start: 0, end: 10 },
        search: "old",
        replace: "new",
      },
      structural_replay: { search_missing_in_span: true },
    },
  ];

  const fp = buildStructuralFingerprintReport(rows, { runDistinctFiles: 1 });
  const stale = buildStructuralStaleAnalysisReport(rows, fp, {});

  assert.ok(stale.findings.some((f) => f.kind === "stale_selector"));
});

test("4.9.6.1 — already applied (heurística)", () => {
  const hit = detectAlreadyAppliedHeuristic("const k = 2;\n", { search: "1", replace: "2" });
  assert.ok(hit && hit.kind === "already_applied");
});

test("4.9.6.1 — superseded transform", () => {
  restoreEnv(INITIAL);

  const rows = [
    {
      patch_index: 0,
      path: "a.js",
      plan_entry: { node_span: { start: 10, end: 40 } },
    },
    {
      patch_index: 1,
      path: "a.js",
      plan_entry: { node_span: { start: 20, end: 50 } },
    },
  ];

  const fp = buildStructuralFingerprintReport(rows, { runDistinctFiles: 1 });
  const stale = buildStructuralStaleAnalysisReport(rows, fp, {});

  assert.ok(stale.findings.some((f) => f.kind === "superseded_transform"));
});

test("4.9.6.1 — lineage continuity", () => {
  const rows = [
    { patch_index: 0, path: "a.js", sequence_same_file: 0, plan_entry: { op: "replace_node", node_span: { start: 0, end: 5 }, node_kind: "VariableDeclaration", node_path_hint: "p", mapping_status: "mapped", search: "x", replace: "y" } },
    { patch_index: 1, path: "b.ts", sequence_same_file: 0, plan_entry: { op: "replace_node", node_span: { start: 0, end: 5 }, node_kind: "VariableDeclaration", node_path_hint: "p", mapping_status: "mapped", search: "x", replace: "y" } },
    { patch_index: 2, path: "a.js", sequence_same_file: 1, plan_entry: { op: "replace_node", node_span: { start: 0, end: 5 }, node_kind: "VariableDeclaration", node_path_hint: "p", mapping_status: "mapped", search: "x", replace: "y" } },
  ];

  const fp = buildStructuralFingerprintReport(rows, { runDistinctFiles: 2 });
  const lin = buildStructuralLineageReport(rows, fp);

  assert.equal(lin.entries.length, 3);
  assert.ok(lin.entries[2].parent_lineage_id);
  assert.equal(lin.entries[2].parent_lineage_id, lin.entries[0].lineage_id);
  assert.equal(lin.continuity.ok, true);
});

test("4.9.6.1 — writeStructuralReplayFoundationArtifacts respeita flag OFF", () => {
  restoreEnv(INITIAL);
  process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED = "false";

  const outDir = fbMkTestDir();

  try {
    writeStructuralReplayFoundationArtifacts({
      outputDir: outDir,
      rows: [{ patch_index: 0, path: "a.js" }],
      runDistinctFiles: 1,
    });

    assert.ok(!fs.existsSync(path.join(outDir, "structural-fingerprint-report.json")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

function fbMkTestDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-replay-"));
}

test("4.9.6.1 — idempotência no relatório stale (flag ON)", () => {
  restoreEnv(INITIAL);
  process.env.STRUCTURAL_IDEMPOTENCY_ENABLED = "true";

  const rows = [
    {
      patch_index: 0,
      path: "a.js",
      plan_entry: { op: "replace_node", mapping_status: "mapped" },
      structural_replay: {
        patch: { search: "1", replace: "2" },
        capture_before_excerpt: "const k = 2;\n",
      },
    },
  ];

  const fp = buildStructuralFingerprintReport(rows, {});
  const stale = buildStructuralStaleAnalysisReport(rows, fp, {});

  assert.ok(stale.findings.some((f) => f.kind === "already_applied"));
  restoreEnv(INITIAL);
});

test("4.9.6.1 — writeHybridExecutionArtifacts: replay OFF → sem JSON replay", () => {
  restoreEnv(INITIAL);
  process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED = "false";

  const outDir = fbMkTestDir();

  try {
    const { writeHybridExecutionArtifacts } = require("../hybrid-executor-core");

    writeHybridExecutionArtifacts({
      outputDir: outDir,
      outputFs: null,
      rows: [{ patch_index: 0, path: "a.js", execution_mode_used: "structural", fallback_trigger: "none" }],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
    });

    assert.ok(!fs.existsSync(path.join(outDir, "structural-fingerprint-report.json")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("4.9.6.1 — writeHybridExecutionArtifacts: replay ON → três relatórios", () => {
  restoreEnv(INITIAL);
  process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED = "true";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";

  const outDir = fbMkTestDir();

  try {
    const { writeHybridExecutionArtifacts } = require("../hybrid-executor-core");

    writeHybridExecutionArtifacts({
      outputDir: outDir,
      outputFs: null,
      rows: [
        {
          patch_index: 0,
          path: "a.js",
          execution_mode_used: "structural",
          fallback_trigger: "none",
          plan_entry: {
            op: "replace_node",
            node_kind: "VariableDeclaration",
            node_path_hint: "program.body[0]",
            mapping_status: "mapped",
            node_span: { start: 0, end: 8 },
            search: "x",
            replace: "y",
          },
          structural_replay: { span_content_sha256: "x", before_file_sha256: "y", patch: { search: "x", replace: "y" } },
        },
      ],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
      runDistinctFiles: 1,
    });

    assert.ok(fs.existsSync(path.join(outDir, "structural-fingerprint-report.json")));
    assert.ok(fs.existsSync(path.join(outDir, "structural-lineage-report.json")));
    assert.ok(fs.existsSync(path.join(outDir, "structural-stale-analysis.json")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});
