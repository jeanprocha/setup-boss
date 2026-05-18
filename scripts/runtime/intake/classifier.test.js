"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  classifyIntake,
  classificationPhaseForRunContext,
} = require("./classifier");

function baseDiscovery(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task: { source: "inline", length: 120, preview: "x" },
    discovery_signals: {
      complexity_hint: "low",
      scope_hint: "small",
      risk_hint: "low",
      needs_context_signals: [],
      blocked_signals: [],
    },
    ia_context: { status: "ok", files_found: [], files_missing: [], total_chars: 5000 },
    ...overrides,
  };
}

function baseIaSummary(overrides = {}) {
  return {
    status: "ok",
    files_missing: [],
    total_chars: 5000,
    index_found: true,
    files_found: 6,
    ...overrides,
  };
}

test("ready_for_clarification com IA ok e LLM completed", () => {
  const r = classifyIntake({
    iaContextSummary: baseIaSummary(),
    discoveryAnalysis: baseDiscovery(),
    llmPhase: { status: "completed" },
    taskDiscoveryText: "## Gaps de Contexto\nNenhum.\n",
  });
  assert.strictEqual(r.classification, "ready_for_clarification");
  assert.strictEqual(r.confidence, "high");
  assert.ok(r.signals.some((s) => s.startsWith("ready:")));
});

test("needs_context com IA partial", () => {
  const r = classifyIntake({
    iaContextSummary: baseIaSummary({
      status: "partial",
      files_missing: ["01-architecture.md"],
    }),
    discoveryAnalysis: baseDiscovery({
      ia_context: { status: "partial", files_found: [], files_missing: ["01-architecture.md"], total_chars: 100 },
      discovery_signals: {
        complexity_hint: "low",
        scope_hint: "small",
        risk_hint: "low",
        needs_context_signals: ["ia_missing_required_files"],
        blocked_signals: [],
      },
    }),
    llmPhase: { status: "completed" },
    taskDiscoveryText: "",
  });
  assert.strictEqual(r.classification, "needs_context");
  assert.ok(r.missing_definitions.some((m) => m.includes("ia_file")));
});

test("needs_context com LLM skipped", () => {
  const r = classifyIntake({
    iaContextSummary: baseIaSummary(),
    discoveryAnalysis: baseDiscovery(),
    llmPhase: { status: "skipped" },
    taskDiscoveryText: "",
  });
  assert.strictEqual(r.classification, "needs_context");
  assert.ok(r.signals.includes("needs_context:llm_skipped"));
});

test("blocked com blocked_signals", () => {
  const r = classifyIntake({
    iaContextSummary: baseIaSummary(),
    discoveryAnalysis: baseDiscovery({
      discovery_signals: {
        complexity_hint: "low",
        scope_hint: "small",
        risk_hint: "high",
        needs_context_signals: [],
        blocked_signals: ["operational_severity_critical"],
      },
    }),
    llmPhase: { status: "completed" },
    taskDiscoveryText: "",
  });
  assert.strictEqual(r.classification, "blocked");
});

test("blocked com falha de contrato LLM (parser)", () => {
  const r = classifyIntake({
    iaContextSummary: baseIaSummary(),
    discoveryAnalysis: baseDiscovery(),
    llmPhase: {
      status: "failed",
      error: { code: "INTAKE_LLM_PARSE_MISSING_MARKERS", message: "x" },
    },
    taskDiscoveryText: "",
  });
  assert.strictEqual(r.classification, "blocked");
  assert.ok(r.signals.some((s) => s.includes("INTAKE_LLM_PARSE")));
});

test("classificationPhaseForRunContext inclui artifact", () => {
  const p = classificationPhaseForRunContext(
    {
      classification: "needs_context",
      reason: "r",
      missing_definitions: [],
      signals: [],
      confidence: "medium",
    },
    "intake-classification.json",
  );
  assert.strictEqual(p.status, "completed");
  assert.strictEqual(p.artifact, "intake-classification.json");
  assert.strictEqual(p.value, "needs_context");
});

test("classifyIntake não exige texto IA completo (só resumo)", () => {
  const secret = "FULL_IA_DUMP_SHOULD_NOT_BE_REQUIRED";
  const r = classifyIntake({
    iaContextSummary: baseIaSummary({ total_chars: 9000 }),
    discoveryAnalysis: baseDiscovery(),
    llmPhase: { status: "completed" },
    taskDiscoveryText: `## Entendimento\nok\n## Gaps de Contexto\nNada.\n`,
  });
  assert.strictEqual(r.classification, "ready_for_clarification");
  assert.ok(!JSON.stringify(r).includes(secret));
});

test("needs_context quando task-discovery indica gaps relevantes", () => {
  const text = `## Gaps de Contexto
- Falta especificar o módulo alvo e o critério de rollback.
## Ambiguidades Identificadas
- Nenhuma após clarificação dos gaps.
`;
  const r = classifyIntake({
    iaContextSummary: baseIaSummary(),
    discoveryAnalysis: baseDiscovery(),
    llmPhase: { status: "completed" },
    taskDiscoveryText: text,
  });
  assert.strictEqual(r.classification, "needs_context");
  assert.ok(r.signals.includes("needs_context:task_discovery_gaps_or_ambiguity"));
});
