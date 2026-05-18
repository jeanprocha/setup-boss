"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  buildOperationalExecutableStrategy,
  OPERATIONAL_EXECUTABLE_STRATEGY_REL,
} = require("./build-operational-executable-strategy");
const {
  materializeExecutionRuntimeFromOes,
  syncExecutionRuntimeMiniActivities,
  loadExecutionRuntimeState,
  depsSatisfied,
  EXECUTION_RUNTIME_STATE_REL,
} = require("./materialize-execution-runtime-from-oes");
const { mapExecutionRuntimeStateDto } = require("./map-execution-runtime-state-dto");
const { subtaskExecutionFilename } = require("../scripts/runtime/execution-runtime/build-subtask-execution-state");

const FIXTURES = path.join(
  __dirname,
  "fixtures",
  "operational-executable-strategy",
);

function copyFixtureToTmp(name) {
  const src = path.join(FIXTURES, name);
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), `oes-exec-${name}-`));
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

test("materializeExecutionRuntimeFromOes: cria miniActivities com dependências e rastreabilidade", () => {
  const out = copyFixtureToTmp("rich-complete");
  const build = buildOperationalExecutableStrategy({
    outputDirAbs: out,
    planVersion: 1,
    runId: "run-mat",
    write: true,
  });
  assert.strictEqual(build.ok, true);

  fs.writeFileSync(
    path.join(out, "approval-state.json"),
    JSON.stringify(
      {
        status: "approved",
        plan_ref: "task-plan-refined.md",
        plan_sha256: "abc123plan",
        approved_at: "2026-05-17T12:00:00.000Z",
      },
      null,
      2,
    ),
    "utf-8",
  );

  const mat = materializeExecutionRuntimeFromOes(out, { runId: "run-mat" });
  assert.strictEqual(mat.ok, true);
  assert.strictEqual(mat.skipped, false);
  assert.ok(fs.existsSync(path.join(out, EXECUTION_RUNTIME_STATE_REL)));

  const state = mat.state;
  assert.ok(state);
  assert.strictEqual(state.legacy, false);
  assert.ok(Array.isArray(state.miniActivities));
  assert.ok(state.miniActivities.length >= 2);
  assert.ok(state.traceability.strategySha256);
  assert.strictEqual(state.traceability.sourcePlanSha256, "abc123plan");

  const second = state.miniActivities.find((m) => Number(m.order) === 2);
  assert.ok(second);
  assert.ok(asStringList(second.dependsOnMiniActivityIds).length >= 1);

  const first = state.miniActivities.find((m) => Number(m.order) === 1);
  assert.ok(first);
  assert.strictEqual(String(first.status), "ready");
});

test("materializeExecutionRuntimeFromOes: idempotente sem force", () => {
  const out = copyFixtureToTmp("rich-complete");
  buildOperationalExecutableStrategy({ outputDirAbs: out, write: true });
  const a = materializeExecutionRuntimeFromOes(out);
  const b = materializeExecutionRuntimeFromOes(out);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.skipped, true);
});

test("syncExecutionRuntimeMiniActivities: reflete subtask em execução", () => {
  const out = copyFixtureToTmp("rich-complete");
  buildOperationalExecutableStrategy({ outputDirAbs: out, write: true });
  materializeExecutionRuntimeFromOes(out);

  const loaded = loadExecutionRuntimeState(out);
  const first = loaded.state.miniActivities.find((m) => Number(m.order) === 1);
  assert.ok(first && first.subtaskId);

  const execDir = path.join(out, "execution", "subtasks");
  fs.mkdirSync(execDir, { recursive: true });
  const fn = subtaskExecutionFilename(String(first.subtaskId));
  fs.writeFileSync(
    path.join(execDir, fn),
    JSON.stringify(
      {
        subtask_id: first.subtaskId,
        execution_state: "executing",
        review_state: "none",
        status: "running",
      },
      null,
      2,
    ),
    "utf-8",
  );

  const sync = syncExecutionRuntimeMiniActivities(out);
  assert.strictEqual(sync.ok, true);
  const running = sync.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.strictEqual(String(running.status), "running");
});

test("materializeExecutionRuntimeFromOes: run legado sem OES", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "oes-exec-legacy-"));
  const mat = materializeExecutionRuntimeFromOes(out);
  assert.strictEqual(mat.ok, false);
  assert.strictEqual(mat.legacy, true);
});

test("mapExecutionRuntimeStateDto: projeta para API", () => {
  const out = copyFixtureToTmp("rich-complete");
  buildOperationalExecutableStrategy({ outputDirAbs: out, write: true });
  materializeExecutionRuntimeFromOes(out);
  const loaded = loadExecutionRuntimeState(out);
  const dto = mapExecutionRuntimeStateDto(loaded.state);
  assert.ok(dto);
  assert.ok(dto.miniActivities.length >= 2);
  assert.ok(dto.traceability.planVersion);
});

test("depsSatisfied: bloqueia até dependência concluir", () => {
  const miniActivities = [
    {
      miniActivityId: "a",
      status: "completed",
      dependsOnMiniActivityIds: [],
    },
    {
      miniActivityId: "b",
      status: "blocked_by_dependency",
      dependsOnMiniActivityIds: ["a"],
    },
  ];
  assert.strictEqual(depsSatisfied(miniActivities, "b"), true);
  miniActivities[0].status = "running";
  assert.strictEqual(depsSatisfied(miniActivities, "b"), false);
});

/**
 * @param {unknown} raw
 */
function asStringList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "").trim()).filter(Boolean);
}
