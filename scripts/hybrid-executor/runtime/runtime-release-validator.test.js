"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  buildRuntimeReleaseMatrix,
  validateFullReleaseFlagMatrix,
  validateFallbackConsistency,
  validateGovernanceConsistency,
  validateReplayShadowConsistency,
  validateStaleReplayConsistency,
  runRuntimeReleaseValidation,
  applyHybridReleaseEnv,
  restoreHybridReleaseEnv,
  listExpectedArtifactFilenamesFromFlags,
  buildSyntheticFallbackForcedRows,
  buildSyntheticCorruptionRows,
  buildSyntheticStaleReplayRows,
} = require("./runtime-release-validator");
const { writeHybridExecutionArtifacts } = require("../hybrid-executor-core");
const { buildStructuralReplayShadowPayload } = require("../replay/structural-replay-shadow");
const { buildStructuralStaleAnalysisReport } = require("../replay/structural-stale-detector");

function snapReleaseEnv() {
  const keys = [
    "HYBRID_EXECUTOR_ENABLED",
    "STRUCTURAL_AST_READONLY_ENABLED",
    "STRUCTURAL_PLANNING_ENABLED",
    "STRUCTURAL_SHADOW_TRANSFORMS_ENABLED",
    "HYBRID_EXECUTION_ENABLED",
    "STRUCTURAL_APPLY_ENABLED",
    "STRUCTURAL_GOVERNANCE_ENABLED",
    "STRUCTURAL_REPLAY_FOUNDATION_ENABLED",
    "STRUCTURAL_IDEMPOTENCY_ENABLED",
    "STRUCTURAL_REPLAY_SHADOW_ENABLED",
    "HYBRID_RUNTIME_OBSERVABILITY_ENABLED",
  ];
  const o = {};

  for (const k of keys) o[k] = process.env[k];

  return o;
}

const INIT = snapReleaseEnv();
after(() => restoreHybridReleaseEnv(INIT));

test("4.9.8 — matriz de flags: todas as linhas avaliam sem erro estrutural", () => {
  const m = buildRuntimeReleaseMatrix();

  assert.ok(m.length >= 8);
  const r = validateFullReleaseFlagMatrix();

  assert.equal(r.ok, true, r.results.flatMap((x) => x.errors).join("; "));
});

test("4.9.8 — fallback consistency ok para bundle alinhado", () => {
  const hybrid = {
    summary: {
      patch_steps: 2,
      execution_mode_structural: 1,
      execution_mode_textual: 1,
      fallback_reason_histogram: { x: 1 },
      fallback_trigger_histogram: { gate: 1, none: 1 },
    },
    per_patch: [{ patch_index: 0 }, { patch_index: 1 }],
  };

  const fb = {
    counts: {
      patch_steps: 2,
      execution_mode_structural: 1,
      execution_mode_textual: 1,
    },
    fallback_reason_histogram: { x: 1 },
    fallback_trigger_histogram: { gate: 1, none: 1 },
    entries: [{ patch_index: 0 }, { patch_index: 1 }],
  };

  const v = validateFallbackConsistency(hybrid, fb);

  assert.equal(v.ok, true);
});

test("4.9.8 — fallback consistency falha com histograma divergente", () => {
  const hybrid = {
    summary: {
      patch_steps: 1,
      execution_mode_structural: 0,
      execution_mode_textual: 1,
      fallback_reason_histogram: { a: 1 },
      fallback_trigger_histogram: { gate: 1 },
    },
    per_patch: [{}],
  };

  const fb = {
    counts: { patch_steps: 1, execution_mode_structural: 0, execution_mode_textual: 1 },
    fallback_reason_histogram: { b: 1 },
    fallback_trigger_histogram: { gate: 1 },
    entries: [{}],
  };

  const v = validateFallbackConsistency(hybrid, fb);

  assert.equal(v.ok, false);
});

test("4.9.8 — release validator E2E artefactos mixed + observabilidade", () => {
  const prev = applyHybridReleaseEnv({
    HYBRID_EXECUTOR_ENABLED: "true",
    STRUCTURAL_AST_READONLY_ENABLED: "true",
    STRUCTURAL_PLANNING_ENABLED: "true",
    HYBRID_EXECUTION_ENABLED: "true",
    STRUCTURAL_GOVERNANCE_ENABLED: "true",
    STRUCTURAL_REPLAY_FOUNDATION_ENABLED: "true",
    STRUCTURAL_REPLAY_SHADOW_ENABLED: "true",
    HYBRID_RUNTIME_OBSERVABILITY_ENABLED: "true",
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rel-"));

  try {
    const rows = [
      {
        patch_index: 0,
        path: "a.js",
        execution_mode_used: "structural",
        fallback_trigger: "none",
        gate_snapshot: { allowed: true, confidence_score: 95, min_score_required: 90 },
      },
      {
        patch_index: 1,
        path: "b.js",
        execution_mode_used: "textual",
        fallback_reason: "confidence_below_threshold",
        fallback_reason_codes: ["confidence_below_threshold"],
        fallback_trigger: "gate",
        gate_snapshot: { allowed: false, confidence_score: 50, min_score_required: 90 },
      },
    ];

    writeHybridExecutionArtifacts({
      outputDir: tmp,
      rows,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 3,
      runDistinctFiles: 2,
    });

    const expected = listExpectedArtifactFilenamesFromFlags();

    assert.ok(expected.includes("hybrid-runtime-summary.json"));
    assert.ok(expected.includes("structural-replay-shadow.json"));

    /** @type {Record<string, object>} */
    const bundle = {};

    for (const name of expected) {
      const fp = path.join(tmp, name);

      assert.ok(fs.existsSync(fp), `missing ${name}`);
      bundle[name] = JSON.parse(fs.readFileSync(fp, "utf8"));
    }

    const result = runRuntimeReleaseValidation({ bundle });

    assert.equal(result.ok, true, result.errors.join("; "));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreHybridReleaseEnv(prev);
  }
});

test("4.9.8 — lifecycle final consistency incluída na validação", () => {
  const bundle = {
    "hybrid-execution-results.json": { schema_version: 2, phase: "4.9.4.1", per_patch: [], summary: {} },
    "structural-fallback-report.json": {
      schema_version: 2,
      phase: "4.9.4.1",
      entries: [],
      counts: { patch_steps: 0, execution_mode_structural: 0, execution_mode_textual: 0 },
    },
  };

  const r = runRuntimeReleaseValidation({ bundle });

  assert.equal(r.ok, true);
});

test("4.9.8 — replay shadow payload interno consistente + stale_selector", () => {
  const prev = applyHybridReleaseEnv({
    HYBRID_EXECUTOR_ENABLED: "true",
    STRUCTURAL_AST_READONLY_ENABLED: "true",
    STRUCTURAL_PLANNING_ENABLED: "true",
    HYBRID_EXECUTION_ENABLED: "true",
    STRUCTURAL_GOVERNANCE_ENABLED: "false",
    STRUCTURAL_REPLAY_SHADOW_ENABLED: "true",
  });

  try {
    const rows = buildSyntheticStaleReplayRows();
    const pack = buildStructuralReplayShadowPayload({
      rows,
      runDistinctFiles: 1,
      minScoreRequired: 90,
      projectRoot: "",
      initialOverlay: null,
    });

    const hybrid = { per_patch: rows };
    const stale = buildStructuralStaleAnalysisReport(rows, pack.fpReport, {
      runDistinctFiles: 1,
      minScoreRequired: 90,
    });

    assert.ok(stale.findings.some((f) => f.kind === "stale_selector"));

    assert.equal(validateReplayShadowConsistency(hybrid, pack.shadowPayload, pack.classificationPayload, pack.continuity).ok, true);

    assert.equal(
      validateStaleReplayConsistency(stale, pack.classificationPayload).ok,
      true,
      pack.classificationPayload.per_patch.map((p) => `${p.patch_index}:${p.classification}`).join(","),
    );
  } finally {
    restoreHybridReleaseEnv(prev);
  }
});

test("4.9.8 — governance consistency detecta mismatch", () => {
  const hybrid = { per_patch: [{}, {}] };
  const gov = { per_patch: [{}], aggregate: { patch_count: 1 } };

  const v = validateGovernanceConsistency(hybrid, gov);

  assert.equal(v.ok, false);
});

test("4.9.8 — cenários sintéticos fallback/corrupção produzem linhas válidas", () => {
  assert.equal(buildSyntheticFallbackForcedRows().length, 1);
  assert.ok(String(buildSyntheticCorruptionRows()[0].fallback_reason || "").includes("error"));
  assert.ok(buildSyntheticStaleReplayRows()[0].structural_replay.span_out_of_bounds);
});
