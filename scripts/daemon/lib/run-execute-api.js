"use strict";

const fs = require("fs");
const path = require("path");

const { resolveOutputDir, resolveRunIndexPath } = require("../../../core/run-resolver");
const { loadApprovalState } = require("../../runtime/clarification/approval");
const { collectStrategyForRun } = require("./run-strategy");
const { collectExecutionForRun } = require("./run-execution");
const { enqueueJob, updateJob, loadQueueUnsafe } = require("./queue-store");
const { emitRuntimeEvent } = require("./runtime-events");
const { readDaemonStatus } = require("./daemon-status");
const { findProjectRecord } = require("./project-registry");
const { readRunGitState } = require("./run-git-branch-api");
const { validateGitExecuteGate } = require("../../../core/validate-git-execute-gate");

const JOB_KIND_RUN_EXECUTE = "run_execute";
const ORCHESTRATION_STATE_FILE = "orchestration-state.json";

const ACTIVE_JOB_STATUSES = new Set(["pending", "running", "cancelling"]);

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} patch
 */
function writeOrchestrationStateFile(outputDir, patch) {
  const fp = path.join(outputDir, ORCHESTRATION_STATE_FILE);
  const prev = safeReadJson(fp) || {};
  const next = {
    schema_version: "1.0.0",
    ...prev,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} orchPatch
 */
function mergeOrchestrationIntoRunContext(outputDir, orchPatch) {
  const ctxPath = path.join(outputDir, "run-context.json");
  /** @type {Record<string, unknown>} */
  let doc = safeReadJson(ctxPath) || {};
  const orch =
    doc.orchestration && typeof doc.orchestration === "object" && !Array.isArray(doc.orchestration)
      ? { .../** @type {Record<string, unknown>} */ (doc.orchestration) }
      : {};
  doc.orchestration = { ...orch, ...orchPatch };
  if (!doc.phase4 || typeof doc.phase4 !== "object") {
    doc.phase4 = { status: "starting" };
  } else {
    const p4 = /** @type {Record<string, unknown>} */ (doc.phase4);
    if (!p4.status || String(p4.status) === "idle") {
      p4.status = "starting";
    }
    doc.phase4 = p4;
  }
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(ctxPath, JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * @param {string} runId
 * @param {import("./queue-store").Job[]} [jobs]
 */
function findActiveExecutionJob(runId, jobs) {
  const list = jobs || loadQueueUnsafe().jobs;
  const rid = String(runId || "").trim();
  for (const j of list) {
    if (!j || !ACTIVE_JOB_STATUSES.has(String(j.status || ""))) continue;
    const meta =
      j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
        ? j.metadata
        : {};
    const kind = String(meta.jobKind || meta.job_kind || "");
    const execRun = meta.executionRunId != null ? String(meta.executionRunId) : "";
    const metaRun = meta.runId != null ? String(meta.runId) : "";
    if (kind === JOB_KIND_RUN_EXECUTE && (execRun === rid || metaRun === rid)) {
      return j;
    }
    if (j.runId && String(j.runId) === rid && j.status === "running") {
      return j;
    }
  }
  return null;
}

/**
 * @param {string} outputDir
 */
function readOrchestrationFromDisk(outputDir) {
  const file = safeReadJson(path.join(outputDir, ORCHESTRATION_STATE_FILE));
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  const ctxOrch =
    ctx &&
    ctx.orchestration &&
    typeof ctx.orchestration === "object" &&
    !Array.isArray(ctx.orchestration)
      ? ctx.orchestration
      : null;
  return { file, ctxOrch };
}

/**
 * @param {string} runId
 */
function resolveProjectRootForRun(runId) {
  const indexPath = resolveRunIndexPath(runId);
  if (fs.existsSync(indexPath)) {
    const idx = safeReadJson(indexPath);
    if (idx && idx.project_root) {
      return path.resolve(String(idx.project_root));
    }
  }
  return null;
}

/**
 * Deriva executionState UI a partir de job + lifecycle.
 * @param {string} orchestrationState
 * @param {string|null} lifecyclePhase
 */
function mapExecutionState(orchestrationState, lifecyclePhase) {
  const orch = String(orchestrationState || "").toLowerCase();
  const life = String(lifecyclePhase || "").toLowerCase();
  if (life === "execution_completed") return "execution_completed";
  if (life === "execution_failed") return "execution_failed";
  if (life === "execution_blocked") return "execution_blocked";
  if (life.includes("review")) return "execution_reviewing";
  if (life.includes("correction")) return "execution_correcting";
  if (life.includes("recovery")) return "execution_recovering";
  if (life === "execution_running" || orch === "execution_running") return "execution_running";
  if (orch === "execution_starting" || orch === "queued") return "execution_starting";
  if (orch === "ready_for_execution") return "ready_for_execution";
  if (orch === "failed") return "execution_failed";
  if (orch === "completed") return "execution_completed";
  return "ready_for_execution";
}

/**
 * @param {{
 *   runId: string,
 *   outputDir: string,
 *   jobs?: import("./queue-store").Job[],
 *   daemonSnapshot?: { running?: boolean, busy?: boolean }|null,
 * }} input
 */
function validateExecuteReadiness(input) {
  const runId = String(input.runId || "").trim();
  const outputDir = path.resolve(String(input.outputDir || ""));
  const jobs = input.jobs || loadQueueUnsafe().jobs;

  const snap = input.daemonSnapshot || {};
  const diskStatus = readDaemonStatus();
  const daemonRunning =
    snap.running === true ||
    (snap.running !== false &&
      diskStatus != null &&
      diskStatus.running !== false);

  if (!daemonRunning) {
    return {
      ok: false,
      code: "runtime_offline",
      message: "Runtime offline — daemon não está activo.",
    };
  }

  const active = findActiveExecutionJob(runId, jobs);
  if (active) {
    return {
      ok: false,
      code: "execution_already_active",
      message: `Orchestration activa (job ${active.id}, estado ${active.status}).`,
      activeJobId: active.id,
    };
  }

  const approval = loadApprovalState(outputDir);
  if (!approval.ok || approval.doc.status !== "approved") {
    return {
      ok: false,
      code: "clarification_not_approved",
      message: "Execução bloqueada — clarificação não aprovada.",
    };
  }

  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  const phase2 =
    ctx && ctx.phase2 && typeof ctx.phase2 === "object" ? ctx.phase2 : null;
  const phase2Status =
    phase2 && phase2.status != null ? String(phase2.status) : "";

  if (phase2Status !== "ready_for_execution") {
    const pending =
      phase2Status === "plan_refined" ||
      phase2Status === "answers_recorded" ||
      phase2Status === "questions_generated";
    return {
      ok: false,
      code: pending ? "clarification_pending" : "clarification_not_ready",
      message: pending
        ? "Clarificação pendente — aprove o plano antes de executar."
        : `Phase2 não está ready_for_execution (actual: ${phase2Status || "—"}).`,
    };
  }

  const strategyBundle = collectStrategyForRun(runId);
  if (strategyBundle.ok && strategyBundle.data) {
    const sum = strategyBundle.data.summary;
    const p3 = sum && sum.phase3Status != null ? String(sum.phase3Status) : "";
    const readiness =
      sum && sum.operationalReadiness != null
        ? String(sum.operationalReadiness)
        : "";
    const phase3 =
      ctx && ctx.phase3 && typeof ctx.phase3 === "object" ? ctx.phase3 : null;
    const phase3Readiness =
      phase3 &&
      phase3.readiness &&
      typeof phase3.readiness === "object" &&
      phase3.readiness.status != null
        ? String(phase3.readiness.status)
        : "";
    const strategyPhaseReady =
      p3 === "ready_for_execution" ||
      p3 === "strategy_ready" ||
      phase3Readiness === "strategy_ready" ||
      (readiness === "ready" && (sum?.subtaskCount ?? 0) > 0);
    const needsStrategy =
      p3 && !strategyPhaseReady && strategyBundle.data.source !== "unsupported";
    if (needsStrategy) {
      return {
        ok: false,
        code: "strategy_not_ready",
        message: `Strategy não pronta (phase3=${p3}).`,
      };
    }
    if (
      strategyBundle.data.source === "runtime" &&
      readiness === "not_ready" &&
      (sum?.subtaskCount ?? 0) > 0
    ) {
      return {
        ok: false,
        code: "strategy_not_ready",
        message: "Strategy operational readiness not_ready.",
      };
    }
  }

  const execBundle = collectExecutionForRun(runId);
  if (execBundle.ok && execBundle.data?.summary?.lifecycle?.phase === "execution_running") {
    const { file, ctxOrch } = readOrchestrationFromDisk(outputDir);
    const orchState = String(
      (file && file.state) || (ctxOrch && ctxOrch.state) || "execution_running",
    );
    if (orchState !== "completed" && orchState !== "failed") {
      return {
        ok: false,
        code: "execution_already_active",
        message: "Execução já em curso nesta corrida.",
      };
    }
  }

  const projectRoot = resolveProjectRootForRun(runId);
  if (projectRoot) {
    const gitState = readRunGitState(outputDir);
    const gitGate = validateGitExecuteGate({ projectRoot, gitState });
    if (!gitGate.ok) {
      return gitGate;
    }
  }

  return { ok: true };
}

/**
 * Disponibilidade de execução (paridade server-side com guards do Mission Control).
 *
 * @param {Parameters<typeof validateExecuteReadiness>[0]} input
 * @returns {{ canExecute: boolean, reason: string|null, message: string|null, degraded: boolean }}
 */
function deriveExecuteAvailability(input) {
  const readiness = validateExecuteReadiness(input);
  if (!readiness.ok) {
    return {
      canExecute: false,
      reason: readiness.code || "execute_blocked",
      message: readiness.message || null,
      degraded: readiness.code === "runtime_offline",
    };
  }
  return {
    canExecute: true,
    reason: null,
    message: null,
    degraded: false,
  };
}

/**
 * @param {string} runId
 * @param {string} outputDir
 */
function collectOrchestrationBootstrap(runId, outputDir) {
  const { file, ctxOrch } = readOrchestrationFromDisk(outputDir);
  const execBundle = collectExecutionForRun(runId);
  const lifecyclePhase =
    execBundle.ok && execBundle.data?.summary?.lifecycle?.phase
      ? String(execBundle.data.summary.lifecycle.phase)
      : null;

  const orchestrationState = String(
    (file && file.state) ||
      (ctxOrch && ctxOrch.state) ||
      "ready_for_execution",
  );
  const executionState = mapExecutionState(orchestrationState, lifecyclePhase);
  const startedAt =
    (file && file.started_at != null ? String(file.started_at) : null) ||
    (ctxOrch && ctxOrch.started_at != null ? String(ctxOrch.started_at) : null) ||
    (execBundle.ok && execBundle.data?.summary?.lifecycle?.startedAt
      ? String(execBundle.data.summary.lifecycle.startedAt)
      : null);

  const workerId =
    file && file.worker_id != null
      ? String(file.worker_id)
      : ctxOrch && ctxOrch.worker_id != null
        ? String(ctxOrch.worker_id)
        : null;

  const currentPhase =
    lifecyclePhase ||
    (executionState === "execution_starting" ? "execution" : executionState);

  const recoveryStatus =
    file && file.recovery_status != null
      ? String(file.recovery_status)
      : ctxOrch && ctxOrch.recovery_status != null
        ? String(ctxOrch.recovery_status)
        : null;

  const recoveryReasons = [];
  if (file && Array.isArray(file.recovery_reasons)) {
    for (const r of file.recovery_reasons) recoveryReasons.push(String(r));
  } else if (ctxOrch && Array.isArray(ctxOrch.recovery_reasons)) {
    for (const r of ctxOrch.recovery_reasons) recoveryReasons.push(String(r));
  }

  return {
    runId,
    executionState,
    orchestrationState,
    startedAt,
    workerId,
    currentPhase,
    jobId:
      file && file.job_id != null
        ? String(file.job_id)
        : ctxOrch && ctxOrch.job_id != null
          ? String(ctxOrch.job_id)
          : null,
    idempotent: Boolean(file && file.idempotent === true),
    recoveryStatus,
    recoveryReasons,
  };
}

/**
 * @param {{
 *   repoRoot: string,
 *   runId: string,
 *   sourceJob?: object|null,
 *   daemonSnapshot?: { running?: boolean, busy?: boolean, workerId?: string }|null,
 *   force?: boolean,
 * }} input
 */
async function triggerRunExecution(input) {
  const repoRoot = path.resolve(String(input.repoRoot || ""));
  const runId = String(input.runId || "").trim();
  const force = input.force === true;

  if (!runId) {
    return {
      ok: false,
      code: "run_id_required",
      message: "runId é obrigatório.",
    };
  }

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: e && e.message ? String(e.message) : "Output indisponível.",
    };
  }

  const jobs = loadQueueUnsafe().jobs;
  const readiness = validateExecuteReadiness({
    runId,
    outputDir,
    jobs,
    daemonSnapshot: input.daemonSnapshot,
  });

  if (!readiness.ok && !force) {
    return readiness;
  }

  const active = findActiveExecutionJob(runId, jobs);
  if (active && !force) {
    const boot = collectOrchestrationBootstrap(runId, outputDir);
    return {
      ok: true,
      idempotent: true,
      message: "Execução já enfileirada ou activa.",
      data: {
        ...boot,
        jobId: active.id,
        orchestrationState: "execution_starting",
        executionState: "execution_starting",
      },
    };
  }

  const existing = readOrchestrationFromDisk(outputDir);
  const prevState =
    existing.file && existing.file.state != null
      ? String(existing.file.state)
      : "";
  if (
    !force &&
    (prevState === "execution_running" ||
      prevState === "execution_starting" ||
      prevState === "queued")
  ) {
    const boot = collectOrchestrationBootstrap(runId, outputDir);
    return {
      ok: true,
      idempotent: true,
      message: "Orchestration já iniciada para esta corrida.",
      data: boot,
    };
  }

  let projectRoot = resolveProjectRootForRun(runId);
  const sourceJob = input.sourceJob || null;
  if (!projectRoot && sourceJob && sourceJob.projectRoot) {
    projectRoot = path.resolve(String(sourceJob.projectRoot));
  }
  if (!projectRoot) {
    return {
      ok: false,
      code: "project_not_found",
      message: "Project root não resolvido para a corrida.",
    };
  }

  const projectArgRel = path.relative(repoRoot, projectRoot).replace(/\\/g, "/") || ".";
  const startedAt = new Date().toISOString();
  const orchestrationState = "execution_starting";
  const executionState = "execution_starting";

  let job;
  try {
    job = enqueueJob({
      projectRoot,
      taskArg: `execute:${runId}`,
      projectArg: projectArgRel,
      metadata: {
        runId,
        executionRunId: runId,
        jobKind: JOB_KIND_RUN_EXECUTE,
        source: "mission_control_execute",
        uiPhase: "execution",
        uiState: "running",
        orchestrationState,
        executionState,
        triggeredAt: startedAt,
      },
    });
  } catch (e) {
    return {
      ok: false,
      code: "queue_unavailable",
      message: e && e.message ? String(e.message) : "Falha ao enfileirar execução.",
    };
  }

  updateJob(null, job.id, (j) => ({
    ...j,
    runId,
    metadata: {
      ...(j.metadata && typeof j.metadata === "object" ? j.metadata : {}),
      runId,
      executionRunId: runId,
      jobKind: JOB_KIND_RUN_EXECUTE,
    },
  }));

  const workerId =
    input.daemonSnapshot &&
    typeof input.daemonSnapshot.workerId === "string" &&
    input.daemonSnapshot.workerId.trim()
      ? input.daemonSnapshot.workerId.trim()
      : null;

  writeOrchestrationStateFile(outputDir, {
    state: orchestrationState,
    job_id: job.id,
    started_at: startedAt,
    worker_id: workerId,
    source: "mission_control",
    idempotent: false,
  });

  mergeOrchestrationIntoRunContext(outputDir, {
    state: orchestrationState,
    job_id: job.id,
    started_at: startedAt,
    worker_id: workerId,
  });

  try {
    const rec = findProjectRecord(job.projectId || "");
    if (rec) {
      /* registry já tem project */
    }
  } catch {
    /* */
  }

  try {
    emitRuntimeEvent({
      type: "execution_triggered",
      jobId: job.id,
      runId,
      data: {
        executionState,
        orchestrationState,
        startedAt,
        workerId,
        currentPhase: "execution",
      },
    });
    emitRuntimeEvent({
      type: "execution_started",
      jobId: job.id,
      runId,
      data: {
        message: "Orchestration de execução iniciada.",
        orchestrationState,
      },
    });
  } catch {
    /* */
  }

  return {
    ok: true,
    idempotent: false,
    message: "Execução enfileirada — orchestration a iniciar.",
    data: {
      runId,
      jobId: job.id,
      executionState,
      orchestrationState,
      startedAt,
      workerId,
      currentPhase: "execution",
    },
  };
}

module.exports = {
  JOB_KIND_RUN_EXECUTE,
  validateExecuteReadiness,
  deriveExecuteAvailability,
  triggerRunExecution,
  collectOrchestrationBootstrap,
  findActiveExecutionJob,
  mapExecutionState,
  readOrchestrationFromDisk,
};
