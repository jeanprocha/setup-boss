"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { NODE_ID } = require("../constants");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const {
  createAllAdaptersInOrder,
  buildRegisteredAdapterRegistry,
  EXPECTED_NODE_IDS,
  buildNodeAdaptersArtifact,
  tryWriteShadowNodeAdaptersArtifact,
  getExecutionGraphNodeAdaptersModeFromEnv,
} = require("./index");
const { NODE_ADAPTERS_ARTIFACT_FILENAME } = require("./constants");
const { validateNoDuplicateAdapters, validateGraphCoverage } = require("./validators");
const { createScanAdapter } = require("./adapters/scan");
const { tryWriteShadowOverlayReport } = require("../overlay/shadow-hook");
const { buildPipelineOverlayModel } = require("../overlay/overlay-engine");

test("registry determinístico: duas leituras produzem mesma ordenação node_id", () => {
  const a1 = createAllAdaptersInOrder().map((a) => a.node_id);
  const a2 = createAllAdaptersInOrder().map((a) => a.node_id);
  assert.deepEqual(a1, a2);
});

test("todos os nós do grafo canónico têm adapter registado", () => {
  const g = buildCanonicalExecutionGraph();
  const { validation } = buildRegisteredAdapterRegistry(g);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  const ids = new Set(g.nodes.map((n) => n.node_id));
  for (const id of ids) {
    assert.ok(EXPECTED_NODE_IDS.includes(id));
  }
});

test("adapters duplicados falham validação", () => {
  const a = createScanAdapter();
  const r = validateNoDuplicateAdapters([a, a]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("duplicate")));
});

test("registry vs grafo: nó em falta falha cobertura", () => {
  const g = buildCanonicalExecutionGraph();
  const tiny = { nodes: g.nodes.slice(0, 3) };
  const adapters = createAllAdaptersInOrder();
  const r = validateGraphCoverage(tiny, adapters);
  assert.equal(r.ok, false);
});

test("contratos runtime: resolveInputs/getExpectedArtifacts determinísticos", () => {
  const a = createScanAdapter();
  const c = a.getContract();
  assert.deepEqual(c.resolveInputs(), c.resolveInputs());
  assert.ok(Array.isArray(c.getExpectedArtifacts()));
  const v = c.validateRuntimeContext({ run_id: "x", output_dir: "/tmp" });
  assert.equal(v.ok, true);
});

test("capability matrix: modelo coerente com supports_replay", () => {
  const g = buildCanonicalExecutionGraph();
  const { validation } = buildRegisteredAdapterRegistry(g);
  assert.equal(validation.checks.capabilities_replay.ok, true);
});

test("replay support matrix vs descriptor knowledge terminal", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildNodeAdaptersArtifact(g, { run_id: "r1" });
  const k = doc.replay_support_matrix[NODE_ID.KNOWLEDGE];
  assert.equal(k.supports_replay, false);
});

test("feature flag: default off", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
  delete process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
  assert.equal(getExecutionGraphNodeAdaptersModeFromEnv(), "off");
  if (prev !== undefined) process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS = prev;
});

test("shadow hook grava artefacto quando flag=shadow", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-na-"));
  try {
    process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS = "shadow";
    tryWriteShadowNodeAdaptersArtifact({ outputDir: dir, runId: "run-x" });
    const p = path.join(dir, NODE_ADAPTERS_ARTIFACT_FILENAME);
    assert.ok(fs.existsSync(p));
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.equal(j.schema_version >= 1, true);
    assert.ok(j.graph_fingerprint);
    assert.ok(Array.isArray(j.registered_adapters));
    assert.ok(j.runtime_contracts[NODE_ID.SCAN]);
    assert.ok(j.advisory_execution_matrix);
    assert.ok(j.diagnostics);
  } finally {
    if (prev !== undefined) process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS = prev;
    else delete process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("feature off: não grava ficheiro node-adapters", () => {
  const prev = process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-na2-"));
  try {
    process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS = "off";
    tryWriteShadowNodeAdaptersArtifact({ outputDir: dir, runId: "run-y" });
    assert.equal(fs.existsSync(path.join(dir, NODE_ADAPTERS_ARTIFACT_FILENAME)), false);
  } finally {
    if (prev !== undefined) process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS = prev;
    else delete process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("adapters não carregam scripts de runtime de etapa (sanidade por caminho)", () => {
  const root = path.join(__dirname, "adapters");
  const names = fs.readdirSync(root).filter((f) => f.endsWith(".js"));
  for (const n of names) {
    const t = fs.readFileSync(path.join(root, n), "utf8");
    assert.match(t, /require\("\.\.\/\.\.\/constants"\)/);
    assert.doesNotMatch(t, /scripts\/architect\.js/);
    assert.doesNotMatch(t, /require\(["'].*\/(scan|executor|review|correction)\.js["']\)/);
  }
});

test("overlay continua a funcionar com artefacto node-adapters presente no outputDir", () => {
  const prevOv = process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY;
  const prevNa = process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-na3-"));
  try {
    process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY = "shadow";
    process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS = "shadow";
    tryWriteShadowOverlayReport({ outputDir: dir, runId: "r-overlay" });
    tryWriteShadowNodeAdaptersArtifact({ outputDir: dir, runId: "r-overlay" });
    const m = buildPipelineOverlayModel({ outputDir: dir, runId: "r-overlay" });
    assert.ok(m.overlay_status);
    assert.ok(fs.existsSync(path.join(dir, NODE_ADAPTERS_ARTIFACT_FILENAME)));
  } finally {
    if (prevOv !== undefined) process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY = prevOv;
    else delete process.env.SETUP_BOSS_EXECUTION_GRAPH_OVERLAY;
    if (prevNa !== undefined) process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS = prevNa;
    else delete process.env.SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("artefacto: graph_fingerprint alinha com grafo canónico", () => {
  const g = buildCanonicalExecutionGraph();
  const doc = buildNodeAdaptersArtifact(g, { run_id: "z" });
  assert.equal(doc.graph_fingerprint, computeExecutionGraphFingerprint(g));
});
