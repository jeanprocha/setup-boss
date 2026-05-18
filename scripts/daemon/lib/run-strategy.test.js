"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { collectStrategyBundle } = require("./run-strategy");
const { writeRunIndex } = require("../../../core/run-resolver");
const { OPERATIONAL_EXECUTABLE_STRATEGY_REL } = require("../../../core/build-operational-executable-strategy");
const {
  buildOperationalExecutableStrategy,
} = require("../../../core/build-operational-executable-strategy");

test("collectStrategyBundle sem artifacts → unsupported sem crash", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-st-"));
  const runId = "20260515-130000-test-strategy-empty";
  const outDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "run-context.json"),
    JSON.stringify({ version: "1.0.0", run_type: "intake" }),
    "utf-8",
  );
  writeRunIndex({ runId, projectRoot: root, outputDir: outDir, run_type: "test" });

  const r = collectStrategyBundle(outDir, runId);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.source, "unsupported");
  assert.strictEqual(r.data.summary.runId, runId);
  assert.deepStrictEqual(r.data.subtasks, []);
  assert.ok(r.data.summary.unsupportedReason);
});

test("collectStrategyBundle normaliza phase3 intermediário com readiness+handoff", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-st-"));
  const runId = "20260516-163856-legacy-strategy-ready";
  const outDir = path.join(root, "docs", ".IA", "outputs", runId);
  const strategyDir = path.join(outDir, "strategy");
  fs.mkdirSync(path.join(strategyDir, "subtasks"), { recursive: true });
  fs.writeFileSync(
    path.join(strategyDir, "subtasks", "001.json"),
    JSON.stringify({ id: "001", title: "T1", dependencies: [] }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "complexity-analysis.json"),
    JSON.stringify({ classification: "moderate", scores: { overall: 5, risk: 3 } }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "ai-strategy.json"),
    JSON.stringify({ recommended_mode: "standard" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "decomposition.json"),
    JSON.stringify({ subtask_count: 1 }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "execution-order.json"),
    JSON.stringify({ ordering_mode: "linear", ordered_subtasks: [{ subtask_id: "001" }] }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "shared-runtime-context.json"),
    JSON.stringify({ context_refs: ["strategy/subtasks/001.json"] }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "strategy-readiness.json"),
    JSON.stringify({ status: "strategy_ready", validation: { valid: true } }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(strategyDir, "execution-ready-handoff.json"),
    JSON.stringify({ status: "execution_ready_handoff_completed" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outDir, "run-context.json"),
    JSON.stringify({
      version: "1.0.0",
      phase3: { status: "strategy_runtime_initialized" },
    }),
    "utf-8",
  );

  const r = collectStrategyBundle(outDir, runId);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.summary.phase3Status, "strategy_ready");
  assert.strictEqual(r.data.summary.operationalReadiness, "ready");
});

test("collectStrategyBundle com artifacts parciais → partial/runtime", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-st-"));
  const runId = "20260515-130100-test-strategy-partial";
  const outDir = path.join(root, "docs", ".IA", "outputs", runId);
  const strategyDir = path.join(outDir, "strategy", "subtasks");
  fs.mkdirSync(strategyDir, { recursive: true });
  fs.writeFileSync(
    path.join(strategyDir, "001.json"),
    JSON.stringify({ id: "001", title: "T1", dependencies: [] }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outDir, "strategy", "complexity-analysis.json"),
    JSON.stringify({
      version: 1,
      classification: "moderate",
      scores: { overall: 5, risk: 3 },
      recommendations: ["risco moderado"],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outDir, "run-context.json"),
    JSON.stringify({
      version: "1.0.0",
      phase3: { status: "strategy_ready", updated_at: "2026-05-15T13:01:00Z" },
    }),
    "utf-8",
  );

  const r = collectStrategyBundle(outDir, runId);
  assert.strictEqual(r.ok, true);
  assert.ok(r.data.source === "partial" || r.data.source === "runtime");
  assert.strictEqual(r.data.subtasks.length, 1);
  assert.strictEqual(r.data.subtasks[0].id, "001");
  assert.strictEqual(r.data.complexity.level, "medium");
});

test("collectStrategyBundle inclui executableStrategy rico e subtasks enriquecidas", () => {
  const richRoot = path.join(
    __dirname,
    "../../../core/fixtures/operational-executable-strategy/rich-complete",
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-st-oes-"));
  const runId = "20260517-220000-test-oes-dto";
  const outDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.cpSync(richRoot, outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "run-context.json"),
    JSON.stringify({
      version: "1.0.0",
      phase3: { status: "strategy_ready" },
    }),
    "utf-8",
  );
  writeRunIndex({ runId, projectRoot: root, outputDir: outDir, run_type: "test" });

  buildOperationalExecutableStrategy({
    outputDirAbs: outDir,
    planVersion: 1,
    write: true,
  });

  const r = collectStrategyBundle(outDir, runId);
  assert.strictEqual(r.ok, true);
  assert.ok(r.data.executableStrategy);
  assert.strictEqual(r.data.executableStrategy.available, true);
  assert.ok(r.data.executableStrategy.strategySha256);
  assert.strictEqual(r.data.executableStrategy.miniTasks.length, 3);
  assert.ok(
    fs.existsSync(path.join(outDir, OPERATIONAL_EXECUTABLE_STRATEGY_REL)),
  );

  const st = r.data.subtasks.find((s) => s.id === "001");
  assert.ok(st);
  assert.ok(st.objective);
  assert.ok(st.acceptanceCriteria && st.acceptanceCriteria.length >= 1);
  assert.ok(st.miniTaskId && st.miniTaskId.startsWith("mini-"));
  assert.ok(r.data.ordering.blockingDependencies.some((d) => d.label.includes("depende")));
});

test("collectStrategyBundle run legado: executableStrategy degradado sem crash", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-st-legacy-oes-"));
  const runId = "20260517-220001-test-legacy-oes";
  const outDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "task-plan-refined.md"),
    "## Passos Propostos\n- Passo legado único\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outDir, "run-context.json"),
    JSON.stringify({ version: "1.0.0" }),
    "utf-8",
  );

  const r = collectStrategyBundle(outDir, runId);
  assert.strictEqual(r.ok, true);
  assert.ok(r.data.executableStrategy);
  assert.strictEqual(r.data.executableStrategy.degraded, true);
});
