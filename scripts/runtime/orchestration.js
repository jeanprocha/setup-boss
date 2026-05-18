/**
 * Orquestração in-process do pipeline (Fase 2.2).
 * startFlow é a função principal; run.js apenas faz parse de CLI e chama aqui.
 */

const fs = require("fs");
const path = require("path");
const RunLogger = require("../logger");
const { appendProblemHistoryEntry } = require("../../core/problem-history");
const { getRunId, writeRunIndex } = require("../../core/run-resolver");
const { validateTask } = require("../shared-utils");
const { enrichIAAfterApprovedRun } = require("../ensure-ia");
const { tryGitCommitAfterApprovedRun } = require("../../core/git-approved-run-commit");
const { tryGitPushAfterApprovedCommit } = require("../../core/git-approved-run-push");
const { tryGitPrAfterApprovedPush } = require("../../core/git-approved-run-pr");
const {
  resolveProjectIaDir,
  resolveProjectIaOutputsDir,
  resolveProjectIaOutputDir,
  isInsideProjectIaOutputs,
} = require("../shared/ia-path-resolver");
const { createRuntimeContext, REPO_ROOT } = require("./runtime-context");
const { runArchitect } = require("../architect");
const { runExecutor } = require("../executor");
const { runReview } = require("../review");
const { runCorrection } = require("../correction");
const { evaluateCorrectionRetrySuppressionGate } = require("../correction-runtime/correction-pipeline");
const { runKnowledge } = require("../knowledge");
const {
  computeScanCacheFingerprint,
  resolveScanCacheFilePath,
} = require("./scan-cache");
const { writeRunMetricsFromRun } = require("./prompt-metrics");
const { writePatchPreviewArtifact } = require("./patch-preview");
const { executePreflightPhase } = require("./preflight/run-phase");
const { writePreflightAccuracy } = require("./preflight/accuracy");
const { RUNTIME_LIFECYCLE } = require("./replay/lifecycle");
const { appendCheckpoint } = require("./replay/checkpoint-manager");
const {
  buildPatchManifest,
  writePatchManifestToOutput,
} = require("./replay/patch-manifest");
const { runExecutorWithRecovery } = require("./recovery/executor-recovery-loop");
const {
  readEffectiveMaxCorrectionFromPreflightArtifacts,
  appendResumeGovernanceAudit,
} = require("./governance/policy-engine");
const { applyCliGovernanceToProcessEnv } = require("./governance/policy-loader");
const { RuntimeTerminalError } = require("./runtime-errors");
const {
  validateProjectKnowledgeBase,
} = require("../../core/validate-project-knowledge-base");
const { emitBridge } = require("./runtime-event-bridge");
const {
  runGovernanceRuntimeHook,
  GOVERNANCE_HOOK_PHASE,
} = require("./governance/governance-runtime-hook");
const {
  runShadowExecutionPlanAfterArchitect,
  runShadowPlanReconciliationAfterExecutor,
  syncShadowPlanExecutorLifecycle,
  syncShadowPlanPipelineApprovedFinish,
  syncShadowPlanPipelineBlocked,
  syncShadowPlanPipelinePartialFailure,
  runShadowValidationTargetingAfterArchitect,
  runShadowValidationTargetingAfterReconciliation,
} = require("../execution-plan");

const {
  bootstrapTransactionRuntime,
  recordTransactionalCheckpoint,
  finalizeTransactionalRun,
  finalizeTransactionalFailure,
} = require("../transaction-runtime/checkpoint-engine");

const ROOT_DIR = REPO_ROOT;

function finalizeTxnSafe(outputDir, runId, pipeStatus) {
  try {
    finalizeTransactionalRun(outputDir, runId, { pipeline: pipeStatus });
  } catch (_) {
    /* nunca interferir com fluxo legacy */
  }
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function logStepStart(name, action, description) {
  console.log(`\n▶ ${name} → ${action}`);
  if (description) console.log(`   ${description}`);
  return Date.now();
}

function logStepEnd(name, startedAt) {
  const duration = Date.now() - startedAt;
  console.log(`⏱ ${name} finalizado em ${formatDuration(duration)}`);
}

function summarizeReviewIssues(review) {
  const issues = [];
  if (Array.isArray(review.blocking_issues)) issues.push(...review.blocking_issues);
  if (Array.isArray(review.warnings)) issues.push(...review.warnings);
  if (issues.length === 0) {
    return review.summary || "Review solicitou correção sem detalhes.";
  }
  return issues[0];
}

const SOURCE_OF_TRUTH = {
  globalContextDir: path.join(ROOT_DIR, "context"),
  operationalDocsDir: path.join(ROOT_DIR, "docs"),
  systemDir: path.join(ROOT_DIR, ".setup-boss"),
  projectSetupDirName: ".setup-boss",
};

const CACHE_DIR = path.join(SOURCE_OF_TRUTH.systemDir, "cache");

const MAX_CORRECTIONS = Number(process.env.MAX_CORRECTIONS || 3);
const MAX_TOTAL_STEPS = Number(process.env.MAX_TOTAL_STEPS || 20);
const ENABLE_SCAN_CACHE = process.env.ENABLE_SCAN_CACHE !== "false";
const SCAN_CACHE_TTL_MS = Number(
  process.env.SCAN_CACHE_TTL_MS || 1000 * 60 * 10
);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveProjectRoot(projectArg) {
  return path.resolve(ROOT_DIR, projectArg);
}

function getProjectIADir(projectArg) {
  return resolveProjectIaDir(resolveProjectRoot(projectArg)).iaDir;
}

function getProjectOutputsDir(projectArg) {
  return resolveProjectIaOutputsDir(resolveProjectRoot(projectArg));
}

function getOutputDirForProject(projectArg, runId) {
  return resolveProjectIaOutputDir(resolveProjectRoot(projectArg), runId);
}

function generatedArtifactRelPath(logger, fileRelToOutputDir) {
  const projectRoot = resolveProjectRoot(logger.project);
  const abs = path.resolve(logger.outputDir, fileRelToOutputDir);
  return path.relative(projectRoot, abs).replace(/\\/g, "/");
}

function isFreshCache(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  return Date.now() - stats.mtimeMs <= SCAN_CACHE_TTL_MS;
}

function copyCachedScanToOutput(cachePath, outputDir) {
  const scanOutputPath = path.join(outputDir, "scan-output.md");
  if (fs.existsSync(cachePath)) {
    fs.copyFileSync(cachePath, scanOutputPath);
    return true;
  }
  return false;
}

function saveScanToCache(outputDir, cachePath) {
  const scanOutputPath = path.join(outputDir, "scan-output.md");
  if (fs.existsSync(scanOutputPath)) {
    fs.copyFileSync(scanOutputPath, cachePath);
    return true;
  }
  return false;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function mergeExecutionIntoMetadata(outputDir, executionPatch, cache) {
  const p = path.join(outputDir, "metadata.json");
  if (!fs.existsSync(p)) return;
  let meta;
  try {
    meta = readJson(p);
  } catch (_) {
    return;
  }
  meta.execution = {
    ...(meta.execution || {}),
    ...executionPatch,
  };
  fs.writeFileSync(p, JSON.stringify(meta, null, 2), "utf-8");
  if (cache && typeof cache.invalidate === "function") {
    cache.invalidate(p);
  }
}

function persistVirtualOverlayArtifact(outputDir, overlay, dryRun, cache) {
  if (!dryRun || !overlay || typeof overlay !== "object") return;
  const keys = Object.keys(overlay);
  if (!keys.length) return;
  const payload = {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    note:
      "Overlay UTF-8 virtual pós-patch (dry-run). Keys são paths relativos ao projectRoot em metadata.json.",
    paths: overlay,
  };
  const target = path.join(outputDir, "virtual-project-overlay.json");
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf-8");
  if (cache && typeof cache.invalidate === "function") {
    cache.invalidate(target);
  }
}

function applyBaselineMetricsSnapshot(
  logger,
  pipelineMetricsAccumulator,
  ctx = null,
) {
  if (!logger || !pipelineMetricsAccumulator || !logger.outputDir) return;

  const outputDir = logger.outputDir;
  const payload = {
    preflight_task_validation_ms:
      pipelineMetricsAccumulator.preflight_task_validation_ms ?? null,
    preflight_analysis_ms:
      pipelineMetricsAccumulator.preflight_analysis_ms ?? null,
    child_spawns: Array.isArray(pipelineMetricsAccumulator.child_spawns)
      ? pipelineMetricsAccumulator.child_spawns
      : [],
    correction_iterations_snapshot: logger.data.correction_iterations,
    generated_files_count: Array.isArray(logger.data.generated_files)
      ? logger.data.generated_files.length
      : 0,
    finalized_at: new Date().toISOString(),
  };

  try {
    const promptPath = path.join(outputDir, "prompt-sizes.json");
    if (fs.existsSync(promptPath)) {
      payload.prompt_sizes_by_step = readJson(promptPath);
    }
  } catch (_) {
    /* baseline only */
  }

  try {
    const metaPath = path.join(outputDir, "metadata.json");
    if (fs.existsSync(metaPath)) {
      const meta = readJson(metaPath);
      if (meta.llm_usage_total) payload.llm_usage_total = meta.llm_usage_total;
    }
  } catch (_) {
    /* baseline only */
  }

  try {
    const chPath = path.join(outputDir, "executor-changes.json");
    if (fs.existsSync(chPath)) {
      const raw = readJson(chPath);
      payload.executor_changes_applied_count = Array.isArray(raw)
        ? raw.length
        : null;
    }
  } catch (_) {
    /* baseline only */
  }

  logger.setPipelineMetricsBaseline(payload);

  try {
    writeRunMetricsFromRun(logger.outputDir, {
      telemetryCounts:
        ctx && ctx.telemetry && typeof ctx.telemetry.getCounts === "function"
          ? ctx.telemetry.getCounts()
          : {},
      executorSnippetEconomics:
        ctx && ctx.state ? ctx.state.executor_snippet_economics : null,
      scanCache: logger.data.cache || null,
      correctionLoop:
        logger.data && typeof logger.data.correction_iterations === "number"
          ? { iterations: logger.data.correction_iterations }
          : null,
      recoverySummary:
        ctx && ctx.state && ctx.state.recovery_summary
          ? ctx.state.recovery_summary
          : null,
      baselineTotalChars: (() => {
        const raw = process.env.RUN_METRICS_PROMPT_BASELINE_CHARS;
        if (raw === undefined || raw === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      })(),
    });
  } catch (_) {
    /* opcional */
  }

  try {
    writePreflightAccuracy(outputDir);
    const accPath = path.join(outputDir, "preflight-accuracy.json");
    if (fs.existsSync(accPath)) {
      logger.addGeneratedFile({
        path: generatedArtifactRelPath(logger, "preflight-accuracy.json"),
        type: "preflight_accuracy",
      });
    }
  } catch (_) {
    /* opcional */
  }
}

function tryReadInvalidTaskValidation(outputDir) {
  if (!outputDir) return null;
  const p = path.join(outputDir, "architect-validation.json");
  if (!fs.existsSync(p)) return null;
  try {
    const v = readJson(p);
    if (v && v.invalid_task === true) return v;
  } catch (_) {
    return null;
  }
  return null;
}

function assertExecutorResultSuccess(outputDir, cache) {
  const resultPath = path.join(outputDir, "executor-result.json");
  const exists = cache ? cache.existsSync(resultPath) : fs.existsSync(resultPath);
  if (!exists) {
    throw new Error(
      `executor-result.json não encontrado em ${resultPath}. O executor não registrou resultado lógico da etapa.`
    );
  }
  let result;
  try {
    result = cache ? cache.readJsonSync(resultPath) : readJson(resultPath);
  } catch (err) {
    const detail = err && err.message ? err.message : String(err || "");
    throw new Error(
      `executor-result.json inválido (JSON) em ${resultPath}: ${detail}`
    );
  }
  if (!result || result.status !== "success") {
    const status =
      result && result.status != null ? String(result.status) : "(ausente)";
    const blockedReason =
      result && result.blocked_reason != null
        ? String(result.blocked_reason)
        : "";
    const summary =
      result && result.summary != null ? String(result.summary) : "";
    const parts = [`Executor não concluiu com sucesso (status: ${status}).`];
    if (blockedReason) parts.push(`blocked_reason: ${blockedReason}`);
    if (summary) parts.push(`summary: ${summary}`);
    throw new Error(parts.join(" "));
  }
}

function readRunLog(outputDir) {
  const logPath = path.join(outputDir, "run-log.json");
  if (!fs.existsSync(logPath)) return null;
  return readJson(logPath);
}

function assertOutputInsideProjectIA(projectRoot, outputDir) {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(outputDir);
  if (!isInsideProjectIaOutputs(root, resolved)) {
    throw new Error(
      "Output fora das pastas docs/.IA/outputs ou .IA/outputs (legado) do projeto.",
    );
  }
}

function assertFlowLimits(logger, outputDir) {
  const log = readRunLog(outputDir);
  if (!log) return;
  const stepsCount = Array.isArray(log.steps) ? log.steps.length : 0;
  if (stepsCount >= MAX_TOTAL_STEPS) {
    logger.addWarning("Limite máximo de etapas atingido.", {
      steps: stepsCount,
      max_total_steps: MAX_TOTAL_STEPS,
    });
    throw new Error(`MAX_TOTAL_STEPS excedido: ${stepsCount}/${MAX_TOTAL_STEPS}`);
  }
}

function addGeneratedFile(logger, runId, relativeFilePath, type) {
  void runId;
  const normalizedPath = generatedArtifactRelPath(logger, relativeFilePath);
  try {
    logger.addGeneratedFile({ path: normalizedPath, type });
  } catch {
    logger.addGeneratedFile(normalizedPath);
  }
}

async function runExecutorStep(ctx, logger, runId, orchestration = {}) {
  assertFlowLimits(logger, logger.outputDir);
  const dryRun = orchestration.dryRun === true;

  mergeExecutionIntoMetadata(
    logger.outputDir,
    { lifecycle_state: RUNTIME_LIFECYCLE.EXECUTING },
    ctx.cache,
  );

  syncShadowPlanExecutorLifecycle({
    ctx,
    outputDir: logger.outputDir,
    runId,
    phase: "executing",
  });

  const startedAt = logStepStart(
    "Executor",
    dryRun ? "simulando patches (dry-run)" : "aplicando alterações",
    dryRun
      ? "Patches válidos em memória + overlay virtual — disco do projeto intacto."
      : "Lendo arquivos permitidos e aplicando mudanças no projeto.",
  );
  logger.startStep("executor");
  ctx.telemetry.stepStart("pipeline.executor");
  emitBridge("phase_started", {
    jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
    runId,
    data: { phase: "executor" },
  });
  const projectOutputsForRecovery = getProjectOutputsDir(ctx.projectArg);
  try {
    await runExecutorWithRecovery({
      ctx,
      outputDir: logger.outputDir,
      runId,
      runExecutor,
      projectOutputsDir: projectOutputsForRecovery,
      onLifecyclePatch: (patch) =>
        mergeExecutionIntoMetadata(logger.outputDir, patch, ctx.cache),
    });
  } catch (err) {
    syncShadowPlanExecutorLifecycle({
      ctx,
      outputDir: logger.outputDir,
      runId,
      phase: "failed",
    });
    emitBridge("phase_failed", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "executor" },
    });
    throw err;
  }
  ctx.telemetry.stepEnd("pipeline.executor");
  assertExecutorResultSuccess(logger.outputDir, ctx.cache);

  syncShadowPlanExecutorLifecycle({
    ctx,
    outputDir: logger.outputDir,
    runId,
    phase: "completed",
  });

  recordTransactionalCheckpoint(logger.outputDir, runId, "post_executor", {
    dry_run: dryRun,
    shadow_reconciled: true,
  });

  const executorArtifacts = [
    ["executor-input.md", "executor_input"],
    ["executor-result.json", "executor_result"],
    ["executor-output.md", "executor_output"],
    ["executor-changes.json", "executor_changes"],
  ];
  for (const [relPath, fileType] of executorArtifacts) {
    if (fs.existsSync(path.join(logger.outputDir, relPath))) {
      addGeneratedFile(logger, runId, relPath, fileType);
    }
  }

  const chPath = path.join(logger.outputDir, "executor-changes.json");
  let applied = [];
  try {
    applied = fs.existsSync(chPath)
      ? JSON.parse(fs.readFileSync(chPath, "utf-8"))
      : [];
  } catch (_) {
    applied = [];
  }

  try {
    runShadowPlanReconciliationAfterExecutor({
      ctx,
      outputDir: logger.outputDir,
      runId,
      executorChanges: applied,
    });
  } catch (_) {
    /* shadow — opcional */
  }

  try {
    runGovernanceRuntimeHook({
      ctx,
      outputDir: logger.outputDir,
      runId,
      hookPhase: GOVERNANCE_HOOK_PHASE.POST_RECONCILIATION,
      flowOptions: orchestration.governanceFlowOptions,
    });
  } catch (_) {
    /* governance runtime — silencioso exceto enforcement explícito */
  }

  try {
    runShadowValidationTargetingAfterReconciliation({
      ctx,
      outputDir: logger.outputDir,
      runId,
    });
  } catch (_) {
    /* validation targeting shadow — opcional */
  }

  try {
    const { runValidationRuntimeAfterTargeting } = require("../validation-runtime");
    await runValidationRuntimeAfterTargeting({
      ctx,
      outputDir: logger.outputDir,
      runId,
    });
  } catch (_) {
    /* validation runtime — best-effort, nunca aborta executor */
  }

  try {
    runGovernanceRuntimeHook({
      ctx,
      outputDir: logger.outputDir,
      runId,
      hookPhase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
      flowOptions: orchestration.governanceFlowOptions,
    });
  } catch (err) {
    if (err && err.name === "GovernanceEnforcementError") {
      console.error(
        "\n[governance] Pipeline bloqueado — validation critical (mode=enforce).",
        err.blocker_codes && err.blocker_codes.length ? err.blocker_codes.join(", ") : "",
      );
      throw err;
    }
    if (err && err.name === "GovernanceAwaitingApprovalError") {
      console.error(
        "\n[governance] Aprovação humana pendente — ver governance-approval.json.",
        err.approval_id ? `approval_id=${err.approval_id}` : "",
      );
      throw err;
    }
  }

  recordTransactionalCheckpoint(logger.outputDir, runId, "post_validation", {
    dry_run: dryRun,
  });

  try {
    const { runRiskAnalysisAfterValidation } = require("../risk-runtime");
    await runRiskAnalysisAfterValidation({
      ctx,
      outputDir: logger.outputDir,
      runId,
    });
  } catch (_) {
    /* risk runtime — best-effort, nunca aborta executor */
  }

  try {
    runGovernanceRuntimeHook({
      ctx,
      outputDir: logger.outputDir,
      runId,
      hookPhase: GOVERNANCE_HOOK_PHASE.POST_RISK,
      flowOptions: orchestration.governanceFlowOptions,
    });
  } catch (_) {
    /* governance runtime — silencioso exceto enforcement explícito */
  }

  recordTransactionalCheckpoint(logger.outputDir, runId, "post_risk", {
    dry_run: dryRun,
  });

  const execMeta = {
    mode: dryRun ? "dry_run" : "apply",
    applied_to_project: !dryRun,
    pending_apply: Boolean(dryRun && applied.length > 0),
  };

  writePatchPreviewArtifact(logger.outputDir, applied, execMeta);

  persistVirtualOverlayArtifact(
    logger.outputDir,
    ctx.state.virtual_project_overlay,
    dryRun,
    ctx.cache,
  );

  if (dryRun && applied.length > 0) {
    try {
      const metaForRoot = readJson(path.join(logger.outputDir, "metadata.json"));
      const man = buildPatchManifest({
        outputDir: logger.outputDir,
        projectRoot: metaForRoot.projectRoot,
        runId,
        appliedChanges: applied,
      });
      writePatchManifestToOutput(logger.outputDir, man);
      addGeneratedFile(logger, runId, "patch-manifest.json", "patch_manifest");
    } catch (e) {
      logger.addWarning("patch-manifest.json não gerado.", {
        message: e.message || String(e),
      });
    }
  }

  mergeExecutionIntoMetadata(
    logger.outputDir,
    {
      pending_apply: execMeta.pending_apply,
      patch_manifest: {
        executor_changes: "executor-changes.json",
        patch_manifest_json: "patch-manifest.json",
        patch_preview: "patch-preview.md",
        patch_preview_summary: "patch-preview-summary.json",
        virtual_overlay: dryRun ? "virtual-project-overlay.json" : null,
        apply_future_cli: "setup-boss apply <runId>",
      },
    },
    ctx.cache,
  );

  logger.data.execution = {
    ...(logger.data.execution || {}),
    mode: dryRun ? "dry_run" : "apply",
    applied_to_project: !dryRun,
    pending_apply: execMeta.pending_apply,
  };
  logger.save();

  const previewPath = path.join(logger.outputDir, "patch-preview.md");
  if (fs.existsSync(previewPath)) {
    addGeneratedFile(logger, runId, "patch-preview.md", "patch_preview");
  }
  const previewSum = path.join(logger.outputDir, "patch-preview-summary.json");
  if (fs.existsSync(previewSum)) {
    addGeneratedFile(logger, runId, "patch-preview-summary.json", "patch_preview_summary");
  }
  const virtPath = path.join(logger.outputDir, "virtual-project-overlay.json");
  if (dryRun && fs.existsSync(virtPath)) {
    addGeneratedFile(logger, runId, "virtual-project-overlay.json", "virtual_overlay");
  }

  appendCheckpoint({
    outputDir: logger.outputDir,
    runId,
    phaseCompleted: "AFTER_EXECUTOR",
    artifactNames: [
      "executor-result.json",
      "executor-changes.json",
      "patch-manifest.json",
      "virtual-project-overlay.json",
    ],
    replayability: {
      notes: dryRun ? "dry_run_overlay_persistido" : "apply_mode",
    },
  });

  emitBridge("phase_completed", {
    jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
    runId,
    data: { phase: "executor" },
  });

  logger.endStep("success");
  logStepEnd("Executor", startedAt);
}

async function runReviewStep(ctx, logger, runId, _orchestration = {}) {
  assertFlowLimits(logger, logger.outputDir);

  mergeExecutionIntoMetadata(
    logger.outputDir,
    { lifecycle_state: RUNTIME_LIFECYCLE.REVIEWING },
    ctx.cache,
  );

  const startedAt = logStepStart(
    "Review",
    "validando resultado",
    "Conferindo se a execução atende aos critérios da task."
  );
  logger.startStep("review");
  ctx.telemetry.stepStart("pipeline.review");
  emitBridge("phase_started", {
    jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
    runId,
    data: { phase: "review" },
  });
  try {
    await runReview(ctx);
  } catch (err) {
    emitBridge("phase_failed", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "review" },
    });
    throw err;
  }
  ctx.telemetry.stepEnd("pipeline.review");
  addGeneratedFile(logger, runId, "review-output.json", "review_output");
  addGeneratedFile(logger, runId, "review-output.md", "review_report");
  logger.endStep("success");
  logStepEnd("Review", startedAt);
  const reviewPath = path.join(logger.outputDir, "review-output.json");
  if (!fs.existsSync(reviewPath)) {
    throw new Error("review-output.json não foi gerado.");
  }

  const review = ctx.cache.readJsonSync(reviewPath);
  appendCheckpoint({
    outputDir: logger.outputDir,
    runId,
    phaseCompleted: "AFTER_REVIEW",
    artifactNames: ["review-output.json", "executor-result.json"],
    extra: { review_status: review.status },
  });

  recordTransactionalCheckpoint(logger.outputDir, runId, "post_review", {
    review_status: review.status || null,
  });

  emitBridge("phase_completed", {
    jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
    runId,
    data: { phase: "review", status: review.status },
  });

  return review;
}

async function finishKnowledge(ctx, logger, runId, orchestration = {}) {
  const startedAt = logStepStart(
    "Knowledge",
    "registrando aprendizado",
    "Salvando decisões úteis para próximas execuções."
  );
  logger.startStep("knowledge");
  ctx.telemetry.stepStart("pipeline.knowledge");
  emitBridge("phase_started", {
    jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
    runId,
    data: { phase: "knowledge" },
  });
  try {
    await runKnowledge(ctx, { exitOnFailure: false });
  } catch (err) {
    emitBridge("phase_failed", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "knowledge" },
    });
    throw err;
  }
  ctx.telemetry.stepEnd("pipeline.knowledge");
  addGeneratedFile(logger, runId, "knowledge-update.md", "knowledge_update");
  logger.endStep("success");
  logStepEnd("Knowledge", startedAt);

  try {
    const metadataPath = path.join(logger.outputDir, "metadata.json");
    const reviewPath = path.join(logger.outputDir, "review-output.json");
    const skipProjectEnrich = orchestration.dryRun === true;
    if (fs.existsSync(metadataPath) && fs.existsSync(reviewPath)) {
      const metadata = readJson(metadataPath);
      const reviewOutput = readJson(reviewPath);
      if (!skipProjectEnrich) {
        try {
          await enrichIAAfterApprovedRun({
            projectRoot: metadata.projectRoot,
            outputDir: logger.outputDir,
            metadata,
            reviewOutput,
          });
        } catch (enrichOnlyErr) {
          console.warn(
            "⚠️ enrichIAAfterApprovedRun (não fatal):",
            enrichOnlyErr.message || enrichOnlyErr,
          );
        }
        if (String(reviewOutput.status).toLowerCase() === "approved") {
          try {
            const commitResult = await tryGitCommitAfterApprovedRun({
              projectRoot: metadata.projectRoot,
              outputDir: logger.outputDir,
              runId,
            });
            if (
              commitResult &&
              (commitResult.ok === true || commitResult.reason === "already_committed")
            ) {
              try {
                const pushResult = tryGitPushAfterApprovedCommit({
                  projectRoot: metadata.projectRoot,
                  outputDir: logger.outputDir,
                  runId,
                });
                if (pushResult && pushResult.ok === true) {
                  console.log(
                    `[git-push] enviado para ${pushResult.remote}/${pushResult.branch}.`,
                  );
                } else if (
                  pushResult &&
                  pushResult.skipped &&
                  pushResult.reason === "already_pushed"
                ) {
                  console.log("[git-push] já enviado (idempotente).");
                } else if (pushResult && pushResult.ok === false && !pushResult.skipped) {
                  console.warn(
                    `[git-push] falhou: ${pushResult.code || "git_push_failed"}`,
                  );
                }

                if (
                  pushResult &&
                  (pushResult.ok === true || pushResult.reason === "already_pushed")
                ) {
                  try {
                    const prResult = await tryGitPrAfterApprovedPush({
                      projectRoot: metadata.projectRoot,
                      outputDir: logger.outputDir,
                      runId,
                    });
                    if (prResult && prResult.ok === true) {
                      console.log(`[git-pr] PR aberto: ${prResult.url || prResult.id}`);
                    } else if (
                      prResult &&
                      prResult.skipped &&
                      prResult.reason === "already_opened"
                    ) {
                      console.log("[git-pr] PR já registado (idempotente).");
                    } else if (prResult && prResult.ok === false && !prResult.skipped) {
                      console.warn(`[git-pr] falhou: ${prResult.code || "git_pr_failed"}`);
                    }
                  } catch (prErr) {
                    console.warn(
                      "⚠️ tryGitPrAfterApprovedPush (não fatal):",
                      prErr.message || prErr,
                    );
                  }
                }
              } catch (pushErr) {
                console.warn(
                  "⚠️ tryGitPushAfterApprovedCommit (não fatal):",
                  pushErr.message || pushErr,
                );
              }
            }
          } catch (commitErr) {
            console.warn(
              "⚠️ tryGitCommitAfterApprovedRun (não fatal):",
              commitErr.message || commitErr,
            );
          }
        }
      } else {
        console.log(
          "[RUN] dry-run: enrichIAAfterApprovedRun omitido — patches não aplicados ao projeto (documentação IA em docs/.IA não atualizada; legado .IA raiz equivalente).",
        );
      }
    }
    if (skipProjectEnrich) {
      mergeExecutionIntoMetadata(
        logger.outputDir,
        {
          approval: {
            workflow: "human_gate_v1",
            state: "review_approved_pending_physical_apply",
            notes:
              "Comando: setup-boss apply <runId> --confirm (determinístico, sem LLM).",
          },
          lifecycle_state: RUNTIME_LIFECYCLE.AWAITING_APPLY,
          dry_run_approved_at: new Date().toISOString(),
        },
        ctx.cache,
      );
    }
  } catch (enrichErr) {
    console.warn(
      "⚠️ enrichIAAfterApprovedRun (não fatal):",
      enrichErr.message || enrichErr
    );
  }

  applyBaselineMetricsSnapshot(logger, orchestration.pipelineMetrics, ctx);
  syncShadowPlanPipelineApprovedFinish({ ctx, outputDir: logger.outputDir });
  emitBridge("phase_completed", {
    jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
    runId,
    data: { phase: "knowledge" },
  });

  recordTransactionalCheckpoint(logger.outputDir, runId, "post_knowledge", {
    dry_run: orchestration.dryRun === true,
  });

  logger.finish();
  console.log("✅ Finalizado com sucesso");
}

function handleArchitectFailure(logger, outputDir, pipelineMetrics, ctx) {
  const invalidVal = tryReadInvalidTaskValidation(outputDir);
  if (invalidVal) {
    if (logger && logger.currentStep) {
      logger.endStep("error", {
        operational_abort: true,
        gate: "invalid_task",
      });
    }
    if (logger) {
      applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);
      logger.addWarning(
        "Pipeline encerrado no gate do architect: task marcada como inválida (task_valid=false).",
        { gate: "invalid_task", task_valid: invalidVal.task_valid }
      );
      logger.finish("partial");
    }
    if (Array.isArray(invalidVal.violations) && invalidVal.violations[0]) {
      console.log("\n" + invalidVal.violations[0]);
    } else {
      console.log(
        "\n⛔ Pipeline encerrado: task inválida para execução automática."
      );
    }
    console.log(
      "\nExecutor, review, correction e knowledge não foram executados. Corrija a task ou o escopo e rode novamente."
    );
    return true;
  }
  return false;
}

async function runPostExecutorLoop(ctx, logger, runId, orchestration) {
  const pipelineMetrics = orchestration.pipelineMetrics;
  const correctionCap =
    orchestration &&
    orchestration.governanceCorrectionCap != null &&
    Number.isFinite(Number(orchestration.governanceCorrectionCap))
      ? Number(orchestration.governanceCorrectionCap)
      : MAX_CORRECTIONS;
  for (;;) {
    const review = await runReviewStep(ctx, logger, runId, orchestration);

    if (review.status === "approved") {
      await finishKnowledge(ctx, logger, runId, orchestration);
      return "completed";
    }

    if (review.status === "blocked") {
      logger.addWarning("Review bloqueado.", {
        review_status: review.status,
        blocking_issues: review.blocking_issues || [],
      });
      appendProblemHistoryEntry({
        outputDir: logger.outputDir,
        step: "run",
        status: "blocked",
        severity: "high",
        type: "review_blocked",
        title: "Pipeline parado por review bloqueado",
        summary: summarizeReviewIssues(review),
        cause: "review_stopped_pipeline",
        evidence: [
          ...(review.blocking_issues || []).map((x) =>
            String(x).slice(0, 500),
          ),
          ...(review.warnings || []).map((x) => String(x).slice(0, 500)),
        ].slice(0, 25),
        files: [],
        extra: {
          acceptance_level: review.acceptance_level,
          requires_correction: review.requires_correction,
          blocking_issues: review.blocking_issues || [],
          warnings: review.warnings || [],
        },
      });
      syncShadowPlanPipelineBlocked({ ctx, outputDir: logger.outputDir });
      applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);
      logger.finish("partial");
      console.log("⛔ Review bloqueado.");
      console.log(
        "Corrija a definição/estado da task antes de rodar de novo.",
      );
      return "blocked";
    }

    if (review.requires_correction === false) {
      logger.addWarning("Review reprovou, mas não solicitou correção.", {
        review_status: review.status,
      });
      throw new Error("REVIEW_FAILED_WITHOUT_CORRECTION_PATH");
    }

    if (logger.data.correction_iterations >= correctionCap) {
      logger.addWarning("Limite máximo de correções atingido.", {
        correction_iterations: logger.data.correction_iterations,
        max_corrections: correctionCap,
      });
      appendProblemHistoryEntry({
        outputDir: logger.outputDir,
        step: "run",
        status: "failed",
        severity: "high",
        type: "correction_loop_limit",
        title: "Limite de correções atingido sem aprovação",
        summary: `MAX_CORRECTIONS (${correctionCap}) atingido (env/policy).`,
        cause: "max_corrections",
        evidence: [
          `correction_iterations=${logger.data.correction_iterations}`,
        ],
        files: [],
        extra: {
          correction_iterations: logger.data.correction_iterations,
          max_corrections: correctionCap,
        },
      });
      syncShadowPlanPipelinePartialFailure({ ctx, outputDir: logger.outputDir });
      applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);
      logger.finish("partial");
      console.log(
        `⚠️ MAX_CORRECTIONS (${correctionCap}) atingido sem aprovação.`,
      );
      return "partial";
    }

    try {
      const gate = evaluateCorrectionRetrySuppressionGate({
        outputDir: logger.outputDir,
        telemetry: ctx.telemetry,
      });

      if (gate.allow_correction === false) {
        const detail = gate.failure_signature_sha256
          ? `signature=${String(gate.failure_signature_sha256).slice(0, 20)}…`
          : "";
        logger.addWarning("Retry de correção suprimido pelo correction runtime.", {
          gate_streak: gate.gate_streak,
          detail,
          type: "correction_retry_suppressed",
        });

        appendProblemHistoryEntry({
          outputDir: logger.outputDir,
          step: "run",
          status: "failed",
          severity: "high",
          type: "correction_retry_suppressed",
          title: "Supressão de retry (failures signature repetidos)",
          summary: detail || "SETUP_BOSS_CORRECTION_ENGINE=active aplicou suppression policy.",
          cause: "duplicate_failure_signature_guard",
          evidence: [`streak=${gate.gate_streak}`, detail],
          files: ["correction-analysis.json", "correction-memory/correction-memory.json"],
          extra: gate,
        });
        syncShadowPlanPipelinePartialFailure({ ctx, outputDir: logger.outputDir });
        applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);
        logger.finish("partial");
        console.log(
          `\n⚠️ Retry suprimido: mesma falha estrutural detectada repetidamente. Ver \`inspect-correction\` e correction-analysis.json.`,
        );
        return "partial";
      }
    } catch (_) {
      /* Correção não bloqueada em caso de erro no motor novo */
    }

    const reason = summarizeReviewIssues(review);
    console.log(
      `\n🔁 Iteração de correção #${logger.data.correction_iterations + 1}`,
    );
    console.log(`   Motivo: ${reason}`);

    logger.incrementCorrectionIteration();

    mergeExecutionIntoMetadata(
      logger.outputDir,
      { lifecycle_state: RUNTIME_LIFECYCLE.CORRECTING },
      ctx.cache,
    );

    const correctionStartedAt = logStepStart(
      "Correction",
      "ajustando problemas",
      "Gerando instruções objetivas para nova execução.",
    );
    logger.startStep("correction");
    ctx.telemetry.stepStart("pipeline.correction");
    emitBridge("phase_started", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: {
        phase: "correction",
        iteration:
          typeof logger.data.correction_iterations === "number"
            ? logger.data.correction_iterations
            : null,
      },
    });
    try {
      await runCorrection(ctx, { exitOnFailure: false });
    } catch (err) {
      emitBridge("phase_failed", {
        jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
        runId,
        data: { phase: "correction" },
      });
      throw err;
    }
    ctx.telemetry.stepEnd("pipeline.correction");
    addGeneratedFile(
      logger,
      runId,
      "correction-instructions.md",
      "correction_instructions",
    );
    logger.endStep("success");
    logStepEnd("Correction", correctionStartedAt);

    appendCheckpoint({
      outputDir: logger.outputDir,
      runId,
      phaseCompleted: "AFTER_CORRECTION",
      artifactNames: [
        "correction-instructions.md",
        "review-output.json",
      ],
      extra: {
        correction_iterations: logger.data.correction_iterations,
      },
    });

    recordTransactionalCheckpoint(logger.outputDir, runId, "post_correction", {
      correction_iterations:
        typeof logger.data.correction_iterations === "number"
          ? logger.data.correction_iterations
          : null,
    });

    emitBridge("phase_completed", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "correction" },
    });

    await runExecutorStep(ctx, logger, runId, orchestration);
  }
}

async function startFlow(taskArg, projectArg, flowOptions = {}) {
  const forceScanFresh = flowOptions.forceScan === true;
  const dryRun = flowOptions.dryRun === true;
  const skipPreflightConfirm = flowOptions.skipPreflightConfirm === true;

  if (!taskArg || !projectArg) {
    console.log("Uso:");
    console.log("npm run run tasks/exemplo.md ../landing-sofas");
    throw new RuntimeTerminalError("Argumentos task/projeto obrigatórios.", {
      code: "INVALID_ARGS",
      exitCode: 1,
    });
  }

  console.log("🚀 Setup Boss iniciado");
  if (dryRun) {
    console.log(
      "[RUN] Modo dry-run: pipeline completo sem gravar patches no projeto-alvo (overlay virtual + artefactos)."
    );
  }

  const taskPathPre = path.resolve(ROOT_DIR, taskArg);

  if (!fs.existsSync(taskPathPre)) {
    console.log(`❌ Task não encontrada: ${taskPathPre}`);
    throw new RuntimeTerminalError(`Task não encontrada: ${taskPathPre}`, {
      code: "TASK_NOT_FOUND",
      exitCode: 1,
    });
  }

  const pipelineMetrics = {
    preflight_task_validation_ms: null,
    preflight_analysis_ms: null,
    child_spawns: [],
  };

  const preflightStarted = Date.now();

  try {
    validateTask(fs.readFileSync(taskPathPre, "utf-8"));
  } catch (preflightErr) {
    const rootEarly = resolveProjectRoot(projectArg);
    if (fs.existsSync(rootEarly)) {
      appendProblemHistoryEntry({
        projectRoot: rootEarly,
        metadata: {
          taskArg,
          projectName: path.basename(rootEarly),
        },
        task: { path: taskArg },
        step: "run",
        status: "error",
        severity: "high",
        type: "architect_blocked",
        title: "Task inválida (pré-check)",
        summary: String(preflightErr.message || preflightErr).slice(0, 1500),
        cause: "task_validation",
        evidence: [String(preflightErr.message || preflightErr).slice(0, 2000)],
        files: [],
        extra: { gate: "preflight_validate_task" },
      });
    }
    console.error(
      "⛔ Pré-validação da task falhou:",
      preflightErr.message || preflightErr
    );
    throw new RuntimeTerminalError(
      String(preflightErr.message || preflightErr || "TASK_VALIDATION_FAILED"),
      { code: "TASK_VALIDATION_FAILED", exitCode: 1 },
    );
  }

  pipelineMetrics.preflight_task_validation_ms = Date.now() - preflightStarted;

  const orchestration = {
    pipelineMetrics,
    dryRun,
    governanceCorrectionCap: MAX_CORRECTIONS,
    governanceFlowOptions: {
      policyProfile: flowOptions.policyProfile || null,
      forcePolicyBypass: flowOptions.forcePolicyBypass === true,
      disableGovernance: flowOptions.disableGovernance === true,
    },
  };

  let logger;
  let ctx;

  try {
    const projectRoot = resolveProjectRoot(projectArg);

    const knowledgeBase = validateProjectKnowledgeBase(projectRoot, {
      setupBossRoot: ROOT_DIR,
      forbidSetupBossRoot: true,
    });
    if (!knowledgeBase.ok) {
      console.error(`⛔ ${knowledgeBase.title}`);
      console.error(knowledgeBase.description);
      throw new RuntimeTerminalError(knowledgeBase.description, {
        code: knowledgeBase.code,
        exitCode: 1,
      });
    }

    const projectOutputsDir = getProjectOutputsDir(projectArg);

    ensureDir(CACHE_DIR);
    ensureDir(getProjectIADir(projectArg));
    ensureDir(projectOutputsDir);

    const runId = getRunId(taskArg);
    const outputDir = getOutputDirForProject(projectArg, runId);

    ensureDir(outputDir);
    assertOutputInsideProjectIA(projectRoot, outputDir);

    writeRunIndex({ runId, projectRoot, outputDir });

    bootstrapTransactionRuntime(outputDir, runId);

    const fingerprintPack = computeScanCacheFingerprint(projectRoot, ROOT_DIR);
    const scanCachePath = resolveScanCacheFilePath(
      CACHE_DIR,
      projectRoot,
      fingerprintPack.fingerprint,
    );
    ensureDir(CACHE_DIR);

    let ttlOk = true;
    if (SCAN_CACHE_TTL_MS > 0 && fs.existsSync(scanCachePath)) {
      ttlOk = isFreshCache(scanCachePath);
    }

    const cacheFileOk =
      fs.existsSync(scanCachePath) &&
      ttlOk &&
      fs.statSync(scanCachePath).size > 8;

    let canUseScanCache =
      ENABLE_SCAN_CACHE && cacheFileOk && !forceScanFresh;

    if (forceScanFresh) {
      console.log(
        "[RUN] force-scan ativo: cache de scan ignorado; scan fresco nesta run."
      );
    }

    logger = new RunLogger({
      runId,
      outputDir,
      project: projectArg,
      task: taskArg,
    });

    logger.data.cache.scan_forced = Boolean(forceScanFresh);
    logger.data.execution = {
      mode: dryRun ? "dry_run" : "apply",
      applied_to_project: !dryRun,
      pending_apply: false,
    };
    logger.save();

    ctx = createRuntimeContext({
      rootDir: ROOT_DIR,
      runId,
      taskArg,
      projectArg,
      projectPath: projectArg,
      projectRoot,
      taskPath: taskPathPre,
      outputDir,
      logger,
      execution: { dryRun },
    });

    emitBridge("runtime_started", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { taskArg, projectArg },
    });

    emitBridge("phase_started", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "preflight" },
    });

    const taskUtf8 = fs.readFileSync(taskPathPre, "utf-8");
    const pfReport = await executePreflightPhase({
      taskPathAbs: taskPathPre,
      taskContent: taskUtf8,
      projectRootAbs: projectRoot,
      setupBossRepoRoot: ROOT_DIR,
      outputDir,
      logger,
      runId,
      scanUsesCache: canUseScanCache,
      pipelineMetrics,
      telemetry: ctx.telemetry,
      dryRun,
      envMaxCorrections: MAX_CORRECTIONS,
      flowOptions: {
        skipPreflightConfirm,
        policyProfile: flowOptions.policyProfile || null,
        forcePolicyBypass: flowOptions.forcePolicyBypass === true,
        disableGovernance: flowOptions.disableGovernance === true,
      },
    });
    let effectiveCorrCap = MAX_CORRECTIONS;
    if (
      pfReport &&
      pfReport.governance &&
      pfReport.governance.effective_max_correction_iterations != null
    ) {
      const n = Number(pfReport.governance.effective_max_correction_iterations);
      if (Number.isFinite(n) && n >= 0) {
        effectiveCorrCap = Math.max(0, Math.floor(n));
      }
    }
    orchestration.governanceCorrectionCap = effectiveCorrCap;

    emitBridge("phase_completed", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "preflight" },
    });

    mergeExecutionIntoMetadata(
      outputDir,
      { lifecycle_state: RUNTIME_LIFECYCLE.PREFLIGHT },
      ctx.cache,
    );
    appendCheckpoint({
      outputDir,
      runId,
      phaseCompleted: "AFTER_PREFLIGHT",
      artifactNames: [
        "preflight-analysis.json",
        "preflight-summary.md",
        "policy-report.json",
        "governance-decisions.json",
      ],
      replayability: { scan_skipped: canUseScanCache },
    });

    recordTransactionalCheckpoint(outputDir, runId, "post_preflight", {
      scan_cache_used: canUseScanCache,
    });

    ctx.telemetry.emit(
      canUseScanCache ? "scan.cache.hit" : "scan.cache.miss",
      {
        path: scanCachePath,
        fp16: fingerprintPack.fingerprint.slice(0, 16),
      },
    );

    emitBridge("phase_started", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "architect" },
    });

    logger.startStep("architect", {
      scan_cache_enabled: ENABLE_SCAN_CACHE,
      scan_cache_used: canUseScanCache,
      scan_forced: Boolean(forceScanFresh),
    });

    console.log("[RUN] runId:", runId);
    console.log("[RUN] projectOutputsDir:", projectOutputsDir);
    console.log("[RUN] outputDir:", outputDir);
    console.log("[RUN] canUseScanCache:", canUseScanCache);
    console.log("[RUN] execution.mode:", dryRun ? "dry_run" : "apply");

    console.log("Etapa — Architect + Scan");

    mergeExecutionIntoMetadata(
      outputDir,
      { lifecycle_state: RUNTIME_LIFECYCLE.ARCHITECTING },
      ctx.cache,
    );

    const architectStartedAt = logStepStart(
      "Architect",
      "gerando plano",
      "Lendo task, scan do projeto e montando plano de execução."
    );

    ctx.telemetry.stepStart("pipeline.architect");
    const architectResult = await runArchitect(ctx, {
      skipScan: canUseScanCache,
      exitOnFailure: false,
    });
    ctx.telemetry.stepEnd("pipeline.architect");

    if (!architectResult.success) {
    if (handleArchitectFailure(logger, outputDir, pipelineMetrics, ctx)) {
      finalizeTxnSafe(outputDir, runId, "partial");
      return {
        status: "partial",
        exitCode: 0,
        runId,
        outputDir,
        reason: "invalid_task",
        correctionIterations: logger.data.correction_iterations,
      };
    }
      emitBridge("phase_failed", {
        jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
        runId,
        data: { phase: "architect" },
      });
      throw new Error(architectResult.message || "Architect bloqueado.");
    }

    if (architectResult.outputName !== runId) {
      logger.addWarning("Mismatch entre runId e outputName.", {
        runId,
        outputName: architectResult.outputName,
      });
    }

    if (canUseScanCache) {
      const copied = copyCachedScanToOutput(scanCachePath, outputDir);
      logger.setCacheInfo({
        scanUsed: copied,
        scanCachePath,
        scanFingerprint: fingerprintPack.fingerprint.slice(0, 24),
        scan_cache_reason: copied ? "fingerprint_ttl_ok" : "copy_failed",
      });
      if (copied) {
        ctx.cache.invalidate(path.join(outputDir, "scan-output.md"));
        addGeneratedFile(logger, runId, "scan-output.md", "scan_output");
      }
    } else {
      const saved = saveScanToCache(outputDir, scanCachePath);
      logger.setCacheInfo({
        scanUsed: false,
        scanCachePath: saved ? scanCachePath : null,
        scanFingerprint: fingerprintPack.fingerprint.slice(0, 24),
        scan_cache_reason: saved ? "persisted_scan" : "persist_failed_empty",
      });
      if (saved) {
        ctx.cache.invalidate(path.join(outputDir, "scan-output.md"));
        addGeneratedFile(logger, runId, "scan-output.md", "scan_output");
      }
    }

    addGeneratedFile(logger, runId, "architect-input.md", "architect_input");
    addGeneratedFile(logger, runId, "architect-output.md", "architect_output");
    addGeneratedFile(logger, runId, "task.md", "task");
    addGeneratedFile(logger, runId, "metadata.json", "metadata");
    addGeneratedFile(
      logger,
      runId,
      "architect-validation.json",
      "architect_validation"
    );

    logStepEnd("Architect", architectStartedAt);
    logger.endStep("success");

    emitBridge("phase_completed", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId,
      data: { phase: "architect" },
    });

    mergeExecutionIntoMetadata(
      outputDir,
      {
        mode: dryRun ? "dry_run" : "apply",
        applied_to_project: !dryRun,
        pending_apply: false,
        run_id: runId,
        approval: {
          workflow: "human_gate_v1",
          state: dryRun ? "awaiting_executor" : "none",
          apply_future_cli: "setup-boss apply <runId>",
        },
      },
      ctx.cache,
    );

    appendCheckpoint({
      outputDir,
      runId,
      phaseCompleted: "AFTER_ARCHITECT",
      artifactNames: [
        "metadata.json",
        "run-context.json",
        "architect-output.md",
        "scan-output.md",
      ],
      replayability: { scan_skipped: canUseScanCache },
    });

    recordTransactionalCheckpoint(outputDir, runId, "post_architect", {
      architect_success: true,
    });

    try {
      const planOutcome = runShadowExecutionPlanAfterArchitect({
        ctx,
        outputDir: logger.outputDir,
        runId,
      });
      if (
        planOutcome &&
        planOutcome.ok === true &&
        !planOutcome.skipped &&
        planOutcome.plan_id
      ) {
        mergeExecutionIntoMetadata(
          logger.outputDir,
          {
            execution_plan: {
              artifact: "execution-plan.json",
              plan_id: planOutcome.plan_id,
              fingerprint_sha256: planOutcome.fingerprint || null,
              lifecycle_state: planOutcome.lifecycle_state || null,
            },
          },
          ctx.cache,
        );
        addGeneratedFile(logger, runId, "execution-plan.json", "execution_plan");
      }
      try {
        if (
          planOutcome &&
          planOutcome.ok === true &&
          !planOutcome.skipped &&
          planOutcome.plan_id
        ) {
          runShadowValidationTargetingAfterArchitect({
            ctx,
            outputDir: logger.outputDir,
            runId,
          });
        }
      } catch (_) {
        /* targeting shadow — opcional */
      }
    } catch (_) {
      /* Shadow plan nunca pode derrubar o pipeline */
    }

    recordTransactionalCheckpoint(outputDir, runId, "post_plan", {
      plan_json_present: fs.existsSync(path.join(outputDir, "execution-plan.json")),
    });

    await runExecutorStep(ctx, logger, runId, orchestration);

    const postOutcome = await runPostExecutorLoop(
      ctx,
      logger,
      runId,
      orchestration,
    );

    let statusFinal = postOutcome === "blocked" ? "blocked" : "completed";
    if (postOutcome === "partial") statusFinal = "partial";

    finalizeTxnSafe(outputDir, runId, statusFinal);

    return {
      status: statusFinal,

      exitCode: 0,

      runId,

      outputDir,

      reason:

        statusFinal !== "completed" ? String(postOutcome || statusFinal) : null,

      correctionIterations: logger.data.correction_iterations,
    };

  } catch (error) {
    if (error && error.loggerHandled === true) {
      throw error;
    }

    const outDir = logger && logger.outputDir;
    const invalidVal = outDir ? tryReadInvalidTaskValidation(outDir) : null;

    if (invalidVal) {
      if (logger && logger.currentStep) {
        logger.endStep("error", {
          operational_abort: true,
          gate: "invalid_task",
        });
      }
      if (logger) {
        applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);
        logger.addWarning(
          "Pipeline encerrado no gate do architect: task marcada como inválida (task_valid=false).",
          { gate: "invalid_task", task_valid: invalidVal.task_valid }
        );
        logger.finish("partial");
      }
      if (Array.isArray(invalidVal.violations) && invalidVal.violations[0]) {
        console.log("\n" + invalidVal.violations[0]);
      } else {
        console.log(
          "\n⛔ Pipeline encerrado: task inválida para execução automática."
        );
      }
      console.log(
        "\nExecutor, review, correction e knowledge não foram executados. Corrija a task ou o escopo e rode novamente."
      );
      if (logger && logger.outputDir && logger.runId) {
        finalizeTxnSafe(logger.outputDir, logger.runId, "partial");
      }
      return {
        status: "partial",

        exitCode: 0,

        runId: logger && logger.runId ? logger.runId : null,

        outputDir: logger && logger.outputDir ? logger.outputDir : null,

        reason: "invalid_task_gate",

        correctionIterations:

          logger &&
          logger.data &&
          typeof logger.data.correction_iterations === "number"

            ? logger.data.correction_iterations

            : null,

      };
    }

    if (logger && logger.outputDir) {
      const msg = String(error.message || error || "");
      if (msg.includes("MAX_TOTAL_STEPS")) {
        appendProblemHistoryEntry({
          outputDir: logger.outputDir,
          step: "run",
          status: "failed",
          severity: "critical",
          type: "max_total_steps_limit",
          title: "Limite máximo de etapas atingido",
          summary: msg.slice(0, 800),
          cause: "max_total_steps",
          evidence: [msg.slice(0, 1200)],
          files: [],
          extra: { max_total_steps: MAX_TOTAL_STEPS },
        });
      } else {
        appendProblemHistoryEntry({
          outputDir: logger.outputDir,
          step: "run",
          status: "error",
          severity: "critical",
          type: "unknown_error",
          title: "Erro fatal no pipeline",
          summary: msg.slice(0, 800),
          cause: "fatal",
          evidence: [String(error.stack || msg).slice(0, 2000)],
          files: [],
          extra: {},
        });
      }
    }

    if (logger && logger.outputDir) {
      finalizeTransactionalFailure(logger.outputDir, logger.runId, {
        hint: String(error && error.message ? error.message : error || ""),
      });
    }

    if (logger) {
      applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);
      logger.failStep(error);
      logger.finish();
    }
    emitBridge("phase_failed", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId: logger && logger.runId ? logger.runId : null,
      data: {
        phase: logger && logger.currentStep ? logger.currentStep : "pipeline",
        message:
          error && typeof (/** @type {any} */ (error).message) === "string"
            ? String(error.message).slice(0, 512)
            : null,
      },
    });
    console.error("❌ Erro:", error.message);
    throw error;
  }
}

async function startFlowResume(outputDir, nextPhase, flowOptions = {}) {
  const runId = path.basename(outputDir);
  const metaPath = path.join(outputDir, "metadata.json");

  if (!fs.existsSync(metaPath)) {
    console.error("❌ metadata.json ausente — não é possível retomar.");
    throw new RuntimeTerminalError("metadata.json ausente — não é possível retomar.", {
      code: "METADATA_MISSING",
      exitCode: 1,
    });
  }

  const meta = readJson(metaPath);
  const taskArg = meta.taskArg;
  const projectArg = meta.projectArg;
  const projectRoot = meta.projectRoot;
  const taskPathPre = path.resolve(ROOT_DIR, taskArg);

  if (!taskArg || !projectArg || !projectRoot) {
    console.error("❌ metadata incompleto (taskArg / projectArg / projectRoot).");
    throw new RuntimeTerminalError(
      "metadata incompleto (taskArg / projectArg / projectRoot).",
      {
        code: "METADATA_INCOMPLETE",
        exitCode: 1,
      },

    );

  }

  assertOutputInsideProjectIA(projectRoot, outputDir);

  const policyProfile =
    flowOptions && flowOptions.policyProfile != null
      ? flowOptions.policyProfile
      : null;
  const forcePolicyBypass =
    flowOptions && flowOptions.forcePolicyBypass === true;
  const disableGovernance =
    flowOptions && flowOptions.disableGovernance === true;

  applyCliGovernanceToProcessEnv({
    policyProfile,
    forcePolicyBypass,
    disableGovernance,
  });

  appendResumeGovernanceAudit(outputDir, {
    projectRootAbs: projectRoot,
    nextPhase,
    policyProfileCli: policyProfile,
    forcePolicyBypass,
    disableGovernance,
  });

  const dryRun = meta.execution && meta.execution.mode === "dry_run";
  const pipelineMetrics = {
    preflight_task_validation_ms: null,
    preflight_analysis_ms: null,
    child_spawns: [],
  };
  const capFromPreflight =
    readEffectiveMaxCorrectionFromPreflightArtifacts(outputDir);
  const orchestration = {
    pipelineMetrics,
    dryRun,
    governanceCorrectionCap:
      Number.isFinite(Number(capFromPreflight))
        ? Math.max(0, Math.floor(Number(capFromPreflight)))
        : MAX_CORRECTIONS,
    governanceFlowOptions: {
      policyProfile,
      forcePolicyBypass,
      disableGovernance,
    },
  };

  console.log("🔄 Setup Boss — resume");
  console.log("[RESUME] outputDir:", outputDir);
  console.log("[RESUME] next_phase:", nextPhase);

  let logger;
  let ctx;

  try {
    logger = new RunLogger({
      runId,
      outputDir,
      project: projectArg,
      task: taskArg,
    });

    ctx = createRuntimeContext({
      rootDir: ROOT_DIR,
      runId,
      taskArg,
      projectArg,
      projectPath: projectArg,
      projectRoot,
      taskPath: taskPathPre,
      outputDir,
      logger,
      execution: { dryRun },
    });

    bootstrapTransactionRuntime(outputDir, runId);

    const hasGovResumeCli =
      (policyProfile != null && String(policyProfile).trim() !== "") ||
      forcePolicyBypass ||
      disableGovernance;

    mergeExecutionIntoMetadata(
      outputDir,
      {
        lifecycle_state: RUNTIME_LIFECYCLE.RESUMABLE,
        resume_started_at: new Date().toISOString(),
        resume_next_phase: nextPhase,
        ...(hasGovResumeCli
          ? {
              governance_resume_cli: {
                policy_profile:
                  policyProfile != null && String(policyProfile).trim()
                    ? String(policyProfile).trim()
                    : null,
                force_policy_bypass: forcePolicyBypass,
                disable_governance: disableGovernance,
              },
            }
          : {}),
      },
      ctx.cache,
    );

    if (nextPhase === "correction") {
      if (logger.data.correction_iterations === 0) {
        logger.incrementCorrectionIteration();
      }

      mergeExecutionIntoMetadata(
        logger.outputDir,
        { lifecycle_state: RUNTIME_LIFECYCLE.CORRECTING },
        ctx.cache,
      );

      const correctionStartedAt = logStepStart(
        "Correction",
        "ajustando problemas",
        "Retomando correção (resume).",
      );
      logger.startStep("correction");
      ctx.telemetry.stepStart("pipeline.correction");
      await runCorrection(ctx, { exitOnFailure: false });
      ctx.telemetry.stepEnd("pipeline.correction");
      addGeneratedFile(
        logger,
        runId,
        "correction-instructions.md",
        "correction_instructions",
      );
      logger.endStep("success");
      logStepEnd("Correction", correctionStartedAt);

      appendCheckpoint({
        outputDir: logger.outputDir,
        runId,
        phaseCompleted: "AFTER_CORRECTION",
        artifactNames: ["correction-instructions.md", "review-output.json"],
        extra: {
          correction_iterations: logger.data.correction_iterations,
          resume: true,
        },
      });

      recordTransactionalCheckpoint(logger.outputDir, runId, "post_correction", {
        correction_iterations:
          typeof logger.data.correction_iterations === "number"
            ? logger.data.correction_iterations
            : null,
        resume: true,
      });

      await runExecutorStep(ctx, logger, runId, orchestration);
      const postOutcome = await runPostExecutorLoop(
        ctx,
        logger,
        runId,
        orchestration,
      );

      let statusFinal = postOutcome === "blocked" ? "blocked" : "completed";
      if (postOutcome === "partial") statusFinal = "partial";

      finalizeTxnSafe(logger.outputDir, runId, statusFinal);

      return {


        status: statusFinal,

        exitCode: 0,

        runId,

        outputDir,

        reason:

          statusFinal !== "completed" ? String(postOutcome || statusFinal) : null,

        correctionIterations: logger.data.correction_iterations,

      };
    }

    if (nextPhase === "executor") {
      await runExecutorStep(ctx, logger, runId, orchestration);
      const postOutcome = await runPostExecutorLoop(
        ctx,

        logger,

        runId,

        orchestration,

      );


      let statusFinal = postOutcome === "blocked" ? "blocked" : "completed";
      if (postOutcome === "partial") statusFinal = "partial";

      finalizeTxnSafe(logger.outputDir, runId, statusFinal);

      return {

        status: statusFinal,

        exitCode: 0,

        runId,

        outputDir,

        reason:

          statusFinal !== "completed" ? String(postOutcome || statusFinal) : null,

        correctionIterations: logger.data.correction_iterations,

      };

    }

    if (nextPhase === "review") {


      const postOutcome = await runPostExecutorLoop(


        ctx,


        logger,


        runId,


        orchestration,


      );

      let statusFinal = postOutcome === "blocked" ? "blocked" : "completed";
      if (postOutcome === "partial") statusFinal = "partial";


      finalizeTxnSafe(logger.outputDir, runId, statusFinal);

      return {

        status: statusFinal,

        exitCode: 0,

        runId,

        outputDir,

        reason:

          statusFinal !== "completed" ? String(postOutcome || statusFinal) : null,

        correctionIterations: logger.data.correction_iterations,

      };

    }

    throw new Error(`Fase de resume desconhecida: ${nextPhase}`);
  } catch (error) {


    if (error && error.loggerHandled === true) throw error;


    const invalidVal = tryReadInvalidTaskValidation(outputDir);



    if (invalidVal) {
      if (logger && logger.currentStep) {


        logger.endStep("error", {


          operational_abort: true,

          gate: "invalid_task",


        });

      }


      if (logger) {


        applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);

        logger.finish("partial");


      }


      console.error(invalidVal.violations?.[0] || "Task inválida.");


      finalizeTxnSafe(outputDir, runId, "partial");


      return {


        status: "partial",


        exitCode: 0,


        runId,


        outputDir,


        reason: "invalid_task_gate",


        correctionIterations:


          logger &&


          logger.data &&


          typeof logger.data.correction_iterations === "number"


            ? logger.data.correction_iterations


            : null,


      };

    }



    if (logger && logger.outputDir) {
      finalizeTransactionalFailure(logger.outputDir, logger.runId, {
        hint: String(error && error.message ? error.message : error || ""),
      });
    }


    if (logger) {


      applyBaselineMetricsSnapshot(logger, pipelineMetrics, ctx);

      logger.failStep(error);


      logger.finish();


    }


    console.error("❌ Erro no resume:", error.message);


    throw error;


  }

}

module.exports = {
  startFlow,
  startFlowResume,
  SOURCE_OF_TRUTH,
  CACHE_DIR,
};
