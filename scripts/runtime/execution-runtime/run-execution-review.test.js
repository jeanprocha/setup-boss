"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { runExecutionRuntimeBase } = require("./run-execution-runtime");
const { validateExecutionRuntimeResult } = require("./validate-execution-runtime");
const {
  runExecutionReviewPhase,
  executionReviewFilename,
  isValidExecutionReviewDoc,
} = require("./run-execution-review");
const { loadHandoffAndOrderForExecution } = require("./build-execution-session");
const { HANDOFF_STATUS } = require("../strategy-runtime/build-execution-ready-handoff");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * @param {string} out
 * @param {{ n?: number }} opts
 */
function seedOutputWithStrategy(out, opts) {
  const n = opts.n || 1;
  fs.mkdirSync(path.join(out, "strategy", "subtasks"), { recursive: true });

  const subtaskRels = [];
  for (let i = 1; i <= n; i++) {
    const id = String(i).padStart(3, "0");
    const rel = `strategy/subtasks/${id}.json`;
    subtaskRels.push(rel);
    const files = i === 1 ? ["src/a.js", "docs/readme.md"] : [`src/b-${id}.js`];
    fs.writeFileSync(
      path.join(out, "strategy", "subtasks", `${id}.json`),
      JSON.stringify(
        {
          id,
          title: `Sub ${id}`,
          goal: `Objetivo ${id}`,
          scope: { files },
          dependencies: [],
          shared_context_refs: ["strategy/shared-runtime-context.json"],
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
    JSON.stringify(
      {
        version: 1,
        phase: "3.6",
        status: "shared_runtime_context_completed",
        context_refs: ["strategy/shared-runtime-context.json"],
        constraints: ["no_dag"],
        global_objective: "test",
      },
      null,
      2,
    ),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(out, "strategy", "ai-strategy.json"),
    JSON.stringify({ version: 1, status: "ai_strategy_completed", recommended_mode: "expert" }, null, 2),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(out, "strategy", "complexity-analysis.json"),
    JSON.stringify(
      { version: 1, status: "complexity_analysis_completed", classification: "moderate", scores: { overall: 5, risk: 3 } },
      null,
      2,
    ),
    "utf-8",
  );

  const ordered_subtasks = subtaskRels.map((rel, idx) => {
    const id = path.basename(rel, ".json");
    return { position: idx + 1, subtask_id: id, title: `T${id}`, depends_on: [] };
  });

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
        summary: {
          complexity: "simple",
          ai_mode: "basic",
          subtask_count: subtaskRels.length,
          ordering_mode: "linear",
        },
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

test("review aprovado: execution-review válido e lifecycle review_completed", () => {
  const root = tmp("sb-rev46-ok-");
  try {
    const out = path.join(root, "o");
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId: "r" }).ok, true);
    const rvPath = path.join(out, "execution", "results", "001-execution-review.json");
    assert.ok(fs.existsSync(rvPath));
    const rv = JSON.parse(fs.readFileSync(rvPath, "utf-8"));
    assert.ok(isValidExecutionReviewDoc(rv));
    assert.strictEqual(rv.review_state, "approved");
    assert.strictEqual(rv.status, "review_completed");
    const st = JSON.parse(fs.readFileSync(path.join(out, "execution", "subtasks", "001-execution.json"), "utf-8"));
    assert.strictEqual(st.execution_state, "review_completed");
    assert.strictEqual(st.review_state, "approved");
    assert.ok(typeof st.review_completed_at === "string");
    const v = validateExecutionRuntimeResult(out);
    assert.strictEqual(v.ok, true, v.errors.join("; "));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("review rejected quando patch-validation falha", () => {
  const root = tmp("sb-rev46-pvf-");
  try {
    const out = path.join(root, "o");
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId: "r" }).ok, true);
    const pvPath = path.join(out, "execution", "results", "001-patch-validation.json");
    const pv = JSON.parse(fs.readFileSync(pvPath, "utf-8"));
    pv.validation_state = "failed";
    pv.status = "validation_failed";
    pv.errors = ["simulated"];
    pv.checks = {
      allowed_scope_respected: false,
      unexpected_files_detected: true,
      wildcard_detected: false,
      empty_paths_detected: false,
      duplicate_paths_detected: false,
    };
    fs.writeFileSync(pvPath, JSON.stringify(pv, null, 2), "utf-8");
    const exPath = path.join(out, "execution", "subtasks", "001-execution.json");
    const ex = JSON.parse(fs.readFileSync(exPath, "utf-8"));
    ex.execution_state = "patch_validation_failed";
    ex.status = "patch_validation_failed";
    ex.validation_state = "failed";
    fs.writeFileSync(exPath, JSON.stringify(ex, null, 2), "utf-8");

    const loaded = loadHandoffAndOrderForExecution(out);
    assert.strictEqual(loaded.ok, true);
    const events = [];
    const iso = () => new Date().toISOString();
    runExecutionReviewPhase({
      execDir: path.join(out, "execution"),
      loaded,
      force: true,
      events,
      iso,
    });
    const rv = JSON.parse(fs.readFileSync(path.join(out, "execution", "results", "001-execution-review.json"), "utf-8"));
    assert.strictEqual(rv.review_state, "rejected");
    assert.strictEqual(rv.status, "review_failed");
    const st = JSON.parse(fs.readFileSync(exPath, "utf-8"));
    assert.strictEqual(st.execution_state, "review_failed");
    assert.ok(events.some((e) => e.type === "execution_review_failed"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("review blocked quando handoff acceptance_criteria vazio", () => {
  const root = tmp("sb-rev46-bl-");
  try {
    const out = path.join(root, "o");
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId: "r" }).ok, true);
    const hp = path.join(out, "execution", "handoffs", "001-architect-handoff.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf-8"));
    h.acceptance_criteria = [];
    fs.writeFileSync(hp, JSON.stringify(h, null, 2), "utf-8");
    const exPath = path.join(out, "execution", "subtasks", "001-execution.json");
    const ex = JSON.parse(fs.readFileSync(exPath, "utf-8"));
    ex.execution_state = "patch_validated";
    ex.status = "patch_validated";
    fs.writeFileSync(exPath, JSON.stringify(ex, null, 2), "utf-8");

    const loaded = loadHandoffAndOrderForExecution(out);
    assert.strictEqual(loaded.ok, true);
    runExecutionReviewPhase({
      execDir: path.join(out, "execution"),
      loaded,
      force: true,
      events: [],
      iso: () => new Date().toISOString(),
    });
    const rv = JSON.parse(fs.readFileSync(path.join(out, "execution", "results", "001-execution-review.json"), "utf-8"));
    assert.strictEqual(rv.review_state, "blocked");
    assert.strictEqual(rv.decision.blocking, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("idempotência: segundo review sem --force não altera approved válido", () => {
  const root = tmp("sb-rev46-id-");
  try {
    const out = path.join(root, "o");
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId: "r" }).ok, true);
    const rvPath = path.join(out, "execution", "results", executionReviewFilename("001"));
    const first = fs.readFileSync(rvPath, "utf-8");
    const loaded = loadHandoffAndOrderForExecution(out);
    assert.strictEqual(loaded.ok, true);
    runExecutionReviewPhase({
      execDir: path.join(out, "execution"),
      loaded,
      force: false,
      events: [],
      iso: () => new Date().toISOString(),
    });
    const second = fs.readFileSync(rvPath, "utf-8");
    assert.strictEqual(second, first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("--force permite rereview (artefacto execution-review alterado)", () => {
  const root = tmp("sb-rev46-fr-");
  try {
    const out = path.join(root, "o");
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId: "r" }).ok, true);
    const rvPath = path.join(out, "execution", "results", executionReviewFilename("001"));
    const first = JSON.parse(fs.readFileSync(rvPath, "utf-8")).reviewed_at;
    const loaded = loadHandoffAndOrderForExecution(out);
    runExecutionReviewPhase({
      execDir: path.join(out, "execution"),
      loaded,
      force: true,
      events: [],
      iso: () => new Date().toISOString(),
    });
    const second = JSON.parse(fs.readFileSync(rvPath, "utf-8")).reviewed_at;
    assert.notStrictEqual(second, first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
