"use strict";

const fs = require("fs");
const path = require("path");
const { HANDOFF_STATUS } = require("../../runtime/strategy-runtime/build-execution-ready-handoff");

/**
 * @param {string} out
 * @param {{ n: number, badHandoffStatus?: boolean, orderMismatch?: boolean, chainDeps?: boolean }} opts
 */
function seedOutputWithStrategy(out, opts) {
  const n = opts.n || 1;
  fs.mkdirSync(path.join(out, "strategy", "subtasks"), { recursive: true });

  const subtaskRels = [];
  for (let i = 1; i <= n; i++) {
    const id = String(i).padStart(3, "0");
    const rel = `strategy/subtasks/${id}.json`;
    subtaskRels.push(rel);
    const files =
      i === 1
        ? ["src/a.js", "src/a.js", "docs/readme.md"]
        : [`src/b-${id}.js`];
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
    JSON.stringify(
      {
        version: 1,
        status: "ai_strategy_completed",
        recommended_mode: "expert",
      },
      null,
      2,
    ),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(out, "strategy", "complexity-analysis.json"),
    JSON.stringify(
      {
        version: 1,
        status: "complexity_analysis_completed",
        classification: "moderate",
        scores: { overall: 5, risk: 3 },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const ordered_subtasks = subtaskRels.map((rel, idx) => {
    const id = path.basename(rel, ".json");
    return {
      position: idx + 1,
      subtask_id: id,
      title: `T${id}`,
      depends_on: [],
    };
  });

  if (opts.orderMismatch) {
    ordered_subtasks.pop();
  }

  if (opts.chainDeps && ordered_subtasks.length > 1) {
    ordered_subtasks[1].depends_on = ["001"];
  }

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

  const status = opts.badHandoffStatus ? "wrong_status" : HANDOFF_STATUS;

  fs.writeFileSync(
    path.join(out, "strategy", "execution-ready-handoff.json"),
    JSON.stringify(
      {
        version: 1,
        phase: "3.8",
        status,
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

  fs.writeFileSync(
    path.join(out, "run-context.json"),
    JSON.stringify({ version: "1.0.0", run_type: "intake" }, null, 2),
    "utf-8",
  );
}

module.exports = { seedOutputWithStrategy };
