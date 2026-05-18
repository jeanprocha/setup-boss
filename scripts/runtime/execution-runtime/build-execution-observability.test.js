"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { runExecutionRuntimeBase } = require("./run-execution-runtime");
const { HANDOFF_STATUS } = require("../strategy-runtime/build-execution-ready-handoff");
const {
  buildExecutionObservability,
  mapEventToTimelineCategory,
  timelineRowFromDiagnosticEvent,
  isRoughIsoTimestamp,
} = require("./build-execution-observability");
const { validateExecutionRuntimeResult } = require("./validate-execution-runtime");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedOutputWithStrategy(out, n) {
  fs.mkdirSync(path.join(out, "strategy", "subtasks"), { recursive: true });
  const subtaskRels = [];
  for (let i = 1; i <= n; i++) {
    const id = String(i).padStart(3, "0");
    const rel = `strategy/subtasks/${id}.json`;
    subtaskRels.push(rel);
    fs.writeFileSync(
      path.join(out, "strategy", "subtasks", `${id}.json`),
      JSON.stringify(
        {
          id,
          title: `Sub ${id}`,
          goal: `Objetivo ${id}`,
          scope: { files: ["src/a.js"] },
          dependencies: [],
          shared_context_refs: [],
          acceptance_criteria: [`Critério ${id}`],
          ai_mode: "standard",
        },
        null,
        2,
      ),
      "utf-8",
    );
  }
  fs.writeFileSync(
    path.join(out, "strategy", "shared-runtime-context.json"),
    JSON.stringify({ version: 1, phase: "3.6", status: "shared_runtime_context_completed", context_refs: [], constraints: [], global_objective: "t" }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(out, "strategy", "ai-strategy.json"),
    JSON.stringify({ version: 1, status: "ai_strategy_completed", recommended_mode: "expert" }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(out, "strategy", "complexity-analysis.json"),
    JSON.stringify({ version: 1, status: "complexity_analysis_completed", classification: "moderate", scores: { overall: 5, risk: 3 } }, null, 2),
    "utf-8",
  );
  const ordered_subtasks = subtaskRels.map((rel, idx) => ({
    position: idx + 1,
    subtask_id: path.basename(rel, ".json"),
    title: "T",
    depends_on: [],
  }));
  fs.writeFileSync(
    path.join(out, "strategy", "execution-order.json"),
    JSON.stringify(
      {
        version: 1,
        phase: "3.5",
        status: "execution_order_completed",
        ordering_mode: "linear",
        ordered_subtasks,
        blocking_subtasks: [],
        dependency_warnings: [],
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(out, "strategy", "execution-ready-handoff.json"),
    JSON.stringify(
      {
        version: 1,
        phase: "3.8",
        status: HANDOFF_STATUS,
        execution_mode: "strategy_only",
        summary: { complexity: "simple", ai_mode: "basic", subtask_count: subtaskRels.length, ordering_mode: "linear" },
        artifacts: {},
        subtasks: subtaskRels,
        shared_context_ref: "strategy/shared-runtime-context.json",
        next_phase: "phase4_execution_runtime",
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(out, "run-context.json"), JSON.stringify({ version: "1.0.0", run_type: "intake" }, null, 2), "utf-8");
}

test("helpers: mapEventToTimelineCategory e timestamp", () => {
  assert.strictEqual(mapEventToTimelineCategory("rollback_completed"), "rollback");
  assert.strictEqual(mapEventToTimelineCategory("execution_recovery_started"), "recovery");
  assert.strictEqual(isRoughIsoTimestamp("2026-05-14T12:00:00.000Z"), true);
  assert.strictEqual(isRoughIsoTimestamp("not-a-date"), false);
  const row = timelineRowFromDiagnosticEvent(
    { type: "rollback_failed", recorded_at: "2026-05-14T12:00:00.000Z", payload: { subtask_id: "001" } },
    0,
  );
  assert.ok(row);
  assert.strictEqual(row.event, "rollback");
  assert.strictEqual(row.subtask_id, "001");
});

test("runExecutionRuntimeBase gera execution-observability.json válido", () => {
  const root = tmp("sb-obs410-");
  try {
    const runId = "obs410";
    const out = path.join(root, "o", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, 1);
    const r = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, true);
    const obsPath = path.join(out, "execution", "execution-observability.json");
    assert.ok(fs.existsSync(obsPath));
    const obs = JSON.parse(fs.readFileSync(obsPath, "utf-8"));
    assert.strictEqual(obs.version, 1);
    assert.strictEqual(obs.phase, "4.11");
    assert.strictEqual(obs.status, "observability_active");
    assert.ok(Array.isArray(obs.timeline));
    assert.ok(obs.timeline.length >= 1);
    let prev = "";
    for (const t of obs.timeline) {
      assert.ok(isRoughIsoTimestamp(String(t.timestamp)));
      if (prev) assert.ok(String(t.timestamp) >= prev);
      prev = String(t.timestamp);
    }
    assert.strictEqual(validateExecutionRuntimeResult(out).ok, true);
    const s001 = JSON.parse(fs.readFileSync(path.join(out, "execution", "subtasks", "001-execution.json"), "utf-8"));
    assert.strictEqual(s001.observability_state, "aggregated");
    assert.ok(typeof s001.last_observability_update === "string");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildExecutionObservability idempotente sem --force", () => {
  const root = tmp("sb-obs-idem-");
  try {
    const runId = "idem";
    const out = path.join(root, "o", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, 1);
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const diagPath = path.join(out, "execution", "execution-diagnostics.json");
    const len1 = JSON.parse(fs.readFileSync(diagPath, "utf-8")).events.length;
    const r2 = buildExecutionObservability({ outputDirAbs: out, force: false, recordDiagnosticEvents: false });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.skipped, true);
    const len2 = JSON.parse(fs.readFileSync(diagPath, "utf-8")).events.length;
    assert.strictEqual(len1, len2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildExecutionObservability --force rebuild com strip de eventos observability", () => {
  const root = tmp("sb-obs-force-");
  try {
    const runId = "frc";
    const out = path.join(root, "o", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, 1);
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const obs1 = JSON.parse(fs.readFileSync(path.join(out, "execution", "execution-observability.json"), "utf-8"));
    const gen1 = obs1.generated_at;
    const r2 = buildExecutionObservability({ outputDirAbs: out, force: true, recordDiagnosticEvents: true });
    assert.strictEqual(r2.ok, true);
    assert.ok(!r2.skipped);
    const obs2 = JSON.parse(fs.readFileSync(path.join(out, "execution", "execution-observability.json"), "utf-8"));
    assert.notStrictEqual(obs2.generated_at, gen1);
    const diag = JSON.parse(fs.readFileSync(path.join(out, "execution", "execution-diagnostics.json"), "utf-8"));
    const types = diag.events.map((e) => e.type);
    const obsEv = types.filter((t) => String(t).startsWith("observability_"));
    assert.strictEqual(obsEv.length, 3);
    assert.strictEqual(validateExecutionRuntimeResult(out).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
