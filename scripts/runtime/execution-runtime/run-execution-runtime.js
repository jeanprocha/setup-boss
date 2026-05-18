"use strict";

const fs = require("fs");
const path = require("path");

const {
  loadHandoffAndOrderForExecution,
  buildExecutionSessionDocument,
} = require("./build-execution-session");
const { validateExecutionRuntimeResult } = require("./validate-execution-runtime");
const {
  subtaskExecutionFilename,
  orderedSubtaskRows,
  readStrategySubtaskSummary,
  buildDefaultSubtaskExecutionDoc,
  isPreservableSubtaskExecutionDoc,
  computeSessionAggregatesFromSubtasks,
  EXECUTION_SUBTASKS_REL,
} = require("./build-subtask-execution-state");
const { buildArchitectHandoffs } = require("./build-architect-handoff");
const {
  hasRunnableHandoffReady,
  runSingleSubtaskExecutorMvp,
  sumModifiedFilesFromResults,
  executionResultFilename,
} = require("./run-subtask-executor");
const { runPatchValidationPhase, patchValidationFilename } = require("./validate-execution-patch");
const { runExecutionReviewPhase } = require("./run-execution-review");
const {
  hasCorrectionWorkPending,
  runCorrectionRuntimePhase,
} = require("./run-correction-runtime");
const {
  prepareLifecycleAtRuntimeStart,
  saveExecutionCheckpoint,
  finalizeLifecycleDocument,
  summarizeLifecycleFromEvents,
  readLifecycleDocument,
  LIFECYCLE_REL,
  pickResumeTargetSubtaskId,
} = require("./manage-execution-lifecycle");
const {
  initRollbackStateFile,
  rollbackStatePath,
  summarizeRollbackFromEvents,
  ROLLBACK_DIRNAME,
  ROLLBACK_STATE_FILENAME,
  ensureRollbackContractMvp,
} = require("./manage-execution-rollback");
const { buildExecutionObservability, OBSERVABILITY_FILE } = require("./build-execution-observability");
const { writeRuntimeIntegrityReport, INTEGRITY_REL } = require("./build-runtime-integrity-report");
const { MVP_EXECUTION_PHASE } = require("./execution-mvp-contract");

const EXECUTION_DIRNAME = "execution";
const SESSION_FILE = "execution-session.json";
const DIAGNOSTICS_FILE = "execution-diagnostics.json";
const RUN_CONTEXT_FILE = "run-context.json";

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
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
 * @param {string} outputDirAbs
 * @param {string} [phase4Status]
 */
function mergePhase4IntoRunContext(outputDirAbs, phase4Status) {
  const p = path.join(outputDirAbs, RUN_CONTEXT_FILE);
  /** @type {Record<string, unknown>} */
  let doc = {};
  if (fs.existsSync(p)) {
    const prev = readJsonObject(p);
    if (prev) doc = prev;
  }
  doc.phase4 = {
    status: phase4Status != null ? String(phase4Status) : "executor_mvp_idle",
  };
  fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * @param {string} runId
 * @param {Record<string, unknown>} sum
 * @param {{ type: string, recorded_at: string, payload?: Record<string, unknown> }[]} events
 * @param {Record<string, unknown>} [correctionSummary]
 * @param {Record<string, unknown>} [lifecycleSummary]
 * @param {Record<string, unknown>} [rollbackSummary]
 * @returns {Record<string, unknown>}
 */
function buildDiagnosticsDocument(runId, sum, events, correctionSummary, lifecycleSummary, rollbackSummary) {
  const total = Number(sum.total_subtasks != null ? sum.total_subtasks : sum.subtask_count) || 0;
  const pendingBucket = Number(sum.pending_subtasks != null ? sum.pending_subtasks : 0);
  /** @type {Record<string, unknown>} */
  const summary = {
    status: sum.status,
    subtask_count: sum.subtask_count,
    total_subtasks: total,
    pending_subtasks: pendingBucket,
    completed_subtasks: Number(sum.completed_subtasks != null ? sum.completed_subtasks : 0),
    failed_subtasks: Number(sum.failed_subtasks != null ? sum.failed_subtasks : 0),
    execution_mode: sum.execution_mode,
    execution_state: sum.execution_state,
    last_event_at:
      events.length && events[events.length - 1].recorded_at
        ? events[events.length - 1].recorded_at
        : null,
  };
  if (sum.prepared_subtasks != null) {
    summary.prepared_subtasks = Number(sum.prepared_subtasks);
  }
  if (sum.handoff_ready_subtasks != null) {
    summary.handoff_ready_subtasks = Number(sum.handoff_ready_subtasks);
  }
  if (sum.running_subtasks != null) {
    summary.running_subtasks = Number(sum.running_subtasks);
  }
  if (sum.execution_completed_subtasks != null) {
    summary.execution_completed_subtasks = Number(sum.execution_completed_subtasks);
  }
  if (sum.execution_failed_subtasks != null) {
    summary.execution_failed_subtasks = Number(sum.execution_failed_subtasks);
  }
  if (sum.modified_files_total != null) {
    summary.modified_files_total = Number(sum.modified_files_total);
  }
  if (sum.validated_subtasks != null) {
    summary.validated_subtasks = Number(sum.validated_subtasks);
  }
  if (sum.failed_validations != null) {
    summary.failed_validations = Number(sum.failed_validations);
  }
  if (sum.warnings_total != null) {
    summary.warnings_total = Number(sum.warnings_total);
  }
  if (sum.errors_total != null) {
    summary.errors_total = Number(sum.errors_total);
  }
  if (sum.approved_subtasks != null) {
    summary.approved_subtasks = Number(sum.approved_subtasks);
  }
  if (sum.rejected_subtasks != null) {
    summary.rejected_subtasks = Number(sum.rejected_subtasks);
  }
  if (sum.blocked_subtasks != null) {
    summary.blocked_subtasks = Number(sum.blocked_subtasks);
  }
  if (sum.review_failures != null) {
    summary.review_failures = Number(sum.review_failures);
  }
  if (correctionSummary) {
    for (const k of [
      "corrected_subtasks",
      "correction_failures",
      "retry_exhausted",
      "correction_attempts_total",
    ]) {
      if (correctionSummary[k] != null) {
        summary[k] = Number(correctionSummary[k]);
      }
    }
  }
  if (lifecycleSummary) {
    for (const k of ["recovery_count", "interrupted_sessions", "resumed_sessions", "checkpoints_saved"]) {
      if (lifecycleSummary[k] != null) {
        summary[k] = Number(lifecycleSummary[k]);
      }
    }
  }
  if (rollbackSummary) {
    for (const k of [
      "rollback_operations",
      "rollback_failures",
      "snapshots_created",
      "restored_files_total",
      "rollback_enabled",
    ]) {
      if (rollbackSummary[k] != null) {
        summary[k] =
          k === "rollback_enabled" ? Boolean(rollbackSummary[k]) : Number(rollbackSummary[k]);
      }
    }
  }
  return {
    version: 1,
    run_id: String(runId || ""),
    events,
    summary,
  };
}

/**
 * @param {string} id
 * @param {string[]} subtaskRels
 */
function strategyRelForSubtaskId(id, subtaskRels) {
  const suffix = `/${id}.json`;
  const hit = subtaskRels.find((rel) => String(rel).replace(/\\/g, "/").endsWith(suffix));
  return hit != null ? String(hit).replace(/\\/g, "/") : `strategy/subtasks/${id}.json`;
}

/**
 * @param {{
 *   execDir: string,
 *   outputDirAbs: string,
 *   loaded: { orderDoc: Record<string, unknown>, subtaskRels: string[] },
 *   force: boolean,
 *   events: { type: string, recorded_at: string, payload?: Record<string, unknown> }[],
 *   iso: () => string,
 * }} p
 * @returns {{ artifacts: string[], orderedForSession: { subtask_id: string, doc: Record<string, unknown> }[] }}
 */
function materializeSubtaskExecutionStates(p) {
  const { execDir, outputDirAbs, loaded, force, events, iso } = p;
  const subtasksDir = path.join(execDir, "subtasks");
  if (force && fs.existsSync(subtasksDir)) {
    fs.rmSync(subtasksDir, { recursive: true, force: true });
  }
  fs.mkdirSync(subtasksDir, { recursive: true });

  const rows = orderedSubtaskRows(loaded.orderDoc);
  /** @type {string[]} */
  const artifacts = [];
  /** @type {{ subtask_id: string, doc: Record<string, unknown> }[]} */
  const orderedForSession = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const expectedPos = idx + 1;
    const position = expectedPos;
    const strategyRel = strategyRelForSubtaskId(row.subtask_id, loaded.subtaskRels);
    const st = readStrategySubtaskSummary(outputDirAbs, strategyRel);
    const title = st.title || row.title || "";
    const shared =
      st.shared_context_refs.length > 0
        ? st.shared_context_refs
        : /** @type {string[]} */ ([]);

    const expected = {
      subtask_id: row.subtask_id,
      position,
      depends_on: row.depends_on,
    };

    const fn = subtaskExecutionFilename(row.subtask_id);
    const fp = path.join(subtasksDir, fn);
    let doc = readJsonObject(fp);

    if (!force && doc && isPreservableSubtaskExecutionDoc(doc, expected)) {
      /* manter ficheiro e timestamps */
    } else {
      const now = iso();
      doc = buildDefaultSubtaskExecutionDoc({
        subtask_id: row.subtask_id,
        title,
        position,
        depends_on: row.depends_on,
        shared_context_refs: shared,
        now,
      });
      fs.writeFileSync(fp, JSON.stringify(doc, null, 2), "utf-8");
      events.push({
        type: "subtask_execution_initialized",
        recorded_at: iso(),
        payload: {
          subtask_id: row.subtask_id,
          position,
          status: String(doc.status || "pending"),
        },
      });
      events.push({
        type: "subtask_execution_state_created",
        recorded_at: iso(),
        payload: {
          subtask_id: row.subtask_id,
          position,
          status: String(doc.status || "pending"),
        },
      });
    }

    if (doc) {
      orderedForSession.push({ subtask_id: row.subtask_id, doc: /** @type {Record<string, unknown>} */ (doc) });
      artifacts.push(path.join(EXECUTION_SUBTASKS_REL, fn).replace(/\\/g, "/"));
    }
  }

  return { artifacts, orderedForSession };
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   runId: string,
 *   force?: boolean,
 *   resume?: boolean,
 * }} p
 * @returns {{
 *   ok: true,
 *   skipped?: boolean,
 *   artifacts: string[],
 * } | { ok: false, error: { code: string, message: string } }}
 */
function runExecutionRuntimeBase(p) {
  const outputDirAbs = path.resolve(String(p.outputDirAbs || ""));
  const runId = String(p.runId || path.basename(outputDirAbs));
  const force = p.force === true;
  const resume = p.resume === true;

  const execDir = path.join(outputDirAbs, EXECUTION_DIRNAME);
  const sessionPath = path.join(execDir, SESSION_FILE);
  const diagPath = path.join(execDir, DIAGNOSTICS_FILE);

  /** @type {{ type: string, recorded_at: string, payload?: Record<string, unknown> }[]} */
  const events = [];
  const iso = () => new Date().toISOString();

  if (!force && !resume && fs.existsSync(sessionPath)) {
    ensureRollbackContractMvp(outputDirAbs);
    const vr = validateExecutionRuntimeResult(outputDirAbs, { skipObservability: true });
    if (vr.ok) {
      const loadedSkip = loadHandoffAndOrderForExecution(outputDirAbs);
      if (loadedSkip.ok && !hasRunnableHandoffReady(outputDirAbs, loadedSkip) && !hasCorrectionWorkPending(outputDirAbs, loadedSkip, false)) {
        const bo = buildExecutionObservability({
          outputDirAbs,
          force: false,
          recordDiagnosticEvents: false,
        });
        if (!bo.ok) {
          return { ok: false, error: bo.error || { code: "OBSERVABILITY_FAILED", message: "Observability falhou." } };
        }
        const vrFull = validateExecutionRuntimeResult(outputDirAbs);
        if (!vrFull.ok) {
          return {
            ok: false,
            error: {
              code: "EXECUTION_VALIDATE_FAILED",
              message: vrFull.errors.join(" | "),
            },
          };
        }
        const wirSkip = writeRuntimeIntegrityReport(outputDirAbs, { force: false });
        if (!wirSkip.ok) {
          return {
            ok: false,
            error: wirSkip.error || { code: "INTEGRITY_REPORT_FAILED", message: "Falha ao escrever runtime-integrity-report.json." },
          };
        }
        return {
          ok: true,
          skipped: true,
          artifacts: [
            path.join(EXECUTION_DIRNAME, SESSION_FILE).replace(/\\/g, "/"),
            path.join(EXECUTION_DIRNAME, DIAGNOSTICS_FILE).replace(/\\/g, "/"),
            path.join(EXECUTION_DIRNAME, OBSERVABILITY_FILE).replace(/\\/g, "/"),
            LIFECYCLE_REL,
            path.join(EXECUTION_DIRNAME, ROLLBACK_DIRNAME, ROLLBACK_STATE_FILENAME).replace(/\\/g, "/"),
            INTEGRITY_REL,
          ],
        };
      }
    }
  }

  events.push({
    type: "execution_runtime_started",
    recorded_at: iso(),
    payload: { run_id: runId, execution_mode: "linear_mvp" },
  });

  const loaded = loadHandoffAndOrderForExecution(outputDirAbs);
  if (!loaded.ok) {
    const err = loaded.error;
    fs.mkdirSync(execDir, { recursive: true });
    const failEvents = [
      ...events,
      {
        type: "execution_runtime_completed",
        recorded_at: iso(),
        payload: { outcome: "failed", code: err.code, message: err.message },
      },
    ];
    const failDiag = buildDiagnosticsDocument(
      runId,
      {
        status: "execution_runtime_failed",
        subtask_count: 0,
        total_subtasks: 0,
        pending_subtasks: 0,
        completed_subtasks: 0,
        failed_subtasks: 0,
        execution_mode: "linear_mvp",
        execution_state: "failed",
      },
      failEvents,
      undefined,
      undefined,
      undefined,
    );
    fs.writeFileSync(diagPath, JSON.stringify(failDiag, null, 2), "utf-8");

    const failSession = {
      ...buildExecutionSessionDocument({ runId, subtaskCount: 0 }),
      execution_state: "failed",
      status: "execution_runtime_failed",
      error: { code: err.code, message: err.message },
    };
    fs.writeFileSync(sessionPath, JSON.stringify(failSession, null, 2), "utf-8");

    return { ok: false, error: err };
  }

  const subtaskCount = loaded.subtaskRels.length;

  events.push({
    type: "execution_runtime_initialized",
    recorded_at: iso(),
    payload: { subtask_count: subtaskCount, execution_mode: "linear_mvp" },
  });

  fs.mkdirSync(execDir, { recursive: true });
  initRollbackStateFile(execDir, force);
  ensureRollbackContractMvp(outputDirAbs);

  const { resumedThisRun, recoveredFlag } = prepareLifecycleAtRuntimeStart({
    execDir,
    outputDirAbs,
    loaded,
    runId,
    force,
    resume,
    events,
    iso,
  });
  const lifecycleCtx = { outputDirAbs, loaded };

  const createdAtExisting = fs.existsSync(sessionPath) ? readJsonObject(sessionPath) : null;
  let createdAt = new Date().toISOString();
  if (!force && createdAtExisting && typeof createdAtExisting.created_at === "string") {
    createdAt = String(createdAtExisting.created_at);
  }
  if (force) {
    createdAt = new Date().toISOString();
  }

  const { artifacts: subArtifacts, orderedForSession } = materializeSubtaskExecutionStates({
    execDir,
    outputDirAbs,
    loaded,
    force,
    events,
    iso,
  });

  try {
    const {
      materializeExecutionRuntimeFromOes,
    } = require("../../../core/materialize-execution-runtime-from-oes");
    const mat = materializeExecutionRuntimeFromOes(outputDirAbs, {
      runId,
      force,
    });
    if (mat.ok && !mat.skipped) {
      events.push({
        type: "execution_runtime_mini_activities_materialized",
        recorded_at: iso(),
        payload: {
          count: Array.isArray(mat.state?.miniActivities)
            ? mat.state.miniActivities.length
            : 0,
        },
      });
    }
    const {
      refreshMiniActivityDependencyGates,
    } = require("../../../core/update-execution-runtime-state");
    refreshMiniActivityDependencyGates(outputDirAbs, {
      reason: "post_materialize_dependency_refresh",
    });
  } catch (matErr) {
    events.push({
      type: "execution_runtime_mini_activities_materialize_warning",
      recorded_at: iso(),
      payload: {
        message: matErr instanceof Error ? matErr.message : String(matErr),
      },
    });
  }

  const rows = orderedSubtaskRows(loaded.orderDoc);
  const handoffPack = buildArchitectHandoffs({
    outputDirAbs,
    execDir,
    subtaskRels: loaded.subtaskRels,
    force,
    events,
    iso,
    rows,
  });

  const resumeTarget = resume ? pickResumeTargetSubtaskId(outputDirAbs, loaded) : null;

  const execPack = runSingleSubtaskExecutorMvp({
    outputDirAbs,
    execDir,
    loaded,
    force,
    events,
    iso,
    target_subtask_id: resumeTarget || undefined,
    lifecycleCtx,
  });

  const patchPack = runPatchValidationPhase({
    execDir,
    loaded,
    force,
    events,
    iso,
    lifecycleCtx,
  });

  const reviewPack = runExecutionReviewPhase({
    execDir,
    loaded,
    force,
    events,
    iso,
    lifecycleCtx,
  });

  const correctionPack = runCorrectionRuntimePhase({
    outputDirAbs,
    execDir,
    loaded,
    force,
    events,
    iso,
    lifecycleCtx,
  });

  try {
    const {
      refreshMiniActivityDependencyGates,
    } = require("../../../core/update-execution-runtime-state");
    refreshMiniActivityDependencyGates(outputDirAbs, {
      reason: "post_execution_phases_dependency_refresh",
    });
  } catch {
    /* não bloquear execução principal */
  }

  /** @type {{ subtask_id: string, doc: Record<string, unknown> }[]} */
  const orderedAfter = [];
  for (const row of rows) {
    const fn = subtaskExecutionFilename(row.subtask_id);
    const fp = path.join(execDir, "subtasks", fn);
    const doc = readJsonObject(fp);
    if (doc) orderedAfter.push({ subtask_id: row.subtask_id, doc: /** @type {Record<string, unknown>} */ (doc) });
  }

  const agg = computeSessionAggregatesFromSubtasks(orderedAfter);

  let handoffReadyCount = 0;
  let execFailedCount = 0;
  let validatedSubtasks = 0;
  let patchValidationFailedSubtasks = 0;
  let warningsTotal = 0;
  let errorsTotal = 0;
  let execResultCompletedCount = 0;
  let reviewedSubtasks = 0;
  let approvedSubtasks = 0;
  let rejectedSubtasks = 0;
  let blockedSubtasks = 0;
  for (const row of rows) {
    const d = readJsonObject(path.join(execDir, "subtasks", subtaskExecutionFilename(row.subtask_id)));
    if (d) {
      const ex = String(d.execution_state || "");
      if (ex === "handoff_ready") handoffReadyCount += 1;
      if (ex === "execution_failed" || ex === "failed") execFailedCount += 1;
      if (ex === "patch_validated" || ex === "review_completed") validatedSubtasks += 1;
      if (ex === "review_completed" || ex === "review_failed") reviewedSubtasks += 1;
      if (ex === "review_completed") approvedSubtasks += 1;
      if (ex === "review_failed") {
        const rd = d.review_decision && typeof d.review_decision === "object" && !Array.isArray(d.review_decision)
          ? /** @type {Record<string, unknown>} */ (d.review_decision)
          : null;
        const res = rd ? String(rd.result || "") : "";
        if (res === "rejected") rejectedSubtasks += 1;
        if (res === "blocked") blockedSubtasks += 1;
      }
    }
    const rfn = executionResultFilename(row.subtask_id);
    if (rfn) {
      const resDoc = readJsonObject(path.join(execDir, "results", rfn));
      if (resDoc && String(resDoc.status) === "completed") execResultCompletedCount += 1;
    }
    const pvf = patchValidationFilename(row.subtask_id);
    if (pvf) {
      const pvDoc = readJsonObject(path.join(execDir, "results", pvf));
      if (pvDoc && Array.isArray(pvDoc.warnings)) warningsTotal += pvDoc.warnings.length;
      if (pvDoc && Array.isArray(pvDoc.errors)) errorsTotal += pvDoc.errors.length;
    }
  }
  for (const row of rows) {
    const pvn = patchValidationFilename(row.subtask_id);
    const pv = pvn ? readJsonObject(path.join(execDir, "results", pvn)) : null;
    if (pv && String(pv.validation_state) === "failed") patchValidationFailedSubtasks += 1;
  }
  const execCompletedCount = execResultCompletedCount;

  let lastCompletedSubtask = null;
  if (!force && createdAtExisting && typeof createdAtExisting.last_completed_subtask === "string") {
    lastCompletedSubtask = String(createdAtExisting.last_completed_subtask);
  }
  if (execPack.outcome === "completed" && execPack.subtask_id) {
    lastCompletedSubtask = execPack.subtask_id;
  }
  if (correctionPack.last_executor_subtask) {
    lastCompletedSubtask = correctionPack.last_executor_subtask;
  }

  let mvpStatus = "executor_mvp_idle";
  if (execPack.ran) {
    mvpStatus =
      execPack.outcome === "completed" ? "executor_mvp_step_succeeded" : "executor_mvp_step_failed";
  }

  const modifiedTotal = sumModifiedFilesFromResults(outputDirAbs);

  const lfBefore = readLifecycleDocument(execDir);
  const lcSub =
    lfBefore &&
    lfBefore.last_checkpoint &&
    typeof lfBefore.last_checkpoint === "object" &&
    !Array.isArray(lfBefore.last_checkpoint) &&
    /** @type {Record<string, unknown>} */ (lfBefore.last_checkpoint).subtask_id != null
      ? String(/** @type {Record<string, unknown>} */ (lfBefore.last_checkpoint).subtask_id)
      : null;

  const rbFilePre = readJsonObject(rollbackStatePath(execDir));
  const rbEvPre = summarizeRollbackFromEvents(events);
  const rbSummary = {
    rollback_enabled: rbFilePre ? rbFilePre.rollback_enabled !== false : true,
    rollback_operations:
      Number(
        rbFilePre && rbFilePre.rollback_operations != null ? rbFilePre.rollback_operations : rbEvPre.rollback_operations,
      ) || 0,
    rollback_failures:
      Number(
        rbFilePre && rbFilePre.rollback_failures != null ? rbFilePre.rollback_failures : rbEvPre.rollback_failures,
      ) || 0,
    snapshots_created:
      Number(
        rbFilePre && rbFilePre.snapshots_created != null ? rbFilePre.snapshots_created : rbEvPre.snapshots_created,
      ) || 0,
    restored_files_total: Number(rbEvPre.restored_files_total) || 0,
  };

  const sessionDoc = {
    ...buildExecutionSessionDocument({
      runId,
      subtaskCount,
      createdAt,
    }),
    phase: MVP_EXECUTION_PHASE,
    status: mvpStatus,
    total_subtasks: subtaskCount,
    completed_subtasks: agg.completed_subtasks,
    failed_subtasks: agg.failed_subtasks,
    current_subtask: agg.current_subtask,
    subtask_states: agg.subtask_states,
    prepared_subtasks: handoffPack.preparedCount,
    handoff_ready_subtasks: handoffReadyCount,
    running_subtasks: 0,
    execution_completed_subtasks: execCompletedCount,
    execution_failed_subtasks: execFailedCount,
    validated_subtasks: validatedSubtasks,
    patch_validation_failed_subtasks: patchValidationFailedSubtasks,
    reviewed_subtasks: reviewedSubtasks,
    approved_subtasks: approvedSubtasks,
    rejected_subtasks: rejectedSubtasks,
    blocked_subtasks: blockedSubtasks,
    last_completed_subtask: lastCompletedSubtask,
    correction_attempts_total: correctionPack.correction_attempts_total,
    corrected_subtasks: correctionPack.corrected_subtasks,
    correction_failed_subtasks: correctionPack.correction_failed_subtasks,
    retry_exhausted_subtasks: correctionPack.retry_exhausted_subtasks,
    lifecycle_state: "running",
    interrupted: recoveredFlag === true,
    resumed: resumedThisRun === true,
    last_checkpoint_subtask: lcSub && /^\d{3}$/.test(lcSub) ? lcSub : null,
    rollback_enabled: rbSummary.rollback_enabled,
    rollback_operations: rbSummary.rollback_operations,
    rollback_failures: rbSummary.rollback_failures,
    snapshots_created: rbSummary.snapshots_created,
  };

  fs.writeFileSync(sessionPath, JSON.stringify(sessionDoc, null, 2), "utf-8");

  events.push({
    type: "execution_runtime_completed",
    recorded_at: iso(),
    payload: {
      subtask_count: subtaskCount,
      execution_mode: "linear_mvp",
      status: mvpStatus,
    },
  });

  const rbFile = readJsonObject(rollbackStatePath(execDir));
  const rbEv = summarizeRollbackFromEvents(events);
  const rbSummaryDiag = {
    rollback_enabled: rbFile ? rbFile.rollback_enabled !== false : true,
    rollback_operations: Number(rbFile && rbFile.rollback_operations != null ? rbFile.rollback_operations : rbEv.rollback_operations) || 0,
    rollback_failures: Number(rbFile && rbFile.rollback_failures != null ? rbFile.rollback_failures : rbEv.rollback_failures) || 0,
    snapshots_created: Number(rbFile && rbFile.snapshots_created != null ? rbFile.snapshots_created : rbEv.snapshots_created) || 0,
    restored_files_total: Number(rbEv.restored_files_total) || 0,
  };

  const pendingSubtasks = agg.subtask_states.pending || 0;

  const reviewFailures = rejectedSubtasks + blockedSubtasks;

  const lsSummary = summarizeLifecycleFromEvents(events);

  const diagDoc = buildDiagnosticsDocument(
    runId,
    {
      status: mvpStatus,
      subtask_count: subtaskCount,
      total_subtasks: subtaskCount,
      pending_subtasks: pendingSubtasks,
      completed_subtasks: agg.completed_subtasks,
      failed_subtasks: agg.failed_subtasks,
      execution_mode: "linear_mvp",
      execution_state: "pending",
      prepared_subtasks: handoffPack.preparedCount,
      handoff_ready_subtasks: handoffReadyCount,
      running_subtasks: 0,
      execution_completed_subtasks: execCompletedCount,
      execution_failed_subtasks: execFailedCount,
      modified_files_total: modifiedTotal,
      validated_subtasks: validatedSubtasks,
      failed_validations: patchValidationFailedSubtasks,
      warnings_total: warningsTotal,
      errors_total: errorsTotal,
      approved_subtasks: approvedSubtasks,
      rejected_subtasks: rejectedSubtasks,
      blocked_subtasks: blockedSubtasks,
      review_failures: reviewFailures,
    },
    events,
    {
      corrected_subtasks: correctionPack.corrected_subtasks,
      correction_failures: correctionPack.correction_failed_subtasks,
      retry_exhausted: correctionPack.retry_exhausted_subtasks,
      correction_attempts_total: correctionPack.correction_attempts_total,
    },
    lsSummary,
    rbSummaryDiag,
  );
  fs.writeFileSync(diagPath, JSON.stringify(diagDoc, null, 2), "utf-8");

  mergePhase4IntoRunContext(outputDirAbs, mvpStatus);

  const vrPre = validateExecutionRuntimeResult(outputDirAbs, { skipObservability: true });
  if (!vrPre.ok) {
    finalizeLifecycleDocument({
      execDir,
      loaded,
      events,
      iso,
      terminal: "failed",
    });
    return {
      ok: false,
      error: {
        code: "EXECUTION_VALIDATE_FAILED",
        message: vrPre.errors.join(" | "),
      },
    };
  }

  finalizeLifecycleDocument({
    execDir,
    loaded,
    events,
    iso,
    terminal: "completed",
  });

  const lfAfter = readLifecycleDocument(execDir);
  const sessPost = readJsonObject(sessionPath);
  if (sessPost && lfAfter) {
    const d = /** @type {Record<string, unknown>} */ (sessPost);
    d.lifecycle_state = String(lfAfter.lifecycle_state || "completed");
    const lcp =
      lfAfter.last_checkpoint &&
      typeof lfAfter.last_checkpoint === "object" &&
      !Array.isArray(lfAfter.last_checkpoint) &&
      /** @type {Record<string, unknown>} */ (lfAfter.last_checkpoint).subtask_id != null
        ? String(/** @type {Record<string, unknown>} */ (lfAfter.last_checkpoint).subtask_id)
        : null;
    d.last_checkpoint_subtask = lcp && /^\d{3}$/.test(lcp) ? lcp : null;
    fs.writeFileSync(sessionPath, JSON.stringify(d, null, 2), "utf-8");
  }

  const bo = buildExecutionObservability({
    outputDirAbs,
    force: false,
    recordDiagnosticEvents: true,
  });
  if (!bo.ok) {
    return {
      ok: false,
      error: bo.error || { code: "OBSERVABILITY_FAILED", message: "Observability falhou." },
    };
  }

  const vrFinal = validateExecutionRuntimeResult(outputDirAbs);
  if (!vrFinal.ok) {
    return {
      ok: false,
      error: {
        code: "EXECUTION_VALIDATE_FAILED",
        message: vrFinal.errors.join(" | "),
      },
    };
  }

  const wir = writeRuntimeIntegrityReport(outputDirAbs, { force: false });
  if (!wir.ok) {
    return {
      ok: false,
      error: wir.error || { code: "INTEGRITY_REPORT_FAILED", message: "Falha ao escrever runtime-integrity-report.json." },
    };
  }

  /** @type {string[]} */
  const arts = [
    path.join(EXECUTION_DIRNAME, SESSION_FILE).replace(/\\/g, "/"),
    path.join(EXECUTION_DIRNAME, DIAGNOSTICS_FILE).replace(/\\/g, "/"),
    path.join(EXECUTION_DIRNAME, OBSERVABILITY_FILE).replace(/\\/g, "/"),
    LIFECYCLE_REL,
    path.join(EXECUTION_DIRNAME, ROLLBACK_DIRNAME, ROLLBACK_STATE_FILENAME).replace(/\\/g, "/"),
    RUN_CONTEXT_FILE,
    INTEGRITY_REL,
    ...subArtifacts,
    ...handoffPack.artifacts,
    ...execPack.artifacts,
    ...patchPack.artifacts,
    ...reviewPack.artifacts,
    ...correctionPack.artifacts,
  ];

  return {
    ok: true,
    skipped: false,
    artifacts: arts,
  };
}

module.exports = {
  runExecutionRuntimeBase,
  mergePhase4IntoRunContext,
  EXECUTION_DIRNAME,
  SESSION_FILE,
  DIAGNOSTICS_FILE,
  OBSERVABILITY_FILE,
};
