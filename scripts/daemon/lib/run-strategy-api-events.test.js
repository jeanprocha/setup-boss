"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

function mkRepoTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-strat-api-evt-"));
  fs.mkdirSync(path.join(dir, ".setup-boss", "daemon"), { recursive: true });
  return dir;
}

test("triggerStrategyRun emite strategy_started e strategy_completed", async () => {
  const prev = process.env.SETUP_BOSS_CLI_ROOT;
  const repo = mkRepoTmp();
  const emitted = [];
  try {
    process.env.SETUP_BOSS_CLI_ROOT = repo;
    const { subscribeRuntimeEventListener } = require("./runtime-events");
    const unsub = subscribeRuntimeEventListener((e) => {
      if (e.runId === "test-run-strategy-events") emitted.push(e.type);
    });

    const root = path.join(repo, "docs", ".IA", "outputs", "test-run-strategy-events");
    fs.mkdirSync(root, { recursive: true });
    const SHA64 = "a".repeat(64);
    fs.writeFileSync(
      path.join(root, "run-context.json"),
      JSON.stringify({
        version: "1.1.0",
        phase2: { status: "ready_for_execution" },
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(root, "approval-state.json"),
      JSON.stringify({
        schema_version: "1.0.0",
        status: "approved",
        approved_at: "2026-01-01T00:00:00.000Z",
        plan_ref: "task-plan-refined.md",
        plan_sha256: SHA64,
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(root, "task-plan-refined.md"),
      [
        "---TASK_PLAN_REFINED---",
        "## Objetivo",
        "Teste eventos strategy.",
        "## Escopo Refinado",
        "Um módulo `src/a.js`.",
        "## Passos Propostos",
        "- Passo 1",
      ].join("\n"),
      "utf-8",
    );

    const { writeRunIndex } = require("../../../core/run-resolver");
    writeRunIndex({
      runId: "test-run-strategy-events",
      projectRoot: repo,
      outputDir: root,
      run_type: "test",
    });

    const { triggerStrategyRun } = require("./run-strategy-api");
    const r = await triggerStrategyRun({ runId: "test-run-strategy-events" });
    unsub();
    assert.strictEqual(r.ok, true);
    assert.ok(emitted.includes("strategy_started"), emitted.join(","));
    assert.ok(emitted.includes("strategy_completed"), emitted.join(","));
    assert.ok(!emitted.includes("strategy_waiting_user_action"));
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prev;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
