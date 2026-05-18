"use strict";

const fs = require("fs");
const path = require("path");

const { executeIntake } = require("../../runtime/intake/intake-runtime");
const { executeClarification } = require("../../runtime/clarification/clarification-runtime");
const {
  resolveProjectRecord,
  loadProjectsUnsafe,
  upsertProjectFromUsage,
} = require("./project-registry");
const { enqueueJob, updateJob, loadQueueUnsafe } = require("./queue-store");
const { emitRuntimeEvent } = require("./runtime-events");
const {
  mergeTraceContext,
  appendRuntimeTrace,
  safeSerializeError,
  resolveDataDirAbs,
} = require("../../runtime-observability/runtime-trace");
const {
  auditRunOutputArtifacts,
  auditDaemonArtifacts,
} = require("../../runtime-observability/artifact-audit");
const { resolveRunIndexPath, writeRunIndex } = require("../../../core/run-resolver");
const { patchRunContextWorkspaceLink } = require("../../../core/patch-run-context-workspace-link");
const { deriveUiStateAfterIntake } = require("../../../core/clarification-ui-contract");
const {
  validateProjectKnowledgeBase,
  resolveSetupBossRepoRoot,
} = require("../../../core/validate-project-knowledge-base");
const { resolveTargetProjectRoot } = require("../../../core/resolve-target-project-root");
const {
  buildStructuredPreRunError,
  traceKnowledgeBootstrapFailed,
} = require("./pre-run-observability");

const MIN_TASK_CHARS = 12;

/**
 * @param {Record<string, unknown>} raw
 * @param {{ projectId?: string|null, projectRoot?: string|null }} [ctx]
 */
function preRunFailure(raw, ctx = {}) {
  return {
    ok: false,
    error: buildStructuredPreRunError(raw, ctx),
  };
}

/**
 * @param {string} phase2Status
 * @param {boolean} clarifyOk
 */
function deriveInitialState(phase2Status, clarifyOk) {
  const st = String(phase2Status || "").trim();
  if (!clarifyOk) return "intake_running";
  if (st === "questions_generated" || st === "clarification_initialized") {
    return "clarification_required";
  }
  if (st === "plan_refined" || st === "answers_recorded") {
    return "clarification_ready";
  }
  if (st === "ready_for_execution") return "clarification_ready";
  if (st === "approval_rejected") return "failed";
  return "intake_running";
}

/**
 * @param {string} initialState
 */
function uiPhaseForInitialState(initialState) {
  if (initialState === "clarification_required" || initialState === "clarification_ready") {
    return "clarify";
  }
  if (initialState === "strategy_pending") return "strategy";
  if (initialState === "failed") return "failed";
  return "intake";
}

/**
 * @param {{
 *   repoRoot: string,
 *   projectId: string,
 *   task: string,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
async function createRunFromTask(input) {
  const repoRoot = path.resolve(String(input.repoRoot || ""));
  const projectId = String(input.projectId || "").trim();
  const taskText = String(input.task || "").trim();
  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {};

  if (!projectId) {
    appendRuntimeTrace({
      component: "run_intake_api",
      event: "validation_failed",
      phase: "submit",
      level: "warn",
      message: "projectId em falta",
      source: "daemon",
      derivedFrom: "state",
      projectId: null,
    });
    return preRunFailure({
      code: "project_id_required",
      message: "projectId é obrigatório.",
    });
  }
  if (!taskText || taskText.length < MIN_TASK_CHARS) {
    appendRuntimeTrace({
      component: "run_intake_api",
      event: "validation_failed",
      phase: "submit",
      level: "warn",
      projectId,
      message: "task demasiado curta",
      source: "daemon",
      derivedFrom: "state",
      metadata: { len: taskText ? taskText.length : 0 },
    });
    return preRunFailure(
      {
        code: "task_too_short",
        message: `task deve ter pelo menos ${MIN_TASK_CHARS} caracteres.`,
      },
      { projectId },
    );
  }

  mergeTraceContext({ projectId });

  let jobsForResolve = [];
  try {
    jobsForResolve = loadQueueUnsafe().jobs || [];
  } catch (_) {
    jobsForResolve = [];
  }

  const resolved = resolveProjectRecord(projectId, {
    repoRoot,
    jobs: jobsForResolve,
  });
  let projectRoot =
    resolved.projectRoot && fs.existsSync(resolved.projectRoot)
      ? path.resolve(String(resolved.projectRoot))
      : null;

  if (!projectRoot) {
    const registryCount = loadProjectsUnsafe().projects.length;
    appendRuntimeTrace({
      component: "run_intake_api",
      event: "project_resolve_failed",
      phase: "submit",
      level: "warn",
      projectId,
      message: "Projeto não encontrado no registry",
      source: "daemon",
      derivedFrom: "state",
      metadata: {
        registryProjectCount: registryCount,
        resolveMatch: resolved.match,
      },
    });
    const hint =
      registryCount > 0
        ? "O projectId pode estar desatualizado. Atualize a lista (GET /projects) ou reinicie o daemon para reconciliar o registo."
        : "Nenhum projeto no registo. Registe o repositório (POST /projects/register) e confirme GET /projects.";
    return preRunFailure(
      {
        code: "project_not_found",
        message: `Projeto não encontrado: ${projectId}`,
        hint,
        receivedProjectId: projectId,
        registryProjectCount: registryCount,
        resolveMatch: resolved.match,
      },
      { projectId },
    );
  }

  const skipLlm = metadata.skipLlm !== false;

  mergeTraceContext({ projectRoot });
  appendRuntimeTrace({
    component: "run_intake_api",
    event: "resolved_paths",
    phase: "submit",
    message: "projectRoot resolvido antes do intake",
    source: "daemon",
    derivedFrom: "artifact",
    projectRoot,
    metadata: {
      skipLlm,
    },
  });

  const setupBossRoot = resolveSetupBossRepoRoot();
  const targetResolved = resolveTargetProjectRoot(projectRoot, {
    setupBossRoot,
    forbidSetupBossRoot: true,
  });

  if (!targetResolved.ok) {
    traceKnowledgeBootstrapFailed({
      projectId,
      projectRoot,
      raw: {
        code: targetResolved.code,
        message: targetResolved.message,
        title: targetResolved.title,
        description: targetResolved.description,
        phase: "knowledge_bootstrap_missing",
      },
      setupBossRoot,
      expectedKnowledgePath: targetResolved.expectedKnowledgePath,
    });
    return preRunFailure(
      {
        code: targetResolved.code,
        message: targetResolved.message,
        title: targetResolved.title,
        description: targetResolved.description,
        phase: "knowledge_bootstrap_missing",
      },
      { projectId, projectRoot },
    );
  }

  const targetProjectRoot = targetResolved.targetProjectRoot;
  projectRoot = targetProjectRoot;
  mergeTraceContext({ projectRoot });

  appendRuntimeTrace({
    component: "run_intake_api",
    event: "knowledge_bootstrap_started",
    phase: "initialization",
    step: "validate_docs_ia",
    message: "knowledge bootstrap validating target project",
    source: "daemon",
    derivedFrom: "state",
    projectRoot: targetProjectRoot,
    metadata: {
      targetProjectRoot,
      setupBossRoot,
      expectedKnowledgePath: targetResolved.expectedKnowledgePath,
    },
  });

  const knowledgeBase = validateProjectKnowledgeBase(targetProjectRoot, {
    setupBossRoot,
    forbidSetupBossRoot: true,
    skipTargetRootGuard: true,
  });
  if (!knowledgeBase.ok) {
    traceKnowledgeBootstrapFailed({
      projectId,
      projectRoot: targetProjectRoot,
      raw: {
        code: knowledgeBase.code,
        message: knowledgeBase.message,
        title: knowledgeBase.title,
        description: knowledgeBase.description,
        relativePath: knowledgeBase.relativePath,
        documentationHint: knowledgeBase.documentationHint,
        phase: knowledgeBase.phase,
        docsIaPath: knowledgeBase.docsIaPath,
        details: knowledgeBase.details,
        wrongFolder: knowledgeBase.wrongFolder,
        missingFiles: knowledgeBase.missingFiles,
        requiredFiles: knowledgeBase.requiredFiles,
        existingFiles: knowledgeBase.existingFiles,
        missingDirectories: knowledgeBase.missingDirectories,
        missingIndexFiles: knowledgeBase.missingIndexFiles,
        requiredDirectories: knowledgeBase.requiredDirectories,
        requiredIndexFiles: knowledgeBase.requiredIndexFiles,
        invalidBootstrapFiles: knowledgeBase.invalidBootstrapFiles,
        allowedBootstrapFiles: knowledgeBase.allowedBootstrapFiles,
        criticalDrift: knowledgeBase.criticalDrift,
        warnings: knowledgeBase.warnings,
        unknownFolders: knowledgeBase.unknownFolders,
        unexpectedRootFiles: knowledgeBase.unexpectedRootFiles,
        duplicatedBootstrapPrompts: knowledgeBase.duplicatedBootstrapPrompts,
        legacyIaPath: knowledgeBase.legacyIaPath,
        driftValid: knowledgeBase.driftValid,
        specVersion: knowledgeBase.specVersion,
        detectedSpecVersion: knowledgeBase.detectedSpecVersion,
        supportedVersions: knowledgeBase.supportedVersions,
        indexPath: knowledgeBase.indexPath,
        matchedFiles: knowledgeBase.matchedFiles,
        ruleIds: knowledgeBase.ruleIds,
        redactedSamples: knowledgeBase.redactedSamples,
        policyWarnings: knowledgeBase.policyWarnings,
        languageScan: knowledgeBase.languageScan,
        secretScan: knowledgeBase.secretScan,
      },
      setupBossRoot,
      expectedKnowledgePath: targetResolved.expectedKnowledgePath,
    });
    return preRunFailure(
      {
        code: knowledgeBase.code,
        message: knowledgeBase.message,
        title: knowledgeBase.title,
        description: knowledgeBase.description,
        relativePath: knowledgeBase.relativePath,
        documentationHint: knowledgeBase.documentationHint,
        phase: knowledgeBase.phase,
        docsIaPath: knowledgeBase.docsIaPath,
        details: knowledgeBase.details,
        wrongFolder: knowledgeBase.wrongFolder,
        missingFiles: knowledgeBase.missingFiles,
        requiredFiles: knowledgeBase.requiredFiles,
        existingFiles: knowledgeBase.existingFiles,
        missingDirectories: knowledgeBase.missingDirectories,
        missingIndexFiles: knowledgeBase.missingIndexFiles,
        requiredDirectories: knowledgeBase.requiredDirectories,
        requiredIndexFiles: knowledgeBase.requiredIndexFiles,
        invalidBootstrapFiles: knowledgeBase.invalidBootstrapFiles,
        allowedBootstrapFiles: knowledgeBase.allowedBootstrapFiles,
        criticalDrift: knowledgeBase.criticalDrift,
        warnings: knowledgeBase.warnings,
        unknownFolders: knowledgeBase.unknownFolders,
        unexpectedRootFiles: knowledgeBase.unexpectedRootFiles,
        duplicatedBootstrapPrompts: knowledgeBase.duplicatedBootstrapPrompts,
        legacyIaPath: knowledgeBase.legacyIaPath,
        driftValid: knowledgeBase.driftValid,
        specVersion: knowledgeBase.specVersion,
        detectedSpecVersion: knowledgeBase.detectedSpecVersion,
        supportedVersions: knowledgeBase.supportedVersions,
        indexPath: knowledgeBase.indexPath,
        matchedFiles: knowledgeBase.matchedFiles,
        ruleIds: knowledgeBase.ruleIds,
        redactedSamples: knowledgeBase.redactedSamples,
        policyWarnings: knowledgeBase.policyWarnings,
        languageScan: knowledgeBase.languageScan,
        secretScan: knowledgeBase.secretScan,
      },
      { projectId, projectRoot: targetProjectRoot },
    );
  }

  appendRuntimeTrace({
    component: "run_intake_api",
    event: "knowledge_bootstrap_ready",
    phase: "initialization",
    step: "validate_docs_ia",
    message: "knowledge bootstrap ready",
    source: "daemon",
    derivedFrom: "state",
    projectRoot: targetProjectRoot,
    metadata: {
      docsIaPath: knowledgeBase.docsIaPath,
      targetProjectRoot,
      setupBossRoot,
      expectedKnowledgePath: targetResolved.expectedKnowledgePath,
      validationSnapshot: knowledgeBase.validationSnapshot ?? null,
    },
  });

  appendRuntimeTrace({
    component: "run_intake_api",
    event: "intake_started",
    phase: "intake",
    step: "execute_intake",
    message: "executeIntake iniciado",
    source: "daemon",
    derivedFrom: "state",
    projectRoot,
  });

  const intake = await executeIntake({
    projectArg: targetProjectRoot,
    taskArg: taskText,
    cwd: repoRoot,
    skipLlm,
  });

  if (!intake.ok) {
    appendRuntimeTrace({
      component: "run_intake_api",
      event: "intake_failed",
      phase: "intake",
      level: "error",
      message: intake.error?.message || "Intake falhou",
      source: "daemon",
      derivedFrom: "state",
      error: intake.error ? safeSerializeError(intake.error) : null,
      metadata: { code: intake.error?.code || "intake_failed" },
    });
    return {
      ok: false,
      error: intake.error || { code: "intake_failed", message: "Intake falhou." },
    };
  }

  const runId = intake.runId;
  mergeTraceContext({ runId, outputDir: intake.outputDir });
  appendRuntimeTrace({
    component: "run_intake_api",
    event: "resolved_paths",
    phase: "intake",
    message: "outputDir e índice de run disponíveis pós-intake",
    outputDir: intake.outputDir,
    projectRoot,
    runId,
    source: "daemon",
    derivedFrom: "artifact",
    metadata: {
      runIndexPath: resolveRunIndexPath(runId),
      outputDirRelativeToProject: path
        .relative(projectRoot, intake.outputDir)
        .replace(/\\/g, "/"),
    },
  });

  appendRuntimeTrace({
    component: "run_intake_api",
    event: "artifacts_phase1_written_checkpoint",
    phase: "intake",
    step: "post_intake",
    message: "Intake concluiu com artefactos declarados",
    outputDir: intake.outputDir,
    runId,
    source: "daemon",
    derivedFrom: "artifact",
    metadata: {
      principalArtifacts: Array.isArray(intake.artifacts)
        ? intake.artifacts.map((a) => (a && a.name ? a.name : a))
        : [],
      phase1Status: intake.phase1Status,
    },
  });

  auditRunOutputArtifacts(intake.outputDir, { phase: "post_intake" });

  const workspaceRunId =
    metadata.workspaceRunId != null ? String(metadata.workspaceRunId).trim() : "";
  const workspaceId =
    metadata.workspaceId != null ? String(metadata.workspaceId).trim() : "";
  const workspaceProjectIds = Array.isArray(metadata.workspaceProjectIds)
    ? metadata.workspaceProjectIds
        .map((id) => (id != null ? String(id).trim() : ""))
        .filter(Boolean)
    : Array.isArray(metadata.projectIds)
      ? metadata.projectIds
          .map((id) => (id != null ? String(id).trim() : ""))
          .filter(Boolean)
      : [];
  if (workspaceRunId) {
    const linkRes = patchRunContextWorkspaceLink(intake.outputDir, {
      workspaceRunId,
      workspaceId,
      planningProjectId: projectId,
      projectIds: workspaceProjectIds,
    });
    if (linkRes.ok) {
      try {
        writeRunIndex({
          runId,
          projectRoot,
          outputDir: intake.outputDir,
          run_type: intake.runType,
          workspaceRunId,
        });
      } catch (_) {
        /* índice opcional */
      }
    }
  }

  const createdAt = new Date().toISOString();

  appendRuntimeTrace({
    component: "run_intake_api",
    event: "clarification_started",
    phase: "clarification",
    step: "execute_clarification_passive",
    message: "executeClarification (passivo) iniciado",
    outputDir: intake.outputDir,
    runId,
    source: "daemon",
    derivedFrom: "state",
  });

  const clarify = await executeClarification({
    runOrPath: runId,
    cwd: repoRoot,
    skipLlm,
  });

  const phase2Status = clarify.ok ? String(clarify.phase2Status || "") : null;
  let initialState = deriveInitialState(phase2Status, clarify.ok);
  const clarificationRequired =
    initialState === "clarification_required" ||
    initialState === "clarification_ready";

  if (!clarify.ok && clarify.error?.code === "CLARIFY_LLM_REQUIRED") {
    initialState = "intake_running";
  }

  appendRuntimeTrace({
    component: "run_intake_api",
    event: "clarification_pass_completed",
    phase: "clarification",
    message: clarify.ok
      ? `Clarificação passiva OK (${phase2Status || "?"})`
      : `Clarificação falhou: ${clarify.error?.code || "?"}`,
    outputDir: intake.outputDir,
    runId,
    source: "daemon",
    derivedFrom: clarify.ok ? "artifact" : "state",
    level: clarify.ok ? "info" : "warn",
    metadata: {
      phase2Status,
      questionsCount: clarify.questionsCount,
      clarifyCode: clarify.ok ? null : clarify.error?.code,
    },
    error: clarify.ok ? null : safeSerializeError(clarify.error),
  });

  auditRunOutputArtifacts(intake.outputDir, { phase: "post_clarify" });

  const inboxDir = path.join(projectRoot, ".setup-boss", "inbox");
  fs.mkdirSync(inboxDir, { recursive: true });
  const taskFileName = `${runId}-task.md`;
  const taskAbs = path.join(inboxDir, taskFileName);
  fs.writeFileSync(taskAbs, taskText, "utf-8");

  const projectArgRel = path
    .relative(repoRoot, projectRoot)
    .replace(/\\/g, "/") || ".";
  const taskArgRel = path.relative(repoRoot, taskAbs).replace(/\\/g, "/");

  const uiPhase = uiPhaseForInitialState(initialState);
  const uiState = deriveUiStateAfterIntake(
    initialState,
    phase2Status,
    clarify.ok ? clarify.questionsCount ?? 0 : 0,
  );

  try {
    const logger = require("../../runtime/logger");
    logger.info("runtime.run_intake.dispatch_meta", {
      runId,
      initialState,
      phase2Status,
      questionsCount: clarify.ok ? clarify.questionsCount ?? 0 : null,
      uiPhase,
      uiState,
      classification: intake.classification,
      clarificationOk: clarify.ok,
      outputDir: intake.outputDir,
    });
  } catch (_) {
    /* */
  }

  let job;
  try {
    job = enqueueJob({
      projectRoot,
      taskArg: taskArgRel,
      projectArg: projectArgRel,
      metadata: {
        ...metadata,
        runId,
        intakeTaskText: taskText,
        source: metadata.source || "mission_control",
        initialState,
        uiPhase,
        uiState,
        classification: intake.classification,
      },
    });
    updateJob(null, job.id, (j) => ({
      ...j,
      runId,
      status: "completed",
      finishedAt: createdAt,
      metadata: {
        ...(j.metadata && typeof j.metadata === "object" ? j.metadata : {}),
        runId,
        initialState,
        uiPhase,
        uiState,
      },
    }));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Falha ao registar job.";
    appendRuntimeTrace({
      component: "run_intake_api",
      event: "job_enqueue_failed",
      phase: "queue",
      level: "error",
      message: msg,
      runId,
      outputDir: intake.outputDir,
      source: "daemon",
      derivedFrom: "state",
      error: safeSerializeError(e),
    });
    return {
      ok: false,
      error: { code: "job_enqueue_failed", message: msg },
      runId,
    };
  }

  mergeTraceContext({ jobId: job.id });
  appendRuntimeTrace({
    component: "run_intake_api",
    event: "job_enqueued_checkpoint",
    phase: "queue",
    message: "Job registado na fila (mission_control)",
    jobId: job.id,
    runId,
    outputDir: intake.outputDir,
    projectRoot,
    source: "daemon",
    derivedFrom: "state",
  });

  try {
    upsertProjectFromUsage({
      projectId: job.projectId || projectId,
      projectRoot,
      lastJobId: job.id,
      metadata: { lastRunId: runId },
    });
  } catch {
    /* */
  }

  try {
    emitRuntimeEvent({
      type: "run_created",
      jobId: job.id,
      runId,
      data: {
        initialState,
        clarificationRequired,
        projectId: job.projectId || projectId,
        classification: intake.classification,
      },
    });
    emitRuntimeEvent({
      type: "intake_completed",
      jobId: job.id,
      runId,
      data: { phase1Status: intake.phase1Status, classification: intake.classification },
    });
    if (clarify.ok) {
      const qc = Number(clarify.questionsCount) || 0;
      const p2Emitted = String(phase2Status || "");
      if (p2Emitted === "questions_generated" && qc > 0) {
        emitRuntimeEvent({
          type: "clarification_questions_generated",
          jobId: job.id,
          runId,
          projectId: job.projectId || projectId,
          projectRoot,
          data: {
            phase2Status: p2Emitted,
            questionsCount: qc,
            source:
              clarify.clarificationQuestionsSource != null
                ? String(clarify.clarificationQuestionsSource)
                : null,
            reason:
              clarify.clarificationQuestionsReason != null
                ? String(clarify.clarificationQuestionsReason)
                : null,
            projectId: job.projectId || projectId,
            projectRoot,
          },
        });
      } else {
        emitRuntimeEvent({
          type: "clarification_initialized",
          jobId: job.id,
          runId,
          data: { phase2Status, questionsCount: clarify.questionsCount },
        });
      }
    }
  } catch (e) {
    appendRuntimeTrace({
      component: "run_intake_api",
      event: "runtime_event_emit_exception",
      phase: "events",
      level: "warn",
      message: e && e.message ? String(e.message) : "emitRuntimeEvent falhou",
      jobId: job.id,
      runId,
      source: "daemon",
      derivedFrom: "unknown",
      error: safeSerializeError(e),
    });
  }

  auditDaemonArtifacts(resolveDataDirAbs(), { phase: "post_run_create" });

  appendRuntimeTrace({
    component: "run_intake_api",
    event: "run_created_checkpoint",
    phase: "submit",
    message: "createRunFromTask concluído com sucesso",
    jobId: job.id,
    runId,
    outputDir: intake.outputDir,
    projectRoot,
    source: "daemon",
    derivedFrom: "state",
    metadata: {
      initialState,
      clarificationRequired,
    },
  });

  return {
    ok: true,
    data: {
      runId,
      jobId: job.id,
      initialState,
      clarificationRequired,
      createdAt,
      phase2Status,
      classification: intake.classification,
      uiPhase,
      uiState,
    },
  };
}

module.exports = {
  createRunFromTask,
  deriveInitialState,
  MIN_TASK_CHARS,
};
