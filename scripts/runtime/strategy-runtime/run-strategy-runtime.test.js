"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  runStrategyRuntimeBase,
  PHASE3_STATUS,
  DECOMPOSITION_STATUS,
  EXECUTION_ORDER_STATUS,
  SHARED_RUNTIME_CONTEXT_STATUS,
  STRATEGY_READY_STATUS,
  STRATEGY_READINESS_REL,
  EXECUTION_READY_HANDOFF_REL,
  HANDOFF_STATUS,
} = require("./run-strategy-runtime");
const { validateStrategyArtifacts } = require("./validate-strategy-artifacts");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const SHA64 = "a".repeat(64);

test("runStrategyRuntimeBase gera strategy/ e phase3", () => {
  const root = tmp("sb-strat-");
  try {
    const runId = "test-run-strategy";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });

    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          version: "1.1.0",
          run_type: "intake",
          phase2: {
            schema_version: "1.0.0",
            status: "ready_for_execution",
            current_round: 1,
            started_at: "2026-01-01T00:00:00.000Z",
            artifacts: [],
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    fs.writeFileSync(
      path.join(out, "approval-state.json"),
      JSON.stringify(
        {
          schema_version: "1.0.0",
          status: "approved",
          created_at: "2026-01-01T00:00:00.000Z",
          approved_at: "2026-01-01T00:00:00.000Z",
          rejected_at: null,
          plan_ref: "task-plan-refined.md",
          plan_sha256: SHA64,
          notes: "",
        },
        null,
        2,
      ),
      "utf-8",
    );

    fs.writeFileSync(
      path.join(out, "task-plan-refined.md"),
      [
        "---TASK_PLAN_REFINED---",
        "## Objetivo",
        "Teste com plano mais denso para elevar complexidade e permitir decomposição por secções.",
        "## Escopo Refinado",
        "X com referências a `src/a.js`, `src/b.js`, `docs/readme.md`, `scripts/x.js`, `lib/core.js`.",
        "## Decisões Confirmadas",
        "Y: usar orchestration no runtime com validation cross-runtime e pipeline scheduler.",
        "## Passos Propostos",
        "- Um passo com `src/app.js` e `src/util.ts`",
        "- Outro com `config/app.json` e `tests/app.test.js`",
        "- Integração `packages/api/src/handler.mjs`",
        "## Critérios de Aceite",
        "Z: cobrir breaking changes e governance de segurança.",
        "## Fora de Escopo",
        "N",
        "## Riscos Restantes",
        "Risco de rollback em runtime com blast radius elevado.",
      ].join("\n"),
      "utf-8",
    );

    const r = runStrategyRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, true);
    assert.ok(Array.isArray(r.artifacts));
    assert.ok(r.artifacts.includes("strategy/strategy-manifest.json"));

    assert.ok(r.artifacts.includes("strategy/complexity-analysis.json"));
    assert.ok(r.artifacts.includes("strategy/ai-strategy.json"));

    assert.ok(r.artifacts.includes("strategy/decomposition.json"));
    assert.ok(r.artifacts.some((a) => a.startsWith("strategy/subtasks/")));

    assert.ok(r.artifacts.includes("strategy/execution-order.json"));
    assert.ok(
      r.artifacts.includes("strategy/operational-executable-strategy.json"),
      "deve gerar OES automaticamente após strategy runtime",
    );
    const oes = JSON.parse(
      fs.readFileSync(
        path.join(out, "strategy", "operational-executable-strategy.json"),
        "utf-8",
      ),
    );
    assert.ok(Array.isArray(oes.miniTasks) && oes.miniTasks.length >= 2);
    assert.match(String(oes.approvalState?.strategySha256 || ""), /^[a-f0-9]{64}$/);
    assert.ok(oes.miniTasks[0].subtaskId);
    assert.ok(oes.miniTasks[0].objective);
    assert.ok(r.artifacts.includes("strategy/shared-runtime-context.json"));
    assert.ok(r.artifacts.includes("strategy/strategy-readiness.json"));
    assert.ok(r.artifacts.includes(EXECUTION_READY_HANDOFF_REL));

    const man = JSON.parse(
      fs.readFileSync(path.join(out, "strategy", "strategy-manifest.json"), "utf-8"),
    );
    assert.strictEqual(man.phase, "3.8");
    assert.strictEqual(man.status, HANDOFF_STATUS);
    assert.ok(man.strategy_artifacts.includes("strategy/complexity-analysis.json"));
    assert.ok(man.strategy_artifacts.includes("strategy/ai-strategy.json"));
    assert.ok(man.strategy_artifacts.includes("strategy/decomposition.json"));
    assert.ok(man.strategy_artifacts.includes("strategy/execution-order.json"));
    assert.ok(man.strategy_artifacts.includes("strategy/shared-runtime-context.json"));
    assert.ok(man.strategy_artifacts.includes("strategy/strategy-readiness.json"));
    assert.ok(man.strategy_artifacts.includes(EXECUTION_READY_HANDOFF_REL));

    const dec = JSON.parse(fs.readFileSync(path.join(out, "strategy", "decomposition.json"), "utf-8"));
    assert.strictEqual(dec.status, "decomposition_completed");
    assert.ok(dec.subtask_count >= 2, "plano com várias secções deve gerar múltiplas subtasks");
    const subNames = fs.readdirSync(path.join(out, "strategy", "subtasks")).filter((x) => x.endsWith(".json"));
    assert.strictEqual(subNames.length, dec.subtask_count);
    for (let i = 1; i <= dec.subtask_count; i++) {
      assert.ok(
        fs.existsSync(path.join(out, "strategy", "subtasks", `${String(i).padStart(3, "0")}.json`)),
        `falta subtask ${String(i).padStart(3, "0")}.json`,
      );
    }

    const cx = JSON.parse(
      fs.readFileSync(path.join(out, "strategy", "complexity-analysis.json"), "utf-8"),
    );
    assert.strictEqual(cx.status, "complexity_analysis_completed");
    assert.ok(typeof cx.scores.overall === "number");

    const ai = JSON.parse(fs.readFileSync(path.join(out, "strategy", "ai-strategy.json"), "utf-8"));
    assert.strictEqual(ai.status, "ai_strategy_completed");
    assert.ok(["basic", "standard", "expert"].includes(ai.recommended_mode));

    const ex = JSON.parse(
      fs.readFileSync(path.join(out, "strategy", "execution-strategy.json"), "utf-8"),
    );
    assert.strictEqual(ex.complexity_analysis_ready, true);
    assert.strictEqual(ex.ai_strategy_ready, true);
    assert.strictEqual(ex.decomposition_ready, true);
    assert.strictEqual(ex.ordering_ready, true);
    assert.strictEqual(ex.shared_context_ready, true);
    assert.strictEqual(ex.strategy_ready, true);
    assert.strictEqual(ex.handoff_ready, true);

    const v = validateStrategyArtifacts(out);
    assert.strictEqual(v.ok, true);

    const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
    assert.strictEqual(ctx.phase3.status, STRATEGY_READY_STATUS);
    assert.strictEqual(ctx.phase3.complexity.status, "complexity_analysis_completed");
    assert.strictEqual(ctx.phase3.complexity.overall, cx.scores.overall);
    assert.strictEqual(ctx.phase3.complexity.classification, cx.classification);
    assert.strictEqual(ctx.phase3.ai_strategy.status, "ai_strategy_completed");
    assert.strictEqual(ctx.phase3.ai_strategy.recommended_mode, ai.recommended_mode);
    assert.strictEqual(ctx.phase3.decomposition.status, DECOMPOSITION_STATUS);
    assert.strictEqual(ctx.phase3.decomposition.subtask_count, dec.subtask_count);
    assert.strictEqual(ctx.phase3.execution_order.status, EXECUTION_ORDER_STATUS);
    assert.strictEqual(ctx.phase3.execution_order.ordering_mode, "linear");
    assert.strictEqual(ctx.phase3.execution_order.subtask_count, dec.subtask_count);
    assert.strictEqual(ctx.phase3.shared_context.status, SHARED_RUNTIME_CONTEXT_STATUS);
    assert.strictEqual(ctx.phase3.shared_context.artifact, "strategy/shared-runtime-context.json");
    assert.strictEqual(ctx.phase3.readiness.status, STRATEGY_READY_STATUS);
    assert.strictEqual(ctx.phase3.readiness.artifact, STRATEGY_READINESS_REL);
    assert.strictEqual(ctx.phase3.handoff.status, HANDOFF_STATUS);
    assert.strictEqual(ctx.phase3.handoff.artifact, EXECUTION_READY_HANDOFF_REL);

    const st001 = JSON.parse(fs.readFileSync(path.join(out, "strategy", "subtasks", "001.json"), "utf-8"));
    assert.deepStrictEqual(st001.shared_context_refs, ["strategy/shared-runtime-context.json"]);

    const ho = JSON.parse(
      fs.readFileSync(path.join(out, "strategy", "execution-ready-handoff.json"), "utf-8"),
    );
    assert.strictEqual(ho.phase, "3.8");
    assert.strictEqual(ho.status, HANDOFF_STATUS);
    assert.strictEqual(ho.execution_mode, "strategy_only");
    assert.ok(Array.isArray(ho.subtasks));
    assert.strictEqual(ho.shared_context_ref, "strategy/shared-runtime-context.json");

    const rd = JSON.parse(fs.readFileSync(path.join(out, "strategy", "strategy-readiness.json"), "utf-8"));
    assert.strictEqual(rd.phase, "3.7");
    assert.strictEqual(rd.status, STRATEGY_READY_STATUS);
    assert.strictEqual(rd.validation.valid, true);
    assert.ok(Array.isArray(rd.validation.warnings));
    assert.ok(typeof rd.summary.subtask_count === "number");

    const shr = JSON.parse(
      fs.readFileSync(path.join(out, "strategy", "shared-runtime-context.json"), "utf-8"),
    );
    assert.strictEqual(shr.phase, "3.6");
    assert.strictEqual(shr.status, "shared_runtime_context_completed");
    assert.ok(Array.isArray(shr.constraints) && shr.constraints.includes("no_dag"));
    assert.ok(typeof shr.global_objective === "string");

    const diag = JSON.parse(
      fs.readFileSync(path.join(out, "strategy", "strategy-diagnostics.json"), "utf-8"),
    );
    assert.strictEqual(diag.version, 1);
    assert.strictEqual(diag.events.length, 20);
    assert.strictEqual(diag.events[0].event, "strategy_runtime_started");
    assert.strictEqual(diag.events[1].event, "complexity_analysis_started");
    assert.strictEqual(diag.events[2].event, "complexity_analysis_completed");
    assert.strictEqual(diag.events[3].event, "ai_strategy_started");
    assert.strictEqual(diag.events[4].event, "ai_strategy_completed");
    assert.strictEqual(diag.events[5].event, "decomposition_started");
    assert.strictEqual(diag.events[6].event, "decomposition_completed");
    assert.strictEqual(diag.events[7].event, "subtasks_generated");
    assert.strictEqual(diag.events[8].event, "execution_order_started");
    assert.strictEqual(diag.events[9].event, "execution_order_completed");
    assert.strictEqual(diag.events[10].event, "shared_runtime_context_started");
    assert.strictEqual(diag.events[11].event, "shared_runtime_context_completed");
    assert.strictEqual(diag.events[12].event, "operational_executable_strategy_completed");
    assert.strictEqual(diag.events[13].event, "strategy_validation_started");
    assert.strictEqual(diag.events[14].event, "strategy_validation_completed");
    assert.strictEqual(diag.events[15].event, "strategy_ready");
    assert.strictEqual(diag.events[16].event, "execution_ready_handoff_started");
    assert.strictEqual(diag.events[17].event, "execution_ready_handoff_completed");
    assert.strictEqual(diag.events[18].event, "strategy_runtime_completed");
    assert.strictEqual(diag.events[19].event, "strategy_artifacts_generated");
    assert.ok(diag.summary);
    assert.strictEqual(diag.summary.readiness_status, STRATEGY_READY_STATUS);
    assert.ok(Number.isInteger(diag.summary.total_subtasks));
    assert.strictEqual(diag.handoff_ready, true);
    assert.strictEqual(diag.final_phase, "3.8");
    assert.ok(Number.isInteger(diag.total_artifacts) && diag.total_artifacts > 0);
    assert.ok(Number.isInteger(diag.total_subtasks));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runStrategyRuntimeBase modo basic para plano trivial", () => {
  const root = tmp("sb-strat-basic-");
  try {
    const runId = "rid-basic";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          version: "1.1.0",
          run_type: "intake",
          phase2: { schema_version: "1.0.0", status: "ready_for_execution" },
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "approval-state.json"),
      JSON.stringify(
        {
          schema_version: "1.0.0",
          status: "approved",
          created_at: "2026-01-01T00:00:00.000Z",
          approved_at: "2026-01-01T00:00:00.000Z",
          rejected_at: null,
          plan_ref: "task-plan-refined.md",
          plan_sha256: SHA64,
          notes: "",
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(path.join(out, "task-plan-refined.md"), "## Passos\n- a\n", "utf-8");
    const r = runStrategyRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, true);
    const ai = JSON.parse(fs.readFileSync(path.join(out, "strategy", "ai-strategy.json"), "utf-8"));
    assert.strictEqual(ai.recommended_mode, "basic");
    const dec = JSON.parse(fs.readFileSync(path.join(out, "strategy", "decomposition.json"), "utf-8"));
    assert.strictEqual(dec.subtask_count, 1);
    assert.strictEqual(dec.strategy, "single");
    const eo = JSON.parse(fs.readFileSync(path.join(out, "strategy", "execution-order.json"), "utf-8"));
    assert.strictEqual(eo.status, "execution_order_completed");
    assert.strictEqual(eo.ordering_mode, "linear");
    const st = fs.readdirSync(path.join(out, "strategy", "subtasks")).filter((x) => x.endsWith(".json"));
    assert.deepStrictEqual(st.sort(), ["001.json"]);
    assert.ok(fs.existsSync(path.join(out, "strategy", "shared-runtime-context.json")));
    assert.ok(fs.existsSync(path.join(out, "strategy", "strategy-readiness.json")));
    assert.ok(fs.existsSync(path.join(out, "strategy", "execution-ready-handoff.json")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runStrategyRuntimeBase skip quando já válido", () => {
  const root = tmp("sb-strat-skip-");
  try {
    const runId = "test-run-skip";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });

    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          version: "1.1.0",
          run_type: "intake",
          phase2: { schema_version: "1.0.0", status: "ready_for_execution" },
          phase3: { status: PHASE3_STATUS },
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "approval-state.json"),
      JSON.stringify(
        {
          schema_version: "1.0.0",
          status: "approved",
          created_at: "2026-01-01T00:00:00.000Z",
          approved_at: "2026-01-01T00:00:00.000Z",
          rejected_at: null,
          plan_ref: "task-plan-refined.md",
          plan_sha256: SHA64,
          notes: "",
        },
        null,
        2,
      ),
      "utf-8",
    );

    fs.writeFileSync(
      path.join(out, "task-plan-refined.md"),
      "## Passos\n- ok\n",
      "utf-8",
    );

    const r1 = runStrategyRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.skipped, undefined);

    const r2 = runStrategyRuntimeBase({ outputDirAbs: out, runId, force: false });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.skipped, true);
    const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
    assert.strictEqual(ctx.phase3.decomposition.status, DECOMPOSITION_STATUS);
    assert.strictEqual(ctx.phase3.execution_order.status, EXECUTION_ORDER_STATUS);
    assert.strictEqual(ctx.phase3.shared_context.status, SHARED_RUNTIME_CONTEXT_STATUS);
    assert.strictEqual(ctx.phase3.readiness.status, STRATEGY_READY_STATUS);
    assert.strictEqual(ctx.phase3.handoff.status, HANDOFF_STATUS);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runStrategyRuntimeBase falha sem ready_for_execution", () => {
  const root = tmp("sb-strat-bad-");
  try {
    const runId = "bad";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase2: { status: "plan_refined" },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const r = runStrategyRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error && r.error.code === "STRATEGY_PHASE2_NOT_READY");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
