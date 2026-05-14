"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { computeDeterministicSchedulingOrder } = require("../scheduler/dependency-resolver");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { buildExecutionGraphDocument, writeExecutionGraphArtifact } = require("../artifact-writer");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { writeExecutionGraphRuntimeArtifact } = require("../runtime-state/artifact-writer");
const { runSerialAdvisoryScheduler } = require("../scheduler/scheduler-engine");
const { buildSchedulerReport } = require("../scheduler/scheduler-report");
const { writeSchedulerReportArtifact } = require("../scheduler/artifact-writer");
const { buildPipelineOverlayModel } = require("../overlay/overlay-engine");
const { buildOverlayReport } = require("../overlay/overlay-report-builder");
const { writeOverlayReportArtifact } = require("../overlay/artifact-writer");
const { OVERLAY_MODE } = require("../overlay/constants");
const { buildNodeAdaptersArtifact, writeNodeAdaptersArtifact } = require("../node-adapters/artifact-writer");
const { writeReplayReportArtifact } = require("../replay/artifact-writer");
const { writeRiskReportArtifact } = require("../risk/artifact-writer");
const { REPLAY_REPORT_SCHEMA_VERSION } = require("../replay/constants");
const { RISK_REPORT_SCHEMA_VERSION } = require("../risk/constants");
const { resetGlobalTransitionSeqForTests } = require("../runtime-state/transition-engine");

const { validateExecutionGraphReleaseReadiness } = require("./readiness-validator");
const { buildExecutionGraphReleaseReadinessDocument } = require("./release-report-builder");
const { tryWriteShadowExecutionGraphReleaseReadiness } = require("./shadow-hook");
const { getExecutionGraphReleaseReadinessModeFromEnv } = require("./feature-flags");
const { RELEASE_READINESS_ARTIFACT_FILENAME, RELEASE_STATUS } = require("./constants");
const { auditFeatureFlags } = require("./flag-auditor");
const { tryReadJsonFile } = require("./safe-json");
const { validateShadowModuleBoundary } = require("./integration-validator");

function populateFullShadowArtifacts(dir, runId) {
  resetGlobalTransitionSeqForTests(0);
  const g = buildCanonicalExecutionGraph();
  const fp = computeExecutionGraphFingerprint(g);
  const graphId = `graph_${fp.slice(0, 32)}`;

  const eg = buildExecutionGraphDocument(g, {
    run_id: runId,
    pipeline_status: "completed",
    correction_iterations: 0,
    source: "test",
  });
  writeExecutionGraphArtifact(dir, eg);

  const snap = buildInitialRuntimeSnapshot(g, {
    run_id: runId,
    now_iso: "2026-05-14T12:00:00.000Z",
    pipeline_status: "completed",
    correction_iterations: 0,
    source: "test",
  });
  writeExecutionGraphRuntimeArtifact(dir, snap);

  const eng = runSerialAdvisoryScheduler(g, snap);
  const schRep = buildSchedulerReport(eng, {
    run_id: runId,
    graph_id: snap.graph_id,
    graph_fingerprint: snap.graph_fingerprint,
    scheduler_mode: "shadow",
  });
  writeSchedulerReportArtifact(dir, schRep);

  const model = buildPipelineOverlayModel({ outputDir: dir, runId });
  const ovRep = buildOverlayReport(model, {
    run_id: runId,
    overlay_mode: OVERLAY_MODE.SHADOW,
  });
  writeOverlayReportArtifact(dir, ovRep);

  const na = buildNodeAdaptersArtifact(g, { run_id: runId, source: "test" });
  writeNodeAdaptersArtifact(dir, na);

  writeReplayReportArtifact(dir, {
    schema_version: REPLAY_REPORT_SCHEMA_VERSION,
    run_id: runId,
    graph_id: graphId,
    graph_fingerprint: fp,
    compat: {
      advisory_only: true,
      real_pipeline_handlers_invoked: false,
      repeat_edges_policy: "advisory_shadow",
    },
    diagnostics: {},
  });

  writeRiskReportArtifact(dir, {
    schema_version: RISK_REPORT_SCHEMA_VERSION,
    run_id: runId,
    graph_id: graphId,
    graph_fingerprint: fp,
    compat: {
      advisory_read_only: true,
      real_pipeline_handlers_invoked: false,
    },
    diagnostics: {},
  });

  return { fp, graphId, topo: computeDeterministicSchedulingOrder(g) };
}

test("release ready: artefactos alinhados → ready", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-ready-"));
  const runId = "run-ready-1";
  populateFullShadowArtifacts(dir, runId);
  const v = validateExecutionGraphReleaseReadiness({ outputDir: dir, runId, env: {} });
  assert.equal(v.release_status, RELEASE_STATUS.READY);
  assert.equal(v.blockers.length, 0);
});

test("release warning: dir vazio (degradação graciosa)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-empty-"));
  const v = validateExecutionGraphReleaseReadiness({ outputDir: dir, runId: "x", env: {} });
  assert.equal(v.release_status, RELEASE_STATUS.WARNING);
  assert.equal(v.blockers.length, 0);
});

test("release blocked: fingerprint runtime errado", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-fp-"));
  const runId = "run-fp";
  populateFullShadowArtifacts(dir, runId);
  const rtPath = path.join(dir, "execution-graph-runtime.json");
  const rt = JSON.parse(fs.readFileSync(rtPath, "utf8"));
  rt.graph_fingerprint = "deadbeef";
  fs.writeFileSync(rtPath, JSON.stringify(rt), "utf8");
  const v = validateExecutionGraphReleaseReadiness({ outputDir: dir, runId, env: {} });
  assert.equal(v.release_status, RELEASE_STATUS.BLOCKED);
  assert.ok(v.blockers.some((b) => b.includes("fingerprint")));
});

test("release blocked: replay invoca handlers (contrato)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-repl-"));
  const runId = "run-bad-replay";
  populateFullShadowArtifacts(dir, runId);
  const rpPath = path.join(dir, "execution-graph-replay-report.json");
  const rp = JSON.parse(fs.readFileSync(rpPath, "utf8"));
  rp.compat.real_pipeline_handlers_invoked = true;
  fs.writeFileSync(rpPath, JSON.stringify(rp), "utf8");
  const v = validateExecutionGraphReleaseReadiness({ outputDir: dir, runId, env: {} });
  assert.equal(v.release_status, RELEASE_STATUS.BLOCKED);
});

test("feature flag audit: modo inválido → bloqueado", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-flag-"));
  populateFullShadowArtifacts(dir, "r1");
  const v = validateExecutionGraphReleaseReadiness({
    outputDir: dir,
    runId: "r1",
    env: { ...process.env, SETUP_BOSS_EXECUTION_GRAPH: "on" },
  });
  assert.equal(v.release_status, RELEASE_STATUS.BLOCKED);
  assert.ok(v.blockers.some((b) => b.includes("flags com modo inválido")));
});

test("feature flag audit: defaults off quando variáveis ausentes", () => {
  const a = auditFeatureFlags({});
  assert.equal(a.invalid_mode_flags.length, 0);
  assert.equal(a.all_mode_flags_off_or_shadow, true);
});

test("documento release-readiness: campos mínimos obrigatórios", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-doc-"));
  const runId = "run-doc";
  populateFullShadowArtifacts(dir, runId);
  const doc = buildExecutionGraphReleaseReadinessDocument({ outputDir: dir, runId, env: {} });
  for (const k of [
    "schema_version",
    "run_id",
    "graph_id",
    "graph_fingerprint",
    "release_status",
    "readiness_summary",
    "validated_components",
    "artifact_audit",
    "feature_flag_audit",
    "integration_audit",
    "consistency_audit",
    "compatibility_audit",
    "diagnostics",
    "warnings",
    "blockers",
    "created_at",
  ]) {
    assert.ok(k in doc, `falta ${k}`);
  }
});

test("shadow hook: off não grava ficheiro", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-hook-off-"));
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS = "off";
  try {
    tryWriteShadowExecutionGraphReleaseReadiness({ outputDir: dir, runId: "z" });
    assert.ok(!fs.existsSync(path.join(dir, RELEASE_READINESS_ARTIFACT_FILENAME)));
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS;
    else process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS = prev;
  }
});

test("shadow hook: shadow grava execution-graph-release-readiness.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-hook-on-"));
  const runId = "hook-run";
  populateFullShadowArtifacts(dir, runId);
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS;
  process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS = "shadow";
  try {
    tryWriteShadowExecutionGraphReleaseReadiness({ outputDir: dir, runId, source: "test" });
    const r = tryReadJsonFile(dir, RELEASE_READINESS_ARTIFACT_FILENAME);
    assert.equal(r.ok, true);
    assert.ok(r.data && r.data.graph_fingerprint);
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS;
    else process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS = prev;
  }
});

test("backward compatibility: pipeline_variant e schema canónicos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-bc-"));
  populateFullShadowArtifacts(dir, "bc");
  const v = validateExecutionGraphReleaseReadiness({ outputDir: dir, runId: "bc", env: {} });
  assert.equal(v.compatibility_audit.pipeline_backward_compatible, true);
});

test("orchestration.js sem dependência do módulo graph/DAG", () => {
  const orch = path.join(__dirname, "../../orchestration.js");
  const txt = fs.readFileSync(orch, "utf8");
  assert.ok(!txt.includes('require("./graph")'));
  assert.ok(!txt.includes('require("./graph/'));
  assert.ok(!txt.includes("execution-graph.json"));
});

test("getExecutionGraphReleaseReadinessModeFromEnv default off", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS;
  delete process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS;
  try {
    assert.equal(getExecutionGraphReleaseReadinessModeFromEnv(), "off");
  } finally {
    if (prev !== undefined) process.env.SETUP_BOSS_EXECUTION_GRAPH_RELEASE_READINESS = prev;
  }
});

test("shadow isolation: boundary dos módulos release-readiness", () => {
  const b = validateShadowModuleBoundary();
  assert.equal(b.ok, true, b.hits.join("; "));
});

test("warning: só execution-graph (artefactos derivados em falta)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-partial-"));
  const runId = "partial-1";
  resetGlobalTransitionSeqForTests(0);
  const g = buildCanonicalExecutionGraph();
  const eg = buildExecutionGraphDocument(g, {
    run_id: runId,
    pipeline_status: "completed",
    correction_iterations: 0,
    source: "test",
  });
  writeExecutionGraphArtifact(dir, eg);
  const v = validateExecutionGraphReleaseReadiness({ outputDir: dir, runId, env: {} });
  assert.equal(v.release_status, RELEASE_STATUS.WARNING);
  assert.equal(v.blockers.length, 0);
});

test("blocked: execution-graph com nodes inválidos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-rr-bad-eg-"));
  fs.writeFileSync(
    path.join(dir, "execution-graph.json"),
    JSON.stringify({
      schema_version: 1,
      graph_fingerprint_sha256: "x",
      nodes: [],
      edges: [],
      repeat_edges: [],
    }),
    "utf8",
  );
  const v = validateExecutionGraphReleaseReadiness({ outputDir: dir, runId: "bad", env: {} });
  assert.equal(v.release_status, RELEASE_STATUS.BLOCKED);
});
