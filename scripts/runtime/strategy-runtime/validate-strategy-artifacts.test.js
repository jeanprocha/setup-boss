"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  validateStrategyArtifacts,
  validateComplexityDocument,
  validateAiStrategyDocument,
  validateSubtaskDocument,
  validateSharedRuntimeContextDocument,
  validateStrategyReadinessDocument,
} = require("./validate-strategy-artifacts");
const { buildExecutionOrder } = require("./build-execution-order");
const { buildSharedRuntimeContext, applySharedContextRefsToSubtasks, DEFAULT_CONSTRAINTS } = require("./build-shared-runtime-context");
const {
  buildStrategyReadiness,
  STRATEGY_READINESS_REL,
  STRATEGY_READY_STATUS,
} = require("./build-strategy-readiness");
const {
  buildExecutionReadyHandoff,
  EXECUTION_READY_HANDOFF_REL,
  HANDOFF_STATUS,
} = require("./build-execution-ready-handoff");

/**
 * @param {Record<string, unknown>} [overrides]
 */
function baseValidComplexity(overrides = {}) {
  return {
    version: 1,
    phase: "3.2",
    status: "complexity_analysis_completed",
    scores: {
      overall: 5,
      scope: 5,
      risk: 5,
      context_pressure: 5,
      execution_difficulty: 5,
    },
    classification: "moderate",
    signals: [],
    recommendations: [],
    ...overrides,
  };
}

/** @param {Record<string, unknown>} [overrides] */
function baseValidAiStrategy(overrides = {}) {
  return {
    version: 1,
    phase: "3.3",
    status: "ai_strategy_completed",
    recommended_mode: "standard",
    rationale: ["baseline:overall4-6→standard"],
    cost_profile: "balanced",
    quality_profile: "balanced",
    recommended_usage: {
      architect: "standard",
      executor: "standard",
      review: "standard",
      correction: "standard",
    },
    ...overrides,
  };
}

function writeExecutionStrategy(out) {
  fs.writeFileSync(
    path.join(out, "strategy", "execution-strategy.json"),
    JSON.stringify(
      {
        version: 1,
        strategy_status: "initialized",
        execution_mode: "preparation_only",
        decomposition_ready: true,
        ordering_ready: true,
        ai_strategy_ready: true,
        complexity_analysis_ready: true,
        shared_context_ready: false,
        strategy_ready: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

/**
 * @param {string} out
 * @param {string} runId
 * @param {number} n
 */
function writeDecompositionBundle(out, runId, n) {
  const subDir = path.join(out, "strategy", "subtasks");
  fs.mkdirSync(subDir, { recursive: true });
  for (let i = 1; i <= n; i++) {
    const id = String(i).padStart(3, "0");
    fs.writeFileSync(
      path.join(subDir, `${id}.json`),
      JSON.stringify(
        {
          version: 1,
          id,
          title: `Título ${id}`,
          goal: "Objetivo",
          scope: { files: [], domains: [] },
          dependencies: [],
          complexity: { estimated_score: 5, risk: 5 },
          ai_mode: "standard",
          acceptance_criteria: ["c1"],
          status: "planned",
        },
        null,
        2,
      ),
      "utf-8",
    );
  }
  fs.writeFileSync(
    path.join(out, "strategy", "decomposition.json"),
    JSON.stringify(
      {
        version: 1,
        phase: "3.4",
        status: "decomposition_completed",
        subtask_count: n,
        strategy: "single",
        rationale: [],
        subtasks: Array.from({ length: n }, (_, i) => {
          const id = String(i + 1).padStart(3, "0");
          return { id, title: `Título ${id}` };
        }),
      },
      null,
      2,
    ),
    "utf-8",
  );
  const arts = [
    "strategy/execution-strategy.json",
    "strategy/complexity-analysis.json",
    "strategy/ai-strategy.json",
    "strategy/decomposition.json",
    ...Array.from({ length: n }, (_, i) => `strategy/subtasks/${String(i + 1).padStart(3, "0")}.json`),
  ];
  const stratDir = path.join(out, "strategy");
  const ord = buildExecutionOrder({ strategyDir: stratDir });
  if (!ord.ok) throw new Error("buildExecutionOrder");
  fs.writeFileSync(
    path.join(stratDir, "execution-order.json"),
    JSON.stringify(ord.doc, null, 2),
    "utf-8",
  );
  arts.push("strategy/execution-order.json");
  fs.writeFileSync(
    path.join(out, "strategy", "strategy-manifest.json"),
    JSON.stringify(
      {
        version: 1,
        phase: "3.5",
        status: "execution_order_completed",
        created_at: "2026-01-01T00:00:00.000Z",
        run_id: runId,
        strategy_artifacts: arts,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

/**
 * @param {string} out
 */
function finalizePhase36(out) {
  const stratDir = path.join(out, "strategy");
  const bc = buildSharedRuntimeContext({ outputDirAbs: out });
  if (!bc.ok) throw new Error(JSON.stringify(bc.error));
  fs.writeFileSync(
    path.join(stratDir, "shared-runtime-context.json"),
    JSON.stringify(bc.doc, null, 2),
    "utf-8",
  );
  const ap = applySharedContextRefsToSubtasks({ strategyDir: stratDir });
  if (!ap.ok) throw new Error(JSON.stringify(ap.error));
  const exPath = path.join(stratDir, "execution-strategy.json");
  const ex = JSON.parse(fs.readFileSync(exPath, "utf-8"));
  ex.shared_context_ready = true;
  ex.strategy_ready = false;
  fs.writeFileSync(exPath, JSON.stringify(ex, null, 2), "utf-8");
  const manPath = path.join(stratDir, "strategy-manifest.json");
  const man = JSON.parse(fs.readFileSync(manPath, "utf-8"));
  man.phase = "3.6";
  man.status = "shared_runtime_context_completed";
  const rel = "strategy/shared-runtime-context.json";
  const arts = Array.isArray(man.strategy_artifacts) ? man.strategy_artifacts.slice() : [];
  if (!arts.includes(rel)) arts.push(rel);
  man.strategy_artifacts = arts;
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2), "utf-8");
}

/**
 * @param {string} out
 */
function finalizePhase37(out) {
  const stratDir = path.join(out, "strategy");
  const br = buildStrategyReadiness({ outputDirAbs: out });
  if (!br.ok) throw new Error(JSON.stringify(br.error));
  const doc = /** @type {Record<string, unknown>} */ (br.doc);
  const val = doc.validation;
  if (!val || typeof val !== "object" || Array.isArray(val) || /** @type {Record<string, unknown>} */ (val).valid !== true) {
    throw new Error("readiness inválido em finalizePhase37");
  }
  fs.writeFileSync(
    path.join(stratDir, "strategy-readiness.json"),
    JSON.stringify(doc, null, 2),
    "utf-8",
  );
  const exPath = path.join(stratDir, "execution-strategy.json");
  const ex = JSON.parse(fs.readFileSync(exPath, "utf-8"));
  ex.strategy_ready = true;
  fs.writeFileSync(exPath, JSON.stringify(ex, null, 2), "utf-8");
  const manPath = path.join(stratDir, "strategy-manifest.json");
  const man = JSON.parse(fs.readFileSync(manPath, "utf-8"));
  man.phase = "3.7";
  man.status = STRATEGY_READY_STATUS;
  const arts = Array.isArray(man.strategy_artifacts) ? man.strategy_artifacts.slice() : [];
  if (!arts.includes(STRATEGY_READINESS_REL)) arts.push(STRATEGY_READINESS_REL);
  man.strategy_artifacts = arts;
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2), "utf-8");
  const rcPath = path.join(out, "run-context.json");
  const rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  if (!rc.phase3 || typeof rc.phase3 !== "object") throw new Error("phase3 em falta");
  rc.phase3.readiness = { status: STRATEGY_READY_STATUS, artifact: STRATEGY_READINESS_REL };
  fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2), "utf-8");
}

/**
 * @param {string} out
 */
function finalizePhase38(out) {
  const stratDir = path.join(out, "strategy");
  const bh = buildExecutionReadyHandoff({ outputDirAbs: out });
  if (!bh.ok) throw new Error(JSON.stringify(bh.error));
  fs.writeFileSync(
    path.join(stratDir, "execution-ready-handoff.json"),
    JSON.stringify(bh.doc, null, 2),
    "utf-8",
  );
  const exPath = path.join(stratDir, "execution-strategy.json");
  const ex = JSON.parse(fs.readFileSync(exPath, "utf-8"));
  ex.handoff_ready = true;
  fs.writeFileSync(exPath, JSON.stringify(ex, null, 2), "utf-8");
  const manPath = path.join(stratDir, "strategy-manifest.json");
  const man = JSON.parse(fs.readFileSync(manPath, "utf-8"));
  man.phase = "3.8";
  man.status = HANDOFF_STATUS;
  const arts = Array.isArray(man.strategy_artifacts) ? man.strategy_artifacts.slice() : [];
  if (!arts.includes(EXECUTION_READY_HANDOFF_REL)) arts.push(EXECUTION_READY_HANDOFF_REL);
  man.strategy_artifacts = arts;
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2), "utf-8");
  const rcPath = path.join(out, "run-context.json");
  const rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  if (!rc.phase3 || typeof rc.phase3 !== "object") throw new Error("phase3 em falta");
  rc.phase3.handoff = { status: HANDOFF_STATUS, artifact: EXECUTION_READY_HANDOFF_REL };
  fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2), "utf-8");
}

test("validateComplexityDocument rejeita overall não inteiro", () => {
  const err = validateComplexityDocument(
    baseValidComplexity({
      scores: {
        overall: 3.5,
        scope: 1,
        risk: 1,
        context_pressure: 1,
        execution_difficulty: 1,
      },
    }),
    "complexity-analysis.json",
  );
  assert.ok(err.some((e) => e.includes("overall")));
});

test("validateAiStrategyDocument rejeita recommended_mode inválido", () => {
  const err = validateAiStrategyDocument(
    baseValidAiStrategy({ recommended_mode: "turbo" }),
    "ai-strategy.json",
  );
  assert.ok(err.some((e) => e.includes("recommended_mode")));
});

test("validateSubtaskDocument rejeita ai_mode inválido", () => {
  const err = validateSubtaskDocument(
    {
      version: 1,
      id: "001",
      title: "x",
      goal: "g",
      scope: { files: [], domains: [] },
      dependencies: [],
      complexity: { estimated_score: 1, risk: 1 },
      ai_mode: "turbo",
      acceptance_criteria: ["a"],
      status: "planned",
      shared_context_refs: ["strategy/shared-runtime-context.json"],
    },
    "strategy/subtasks/001.json",
  );
  assert.ok(err.some((e) => e.includes("ai_mode")));
});

test("validateStrategyArtifacts aceita layout completo coerente", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-strat-ok-"));
  try {
    const runId = "rid-coherent";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: {
              status: "decomposition_completed",
              subtask_count: 1,
            },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    finalizePhase37(out);
    finalizePhase38(out);
    const v = validateStrategyArtifacts(out);
    assert.strictEqual(v.ok, true, v.ok ? "" : v.errors.join("; "));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts falha se phase3.overall incoerente", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-strat-bad-"));
  try {
    const runId = "rid-bad";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 9,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: {
              status: "decomposition_completed",
              subtask_count: 1,
            },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    const v = validateStrategyArtifacts(out, { phase37: false });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("overall")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts falha se ai_strategy.recommended_mode incoerente", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-ai-rc-"));
  try {
    const runId = "rid-ai";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy({ recommended_mode: "expert" });
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "basic",
            },
            decomposition: {
              status: "decomposition_completed",
              subtask_count: 1,
            },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    const v = validateStrategyArtifacts(out, { phase37: false });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("recommended_mode")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts falha com subtask inválida", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-sub-bad-"));
  try {
    const runId = "rid-sub";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: {
              status: "decomposition_completed",
              subtask_count: 1,
            },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    fs.writeFileSync(
      path.join(out, "strategy", "subtasks", "001.json"),
      JSON.stringify(
        {
          version: 1,
          id: "001",
          title: "x",
          goal: "g",
          scope: { files: [], domains: [] },
          dependencies: [],
          complexity: { estimated_score: 11, risk: 0 },
          ai_mode: "standard",
          acceptance_criteria: ["a"],
          status: "planned",
        },
        null,
        2,
      ),
      "utf-8",
    );
    const v = validateStrategyArtifacts(out, { phase37: false });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("estimated_score")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts falha com position inválida em execution-order", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-eo-pos-"));
  try {
    const runId = "rid-eo";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: {
              status: "decomposition_completed",
              subtask_count: 1,
            },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    fs.writeFileSync(
      path.join(out, "strategy", "execution-order.json"),
      JSON.stringify(
        {
          version: 1,
          phase: "3.5",
          status: "execution_order_completed",
          ordering_mode: "linear",
          ordered_subtasks: [
            { position: 2, subtask_id: "001", title: "x", depends_on: [] },
          ],
          blocking_subtasks: [],
          dependency_warnings: [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    const v = validateStrategyArtifacts(out, { phase37: false });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("position")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateSharedRuntimeContextDocument rejeita phase inválida", () => {
  const err = validateSharedRuntimeContextDocument(
    {
      version: 1,
      phase: "3.5",
      status: "shared_runtime_context_completed",
      global_objective: "",
      constraints: [...DEFAULT_CONSTRAINTS],
      source_artifacts: ["run-context.json"],
      strategy_summary: {
        complexity: {},
        ai_strategy: {},
        decomposition: {},
        execution_order: {},
      },
      context_refs: [],
    },
    "shared-runtime-context.json",
  );
  assert.ok(err.some((e) => e.includes("phase")));
});

test("validateStrategyReadinessDocument rejeita validation.valid false", () => {
  const err = validateStrategyReadinessDocument(
    {
      version: 1,
      phase: "3.7",
      status: "strategy_ready",
      validation: { valid: false, errors: [], warnings: [] },
      summary: {
        complexity: "moderate",
        ai_mode: "standard",
        subtask_count: 1,
        ordering_mode: "linear",
      },
      artifacts: ["strategy/execution-strategy.json"],
      generated_at: "2026-01-01T00:00:00.000Z",
    },
    "strategy-readiness.json",
  );
  assert.ok(err.some((e) => e.includes("validation.valid")));
});

test("buildStrategyReadiness inclui warning quando ai_mode da subtask difere", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-readiness-warn-"));
  try {
    const runId = "rid-warn";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(baseValidComplexity(), null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(baseValidAiStrategy({ recommended_mode: "expert" }), null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "expert",
            },
            decomposition: { status: "decomposition_completed", subtask_count: 1 },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    const st = JSON.parse(fs.readFileSync(path.join(out, "strategy", "subtasks", "001.json"), "utf-8"));
    st.ai_mode = "standard";
    fs.writeFileSync(path.join(out, "strategy", "subtasks", "001.json"), JSON.stringify(st, null, 2), "utf-8");
    const br = buildStrategyReadiness({ outputDirAbs: out });
    assert.strictEqual(br.ok, true);
    const doc = /** @type {Record<string, unknown>} */ (br.doc);
    const v = /** @type {Record<string, unknown>} */ (doc.validation);
    assert.strictEqual(v.valid, true);
    assert.ok(Array.isArray(v.warnings) && v.warnings.length > 0);
    assert.ok(String(v.warnings[0]).includes("ai_mode"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts rejeita strategy-readiness.json inválido", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-readiness-bad-"));
  try {
    const runId = "rid-rbad";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(baseValidComplexity(), null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(baseValidAiStrategy(), null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: { status: "decomposition_completed", subtask_count: 1 },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
            readiness: { status: STRATEGY_READY_STATUS, artifact: STRATEGY_READINESS_REL },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    finalizePhase37(out);
    finalizePhase38(out);
    fs.writeFileSync(
      path.join(out, "strategy", "strategy-readiness.json"),
      JSON.stringify(
        {
          version: 1,
          phase: "3.0",
          status: "strategy_ready",
          validation: { valid: true, errors: [], warnings: [] },
          summary: {
            complexity: "moderate",
            ai_mode: "standard",
            subtask_count: 1,
            ordering_mode: "linear",
          },
          artifacts: [],
          generated_at: "2026-01-01T00:00:00.000Z",
        },
        null,
        2,
      ),
      "utf-8",
    );
    const v = validateStrategyArtifacts(out);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("strategy-readiness") || e.includes("phase")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts rejeita subtask sem shared_context_refs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-no-refs-"));
  try {
    const runId = "rid-noref";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: {
              status: "decomposition_completed",
              subtask_count: 1,
            },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    finalizePhase37(out);
    finalizePhase38(out);
    fs.writeFileSync(
      path.join(out, "strategy", "subtasks", "001.json"),
      JSON.stringify(
        {
          version: 1,
          id: "001",
          title: "x",
          goal: "g",
          scope: { files: [], domains: [] },
          dependencies: [],
          complexity: { estimated_score: 5, risk: 5 },
          ai_mode: "standard",
          acceptance_criteria: ["a"],
          status: "planned",
        },
        null,
        2,
      ),
      "utf-8",
    );
    const v = validateStrategyArtifacts(out);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("shared_context_refs")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts rejeita se faltar execution-ready-handoff (Fase 3.8 por defeito)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-missing-ho-"));
  try {
    const runId = "rid-missho";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: { status: "decomposition_completed", subtask_count: 1 },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    finalizePhase37(out);
    const v = validateStrategyArtifacts(out);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("execution-ready-handoff")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts com phase38 false aceita só até 3.7", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-ph38off-"));
  try {
    const runId = "rid-p38off";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: { status: "decomposition_completed", subtask_count: 1 },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    finalizePhase37(out);
    const v = validateStrategyArtifacts(out, { phase38: false });
    assert.strictEqual(v.ok, true, v.ok ? "" : v.errors.join("; "));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateStrategyArtifacts rejeita handoff com summary incoerente", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-val-ho-sum-"));
  try {
    const runId = "rid-hosum";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: { status: "decomposition_completed", subtask_count: 1 },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    finalizePhase37(out);
    finalizePhase38(out);
    const hp = path.join(out, "strategy", "execution-ready-handoff.json");
    const ho = JSON.parse(fs.readFileSync(hp, "utf-8"));
    ho.summary = ho.summary || {};
    ho.summary.complexity = "fantasma";
    fs.writeFileSync(hp, JSON.stringify(ho, null, 2), "utf-8");
    const v = validateStrategyArtifacts(out);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("execution-ready-handoff") && e.includes("complexity")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildExecutionReadyHandoff produz contrato mínimo coerente", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-build-ho-"));
  try {
    const runId = "rid-buildho";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(path.join(out, "strategy"), { recursive: true });
    const cx = baseValidComplexity();
    const ai = baseValidAiStrategy();
    fs.writeFileSync(
      path.join(out, "strategy", "complexity-analysis.json"),
      JSON.stringify(cx, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(out, "strategy", "ai-strategy.json"),
      JSON.stringify(ai, null, 2),
      "utf-8",
    );
    writeExecutionStrategy(out);
    writeDecompositionBundle(out, runId, 1);
    fs.writeFileSync(
      path.join(out, "run-context.json"),
      JSON.stringify(
        {
          phase3: {
            status: "strategy_runtime_initialized",
            complexity: {
              status: "complexity_analysis_completed",
              overall: 5,
              classification: "moderate",
            },
            ai_strategy: {
              status: "ai_strategy_completed",
              recommended_mode: "standard",
            },
            decomposition: { status: "decomposition_completed", subtask_count: 1 },
            execution_order: {
              status: "execution_order_completed",
              ordering_mode: "linear",
              subtask_count: 1,
            },
            shared_context: {
              status: "shared_runtime_context_completed",
              artifact: "strategy/shared-runtime-context.json",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    finalizePhase36(out);
    finalizePhase37(out);
    const bh = buildExecutionReadyHandoff({ outputDirAbs: out });
    assert.strictEqual(bh.ok, true);
    const doc = /** @type {Record<string, unknown>} */ (bh.doc);
    assert.strictEqual(doc.status, HANDOFF_STATUS);
    assert.strictEqual(doc.execution_mode, "strategy_only");
    assert.deepStrictEqual(doc.subtasks, ["strategy/subtasks/001.json"]);
    const arts = /** @type {Record<string, unknown>} */ (doc.artifacts);
    assert.strictEqual(arts.strategy_readiness, "strategy/strategy-readiness.json");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
