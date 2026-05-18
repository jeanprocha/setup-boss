"use strict";

const fs = require("fs");
const path = require("path");

const { buildStrategyManifest } = require("./build-strategy-manifest");
const { validateStrategyArtifacts } = require("./validate-strategy-artifacts");
const { loadApprovalState } = require("../clarification/approval");
const { analyzeComplexity } = require("./analyze-complexity");
const { recommendAiStrategy } = require("./recommend-ai-strategy");
const { decomposeTask } = require("./decompose-task");
const { decomposeTaskMultiProject } = require("../../../core/decompose-task-multi-project");
const {
  loadWorkspaceStrategyContextFromPlanningRun,
} = require("../../../core/load-workspace-strategy-context-from-run");
const { buildExecutionOrder } = require("./build-execution-order");
const {
  buildSharedRuntimeContext,
  applySharedContextRefsToSubtasks,
  SHARED_RUNTIME_CONTEXT_REL,
} = require("./build-shared-runtime-context");
const {
  buildStrategyReadiness,
  STRATEGY_READINESS_REL,
  STRATEGY_READY_STATUS,
} = require("./build-strategy-readiness");
const {
  buildExecutionReadyHandoff,
  EXECUTION_READY_HANDOFF_REL,
  HANDOFF_STATUS,
  HANDOFF_PHASE,
} = require("./build-execution-ready-handoff");
const {
  buildOperationalExecutableStrategy,
  OPERATIONAL_EXECUTABLE_STRATEGY_REL,
} = require("../../../core/build-operational-executable-strategy");
const { resolvePlanVersionFromOutput } = require("../../../core/load-operational-executable-strategy");

const PHASE2_READY_FOR_EXECUTION = "ready_for_execution";
const PHASE3_STATUS = "strategy_runtime_initialized";
const COMPLEXITY_STATUS = "complexity_analysis_completed";
const AI_STRATEGY_STATUS = "ai_strategy_completed";
const DECOMPOSITION_STATUS = "decomposition_completed";
const EXECUTION_ORDER_STATUS = "execution_order_completed";
const SHARED_RUNTIME_CONTEXT_STATUS = "shared_runtime_context_completed";
const STRATEGY_SUBDIR = "strategy";
const STRATEGY_DIAGNOSTICS = "strategy-diagnostics.json";

/**
 * @param {string} fp
 * @returns {object|null}
 */
function readJsonObject(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} strategyDir
 * @param {string} runId
 * @param {object[]} events
 * @param {Record<string, unknown>} [extras]
 */
function writeStrategyDiagnostics(strategyDir, runId, events, extras) {
  const doc = {
    version: 1,
    run_id: runId,
    events,
  };
  if (extras && typeof extras === "object" && !Array.isArray(extras)) {
    for (const [k, v] of Object.entries(extras)) {
      doc[k] = v;
    }
  }
  fs.writeFileSync(
    path.join(strategyDir, STRATEGY_DIAGNOSTICS),
    JSON.stringify(doc, null, 2),
    "utf-8",
  );
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   runId?: string|null,
 *   force?: boolean,
 *   getWorkspaceRun?: (id: string) => object|null,
 *   resolveProject?: (id: string) => object|null,
 * }} p
 * @returns {{
 *   ok: true,
 *   skipped?: boolean,
 *   artifacts: string[],
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 * }}
 */
function runStrategyRuntimeBase(p) {
  const outputDirAbs = path.resolve(String(p.outputDirAbs || ""));
  const runId =
    p.runId != null && String(p.runId).trim() !== ""
      ? String(p.runId).trim()
      : path.basename(outputDirAbs);
  const force = Boolean(p.force);
  const onProgress =
    typeof p.onProgress === "function" ? p.onProgress : () => {};

  const rcPath = path.join(outputDirAbs, "run-context.json");
  const runContext = readJsonObject(rcPath);
  if (!runContext) {
    return {
      ok: false,
      error: {
        code: "STRATEGY_RUN_CONTEXT_MISSING",
        message: "run-context.json em falta ou inválido.",
      },
    };
  }

  const phase2 = runContext.phase2;
  if (!phase2 || typeof phase2 !== "object") {
    return {
      ok: false,
      error: {
        code: "STRATEGY_PHASE2_MISSING",
        message: "run-context.phase2 em falta.",
      },
    };
  }
  if (String(phase2.status || "") !== PHASE2_READY_FOR_EXECUTION) {
    return {
      ok: false,
      error: {
        code: "STRATEGY_PHASE2_NOT_READY",
        message: `Fase 3 exige phase2.status=${PHASE2_READY_FOR_EXECUTION}.`,
      },
    };
  }

  const appr = loadApprovalState(outputDirAbs);
  if (!appr.ok) {
    return {
      ok: false,
      error: {
        code: "STRATEGY_APPROVAL_NOT_APPROVED",
        message: "approval-state.json em falta ou ilegível.",
      },
    };
  }
  const apprDoc = /** @type {{ status?: string }} */ (appr.doc);
  if (String(apprDoc.status || "") !== "approved") {
    return {
      ok: false,
      error: {
        code: "STRATEGY_APPROVAL_NOT_APPROVED",
        message: "approval-state.json deve ter status 'approved' para a Fase 3.",
      },
    };
  }

  if (!force) {
    const phase3 = runContext.phase3;
    const val0 = validateStrategyArtifacts(outputDirAbs);
    if (
      val0.ok &&
      phase3 &&
      typeof phase3 === "object" &&
      (String(phase3.status || "") === PHASE3_STATUS ||
        String(phase3.status || "") === STRATEGY_READY_STATUS) &&
      phase3.complexity &&
      typeof phase3.complexity === "object" &&
      String(phase3.complexity.status || "") === COMPLEXITY_STATUS &&
      phase3.ai_strategy &&
      typeof phase3.ai_strategy === "object" &&
      String(phase3.ai_strategy.status || "") === AI_STRATEGY_STATUS &&
      phase3.decomposition &&
      typeof phase3.decomposition === "object" &&
      String(phase3.decomposition.status || "") === DECOMPOSITION_STATUS &&
      phase3.execution_order &&
      typeof phase3.execution_order === "object" &&
      String(phase3.execution_order.status || "") === EXECUTION_ORDER_STATUS &&
      phase3.shared_context &&
      typeof phase3.shared_context === "object" &&
      String(phase3.shared_context.status || "") === SHARED_RUNTIME_CONTEXT_STATUS &&
      String(phase3.shared_context.artifact || "") === SHARED_RUNTIME_CONTEXT_REL &&
      phase3.readiness &&
      typeof phase3.readiness === "object" &&
      String(phase3.readiness.status || "") === STRATEGY_READY_STATUS &&
      String(phase3.readiness.artifact || "") === STRATEGY_READINESS_REL &&
      phase3.handoff &&
      typeof phase3.handoff === "object" &&
      String(phase3.handoff.status || "") === HANDOFF_STATUS &&
      String(phase3.handoff.artifact || "") === EXECUTION_READY_HANDOFF_REL
    ) {
      return { ok: true, skipped: true, artifacts: [] };
    }
  }

  onProgress("strategy_plan_loaded", { runId });
  onProgress("strategy_context_prepared", { runId });

  const strategyDir = path.join(outputDirAbs, STRATEGY_SUBDIR);
  fs.mkdirSync(strategyDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const analysisStartedAt = new Date().toISOString();

  const ac = analyzeComplexity(outputDirAbs);
  if (!ac.ok) {
    const er =
      ac.error && typeof ac.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (ac.error)
        : { code: "COMPLEXITY_FAILED", message: "Falha desconhecida na análise." };
    return {
      ok: false,
      error: {
        code: String(er.code || "COMPLEXITY_FAILED"),
        message: String(er.message || "Falha na análise de complexidade."),
      },
    };
  }
  const complexityDoc = /** @type {Record<string, unknown>} */ (ac.doc);
  fs.writeFileSync(
    path.join(strategyDir, "complexity-analysis.json"),
    JSON.stringify(complexityDoc, null, 2),
    "utf-8",
  );

  const analysisCompletedAt = new Date().toISOString();
  const aiStrategyStartedAt = new Date().toISOString();
  onProgress("strategy_llm_started", { runId, step: "ai_strategy" });

  const rec = recommendAiStrategy(outputDirAbs, complexityDoc);
  if (!rec.ok) {
    const er =
      rec.error && typeof rec.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (rec.error)
        : { code: "AI_STRATEGY_FAILED", message: "Falha na recomendação IA." };
    return {
      ok: false,
      error: {
        code: String(er.code || "AI_STRATEGY_FAILED"),
        message: String(er.message || "Falha na recomendação de estratégia IA."),
      },
    };
  }
  const aiDoc = /** @type {Record<string, unknown>} */ (rec.doc);
  fs.writeFileSync(
    path.join(strategyDir, "ai-strategy.json"),
    JSON.stringify(aiDoc, null, 2),
    "utf-8",
  );

  const aiStrategyCompletedAt = new Date().toISOString();
  onProgress("strategy_llm_completed", { runId, step: "ai_strategy" });

  const decompositionStartedAt = new Date().toISOString();
  onProgress("strategy_decomposition_started", { runId });

  let workspaceContext = null;
  if (typeof p.getWorkspaceRun === "function") {
    const wsLoad = loadWorkspaceStrategyContextFromPlanningRun(outputDirAbs, {
      getWorkspaceRun: p.getWorkspaceRun,
      resolveProject: p.resolveProject,
    });
    if (wsLoad.ok) {
      workspaceContext = wsLoad;
      onProgress("strategy_workspace_context_loaded", {
        runId,
        workspaceRunId: wsLoad.workspaceRunId,
        projectCount: wsLoad.catalog.length,
      });
    }
  }

  const deco = workspaceContext?.multiRepo
    ? decomposeTaskMultiProject({
        outputDirAbs,
        complexityDoc,
        aiDoc,
        workspaceContext,
      })
    : decomposeTask({
        outputDirAbs,
        complexityDoc,
        aiDoc,
      });
  if (!deco.ok) {
    const er =
      deco.error && typeof deco.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (deco.error)
        : { code: "DECOMPOSITION_FAILED", message: "Falha na decomposição." };
    return {
      ok: false,
      error: {
        code: String(er.code || "DECOMPOSITION_FAILED"),
        message: String(er.message || "Falha na decomposição."),
      },
    };
  }
  const decompositionDoc = /** @type {Record<string, unknown>} */ (deco.decomposition);
  const subtaskFiles = deco.subtaskFiles;
  const decompositionCompletedAt = new Date().toISOString();

  const subtasksDir = path.join(strategyDir, "subtasks");
  fs.mkdirSync(subtasksDir, { recursive: true });
  try {
    for (const ent of fs.readdirSync(subtasksDir)) {
      if (ent.toLowerCase().endsWith(".json")) {
        fs.unlinkSync(path.join(subtasksDir, ent));
      }
    }
  } catch {
    /* ignore */
  }
  for (const sf of subtaskFiles) {
    fs.writeFileSync(
      path.join(strategyDir, "subtasks", `${sf.id}.json`),
      JSON.stringify(sf.doc, null, 2),
      "utf-8",
    );
  }
  fs.writeFileSync(
    path.join(strategyDir, "decomposition.json"),
    JSON.stringify(decompositionDoc, null, 2),
    "utf-8",
  );

  const executionOrderStartedAt = new Date().toISOString();
  const ord = buildExecutionOrder({ strategyDir });
  if (!ord.ok) {
    const er =
      ord.error && typeof ord.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (ord.error)
        : { code: "EXECUTION_ORDER_FAILED", message: "Falha na ordenação." };
    return {
      ok: false,
      error: {
        code: String(er.code || "EXECUTION_ORDER_FAILED"),
        message: String(er.message || "Falha ao gerar execution-order.json."),
      },
    };
  }
  const executionOrderDoc = /** @type {Record<string, unknown>} */ (ord.doc);
  const executionOrderCompletedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(strategyDir, "execution-order.json"),
    JSON.stringify(executionOrderDoc, null, 2),
    "utf-8",
  );

  const sharedRuntimeStartedAt = new Date().toISOString();
  const shr = buildSharedRuntimeContext({ outputDirAbs });
  if (!shr.ok) {
    const er =
      shr.error && typeof shr.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (shr.error)
        : { code: "SHARED_RUNTIME_CONTEXT_FAILED", message: "Falha no contexto partilhado." };
    return {
      ok: false,
      error: {
        code: String(er.code || "SHARED_RUNTIME_CONTEXT_FAILED"),
        message: String(er.message || "Falha ao gerar shared-runtime-context.json."),
      },
    };
  }
  const sharedRuntimeDoc = /** @type {Record<string, unknown>} */ (shr.doc);
  fs.writeFileSync(
    path.join(strategyDir, "shared-runtime-context.json"),
    JSON.stringify(sharedRuntimeDoc, null, 2),
    "utf-8",
  );
  const apRefs = applySharedContextRefsToSubtasks({ strategyDir });
  if (!apRefs.ok) {
    const er =
      apRefs.error && typeof apRefs.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (apRefs.error)
        : { code: "SHARED_CONTEXT_REFS_FAILED", message: "Falha ao atualizar subtasks." };
    return {
      ok: false,
      error: {
        code: String(er.code || "SHARED_CONTEXT_REFS_FAILED"),
        message: String(er.message || "Falha ao aplicar shared_context_refs."),
      },
    };
  }
  const sharedRuntimeCompletedAt = new Date().toISOString();

  const planVersionForOes = resolvePlanVersionFromOutput(outputDirAbs);
  const oesBuild = buildOperationalExecutableStrategy({
    outputDirAbs,
    runId,
    planVersion: planVersionForOes,
    sourcePlanVersion: planVersionForOes,
    write: true,
    workspaceContext: workspaceContext?.ok ? workspaceContext : null,
  });
  /** @type {string[]} */
  const oesWarnings = [];
  if (!oesBuild.ok) {
    oesWarnings.push(
      oesBuild.error && oesBuild.error.message
        ? String(oesBuild.error.message)
        : "Falha ao gerar operational-executable-strategy.json (não bloqueante).",
    );
  } else if (oesBuild.degraded) {
    oesWarnings.push("OES gerado em modo degradado.");
  }
  const operationalExecutableStrategyCompletedAt = new Date().toISOString();

  const executionStrategyPre = {
    version: 1,
    strategy_status: "initialized",
    execution_mode: "preparation_only",
    decomposition_ready: true,
    ordering_ready: true,
    ai_strategy_ready: true,
    complexity_analysis_ready: true,
    shared_context_ready: true,
    strategy_ready: false,
    handoff_ready: false,
  };
  fs.writeFileSync(
    path.join(strategyDir, "execution-strategy.json"),
    JSON.stringify(executionStrategyPre, null, 2),
    "utf-8",
  );

  const strategyArtifactsPre = [
    "strategy/execution-strategy.json",
    "strategy/complexity-analysis.json",
    "strategy/ai-strategy.json",
    "strategy/decomposition.json",
    "strategy/execution-order.json",
    SHARED_RUNTIME_CONTEXT_REL,
    ...(oesBuild.ok ? [OPERATIONAL_EXECUTABLE_STRATEGY_REL] : []),
    ...subtaskFiles.map((sf) => sf.relPath),
  ];
  const manifestPre = buildStrategyManifest({
    runId,
    createdAt: startedAt,
    phase: "3.6",
    status: SHARED_RUNTIME_CONTEXT_STATUS,
    strategyArtifacts: strategyArtifactsPre,
  });
  fs.writeFileSync(
    path.join(strategyDir, "strategy-manifest.json"),
    JSON.stringify(manifestPre, null, 2),
    "utf-8",
  );

  const scores = /** @type {{ overall?: number }} */ (complexityDoc.scores || {});
  const recommendedMode = String(aiDoc.recommended_mode || "");
  const subtaskCount = subtaskFiles.length;
  const phase3Base = {
    status: PHASE3_STATUS,
    complexity: {
      status: COMPLEXITY_STATUS,
      overall: Number(scores.overall),
      classification: String(complexityDoc.classification || ""),
    },
    ai_strategy: {
      status: AI_STRATEGY_STATUS,
      recommended_mode: recommendedMode,
    },
    decomposition: {
      status: DECOMPOSITION_STATUS,
      subtask_count: subtaskCount,
    },
    execution_order: {
      status: EXECUTION_ORDER_STATUS,
      ordering_mode: "linear",
      subtask_count: subtaskCount,
    },
    shared_context: {
      status: SHARED_RUNTIME_CONTEXT_STATUS,
      artifact: SHARED_RUNTIME_CONTEXT_REL,
    },
  };
  fs.writeFileSync(
    rcPath,
    JSON.stringify(
      {
        ...runContext,
        phase3: phase3Base,
      },
      null,
      2,
    ),
    "utf-8",
  );

  onProgress("strategy_artifacts_written", { runId, subtaskCount });
  const validationStartedAt = new Date().toISOString();
  const br = buildStrategyReadiness({ outputDirAbs });
  if (!br.ok) {
    const er =
      br.error && typeof br.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (br.error)
        : { code: "STRATEGY_READINESS_BUILD", message: "Falha ao construir readiness." };
    return {
      ok: false,
      error: {
        code: String(er.code || "STRATEGY_READINESS_BUILD"),
        message: String(er.message || "Falha ao gerar strategy-readiness.json."),
      },
    };
  }
  const readinessDoc = /** @type {Record<string, unknown>} */ (br.doc);
  fs.writeFileSync(
    path.join(strategyDir, "strategy-readiness.json"),
    JSON.stringify(readinessDoc, null, 2),
    "utf-8",
  );
  const validationCompletedAt = new Date().toISOString();

  const valObj = readinessDoc.validation;
  const valid =
    valObj &&
    typeof valObj === "object" &&
    !Array.isArray(valObj) &&
    /** @type {Record<string, unknown>} */ (valObj).valid === true;
  if (!valid) {
    const errs =
      valObj && typeof valObj === "object" && !Array.isArray(valObj) && Array.isArray(/** @type {Record<string, unknown>} */ (valObj).errors)
        ? /** @type {string[]} */ (/** @type {Record<string, unknown>} */ (valObj).errors).filter((x) => typeof x === "string")
        : [];
    return {
      ok: false,
      error: {
        code: "STRATEGY_READINESS_INVALID",
        message: errs.length ? errs.join(" ") : "strategy-readiness.validation.valid é false.",
      },
    };
  }

  const strategyReadyAt = new Date().toISOString();

  const handoffStartedAt = new Date().toISOString();
  const bh = buildExecutionReadyHandoff({ outputDirAbs });
  if (!bh.ok) {
    const er =
      bh.error && typeof bh.error === "object"
        ? /** @type {{ code?: string, message?: string }} */ (bh.error)
        : { code: "HANDOFF_BUILD", message: "Falha no handoff." };
    return {
      ok: false,
      error: {
        code: String(er.code || "HANDOFF_BUILD"),
        message: String(er.message || "Falha ao gerar execution-ready-handoff.json."),
      },
    };
  }
  const handoffDoc = /** @type {Record<string, unknown>} */ (bh.doc);
  fs.writeFileSync(
    path.join(strategyDir, "execution-ready-handoff.json"),
    JSON.stringify(handoffDoc, null, 2),
    "utf-8",
  );
  const handoffCompletedAt = new Date().toISOString();

  const executionStrategyFinal = {
    ...executionStrategyPre,
    strategy_ready: true,
    handoff_ready: true,
  };
  fs.writeFileSync(
    path.join(strategyDir, "execution-strategy.json"),
    JSON.stringify(executionStrategyFinal, null, 2),
    "utf-8",
  );

  const strategyArtifactsFinal = [...strategyArtifactsPre, STRATEGY_READINESS_REL, EXECUTION_READY_HANDOFF_REL];
  const manifestFinal = buildStrategyManifest({
    runId,
    createdAt: startedAt,
    phase: HANDOFF_PHASE,
    status: HANDOFF_STATUS,
    strategyArtifacts: strategyArtifactsFinal,
  });
  fs.writeFileSync(
    path.join(strategyDir, "strategy-manifest.json"),
    JSON.stringify(manifestFinal, null, 2),
    "utf-8",
  );

  const nextRc = {
    ...runContext,
    phase3: {
      ...phase3Base,
      status: STRATEGY_READY_STATUS,
      readiness: {
        status: STRATEGY_READY_STATUS,
        artifact: STRATEGY_READINESS_REL,
      },
      handoff: {
        status: HANDOFF_STATUS,
        artifact: EXECUTION_READY_HANDOFF_REL,
      },
    },
  };
  fs.writeFileSync(rcPath, JSON.stringify(nextRc, null, 2), "utf-8");

  const val = validateStrategyArtifacts(outputDirAbs);
  if (!val.ok) {
    return {
      ok: false,
      error: {
        code: "STRATEGY_VALIDATION_FAILED",
        message: val.errors.join(" "),
      },
    };
  }

  const completedAt = new Date().toISOString();
  const genArtifacts = [
    "strategy/strategy-manifest.json",
    "strategy/execution-strategy.json",
    "strategy/complexity-analysis.json",
    "strategy/ai-strategy.json",
    "strategy/decomposition.json",
    "strategy/execution-order.json",
    SHARED_RUNTIME_CONTEXT_REL,
    ...(oesBuild.ok ? [OPERATIONAL_EXECUTABLE_STRATEGY_REL] : []),
    STRATEGY_READINESS_REL,
    EXECUTION_READY_HANDOFF_REL,
    ...subtaskFiles.map((sf) => sf.relPath),
  ];
  const sum = /** @type {Record<string, unknown>} */ (readinessDoc.summary || {});
  const valBlock = /** @type {Record<string, unknown>} */ (readinessDoc.validation || {});
  const warns = Array.isArray(valBlock.warnings) ? valBlock.warnings : [];
  const diagSummary = {
    summary: {
      total_subtasks: Number(sum.subtask_count),
      complexity_classification: String(sum.complexity || ""),
      ai_mode: String(sum.ai_mode || ""),
      warnings_count: warns.filter((w) => typeof w === "string").length,
      readiness_status: String(readinessDoc.status || STRATEGY_READY_STATUS),
    },
    handoff_ready: true,
    final_phase: HANDOFF_PHASE,
    total_artifacts: genArtifacts.length,
    total_subtasks: subtaskCount,
  };
  writeStrategyDiagnostics(strategyDir, runId, [
    { event: "strategy_runtime_started", recorded_at: startedAt },
    { event: "complexity_analysis_started", recorded_at: analysisStartedAt },
    { event: "complexity_analysis_completed", recorded_at: analysisCompletedAt },
    { event: "ai_strategy_started", recorded_at: aiStrategyStartedAt },
    { event: "ai_strategy_completed", recorded_at: aiStrategyCompletedAt },
    { event: "decomposition_started", recorded_at: decompositionStartedAt },
    { event: "decomposition_completed", recorded_at: decompositionCompletedAt },
    {
      event: "subtasks_generated",
      recorded_at: decompositionCompletedAt,
      subtask_count: subtaskCount,
    },
    { event: "execution_order_started", recorded_at: executionOrderStartedAt },
    { event: "execution_order_completed", recorded_at: executionOrderCompletedAt },
    { event: "shared_runtime_context_started", recorded_at: sharedRuntimeStartedAt },
    { event: "shared_runtime_context_completed", recorded_at: sharedRuntimeCompletedAt },
    {
      event: "operational_executable_strategy_completed",
      recorded_at: operationalExecutableStrategyCompletedAt,
      degraded: Boolean(oesBuild.degraded),
      warnings: oesWarnings,
    },
    { event: "strategy_validation_started", recorded_at: validationStartedAt },
    { event: "strategy_validation_completed", recorded_at: validationCompletedAt },
    { event: "strategy_ready", recorded_at: strategyReadyAt },
    { event: "execution_ready_handoff_started", recorded_at: handoffStartedAt },
    { event: "execution_ready_handoff_completed", recorded_at: handoffCompletedAt },
    { event: "strategy_runtime_completed", recorded_at: completedAt },
    {
      event: "strategy_artifacts_generated",
      recorded_at: completedAt,
      artifacts: genArtifacts,
    },
  ], diagSummary);

  return {
    ok: true,
    artifacts: [
      ...genArtifacts,
      `strategy/${STRATEGY_DIAGNOSTICS}`,
      "run-context.json",
    ],
  };
}

module.exports = {
  runStrategyRuntimeBase,
  PHASE3_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  DECOMPOSITION_STATUS,
  EXECUTION_ORDER_STATUS,
  SHARED_RUNTIME_CONTEXT_STATUS,
  SHARED_RUNTIME_CONTEXT_REL,
  STRATEGY_READINESS_REL,
  STRATEGY_READY_STATUS,
  EXECUTION_READY_HANDOFF_REL,
  HANDOFF_STATUS,
  HANDOFF_PHASE,
};
