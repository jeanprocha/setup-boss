"use strict";

const fs = require("fs");
const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const {
  executeClarification,
  QUESTIONS_FILE,
  ANSWERS_FILE,
  PLAN_REFINED_FILE,
  APPROVAL_STATE_FILE,
  SESSION_FILE,
} = require("../../runtime/clarification/clarification-runtime");
const { loadExistingAnswersDoc } = require("../../runtime/clarification/answers");
const { loadApprovalState } = require("../../runtime/clarification/approval");
const runtimeLogger = require("../../runtime/logger");
const { emitRuntimeEvent } = require("./runtime-events");
const { triggerStrategyRun } = require("./run-strategy-api");
const { promoteJobUiPhaseForRun } = require("./promote-job-ui-phase");

const PLAN_INITIAL_FILE = "task-plan-initial.md";
const STRATEGY_READINESS_REL = "strategy/strategy-readiness.json";
const EXECUTION_READY_HANDOFF_REL = "strategy/execution-ready-handoff.json";
const STRATEGY_READY_DISK_STATUS = "strategy_ready";
const HANDOFF_READY_DISK_STATUS = "execution_ready_handoff_completed";

function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 */
function isStrategyReadyOnDisk(outputDir) {
  const dir = path.resolve(String(outputDir || ""));
  const readiness = safeReadJson(path.join(dir, STRATEGY_READINESS_REL));
  const handoff = safeReadJson(path.join(dir, EXECUTION_READY_HANDOFF_REL));
  if (!readiness || !handoff) return false;
  const rs = String(readiness.status || "").toLowerCase();
  if (rs !== STRATEGY_READY_DISK_STATUS && !rs.includes("ready")) return false;
  const hs = String(handoff.status || "").toLowerCase();
  return hs === HANDOFF_READY_DISK_STATUS || hs.includes("handoff");
}

/**
 * @param {object|null|undefined} runContext
 * @param {string} [outputDir]
 */
function isStrategyReadyInContext(runContext, outputDir) {
  const p3 = runContext && runContext.phase3 ? runContext.phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    return outputDir ? isStrategyReadyOnDisk(outputDir) : false;
  }
  const p3st = p3.status != null ? String(p3.status) : "";
  if (p3st === "strategy_ready" || p3st === "ready_for_execution") return true;
  const rd = p3.readiness;
  const ho = p3.handoff;
  const readinessOk =
    rd &&
    typeof rd === "object" &&
    String(rd.status || "") === STRATEGY_READY_DISK_STATUS;
  const handoffOk =
    ho &&
    typeof ho === "object" &&
    String(ho.status || "") === HANDOFF_READY_DISK_STATUS;
  if (readinessOk && handoffOk) return true;
  return outputDir ? isStrategyReadyOnDisk(outputDir) : false;
}

function mapPhase2ToRuntimePhase(
  phase2Status,
  approvalDoc,
  pendingBlocking,
  runContext,
  questionsCount,
  outputDir,
) {
  const st = String(phase2Status || "").trim();
  const qc =
    typeof questionsCount === "number" && Number.isFinite(questionsCount)
      ? questionsCount
      : 0;
  if (!st) return "unavailable";
  if (st === "ready_for_execution") {
    if (isStrategyReadyInContext(runContext, outputDir)) {
      return "ready_for_execution";
    }
    const p3 = runContext && runContext.phase3 ? runContext.phase3 : null;
    const p3st = p3 && p3.status != null ? String(p3.status) : "";
    if (p3st && p3st !== "strategy_ready" && p3st !== "ready_for_execution") {
      return "strategy_pending";
    }
    return "ready_for_execution";
  }
  if (st === "approval_rejected") return "rejected";
  if (approvalDoc && approvalDoc.status === "approved") return "approved";
  if (approvalDoc && approvalDoc.status === "rejected") return "rejected";
  if (st === "plan_refined") return "awaiting_approval";
  if (st === "answers_recorded") {
    return pendingBlocking > 0 ? "waiting_answers" : "refining";
  }
  if (st === "questions_generated") {
    if (qc === 0) return "clarification_empty";
    return pendingBlocking > 0 ? "waiting_answers" : "refining";
  }
  if (st === "clarification_initialized") {
    return qc === 0 ? "clarification_empty" : "clarification_required";
  }
  return "clarification_required";
}

function listFromSection(body) {
  if (!body) return [];
  return body
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line && !/^---/.test(line) && !/^\{/.test(line))
    .slice(0, 12);
}

function parseRefinementSections(markdown) {
  const text = String(markdown || "").replace(/^---TASK_PLAN_REFINED---\s*/m, "");
  const scopeChanges = [];
  const acceptanceCriteria = [];
  const risks = [];
  const h2 = (title) => {
    const re = new RegExp(`##\\s+${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  const scopeLines = listFromSection(h2("Escopo Refinado"));
  const outLines = listFromSection(h2("Fora de Escopo"));
  const decisionLines = listFromSection(h2("Decisões Confirmadas"));
  if (scopeLines.length) scopeChanges.push(...scopeLines.slice(0, 6));
  if (outLines.length) scopeChanges.push(...outLines.slice(0, 4).map((l) => `Fora: ${l}`));
  if (decisionLines.length) scopeChanges.push(...decisionLines.slice(0, 4));
  acceptanceCriteria.push(...listFromSection(h2("Critérios de Aceite")).slice(0, 8));
  risks.push(...listFromSection(h2("Riscos Restantes")).slice(0, 6));
  const objective = h2("Objetivo").replace(/\s+/g, " ").trim();
  const steps = listFromSection(h2("Passos Propostos"));
  if (steps.length && scopeChanges.length < 8) {
    scopeChanges.push(...steps.slice(0, 3).map((s) => `Passo: ${s}`));
  }
  return {
    refinedTask: objective || text.slice(0, 320),
    scopeChanges,
    acceptanceCriteria,
    risks,
  };
}

function questionStatusFromAnswers(q, answersById) {
  const a = answersById.get(q.id);
  if (!a) return "pending";
  return "answered";
}

/**
 * @param {string} outputDir
 * @param {string} runId
 */
function collectClarificationBundle(outputDir, runId) {
  const dir = path.resolve(outputDir);
  const ctx = safeReadJson(path.join(dir, "run-context.json"));
  const phase2 = ctx && ctx.phase2 ? ctx.phase2 : null;
  const phase2Status =
    phase2 && phase2.status != null ? String(phase2.status) : null;

  if (!phase2) {
    return {
      ok: false,
      error: { code: "clarification_not_applicable", message: "Corrida sem fase phase2 / clarificação." },
    };
  }

  const sessionDoc = safeReadJson(path.join(dir, SESSION_FILE));
  const questionsDoc = safeReadJson(path.join(dir, QUESTIONS_FILE));
  const answersLoad = loadExistingAnswersDoc(dir);
  const approvalLoad = loadApprovalState(dir);
  const approvalDoc = approvalLoad.ok ? approvalLoad.doc : null;

  /** @type {Map<string, { value: string, recordedAt: string|null }>} */
  const answersById = new Map();
  if (answersLoad.ok && Array.isArray(answersLoad.doc?.answers)) {
    for (const row of answersLoad.doc.answers) {
      const qid = row && row.question_id != null ? String(row.question_id) : "";
      if (!qid) continue;
      answersById.set(qid, {
        value: row.value != null ? String(row.value) : "",
        recordedAt:
          row.recorded_at != null ? String(row.recorded_at) : null,
      });
    }
  }

  const rawQuestions = Array.isArray(questionsDoc?.questions)
    ? questionsDoc.questions
    : [];

  let pendingBlocking = 0;
  const questions = rawQuestions.map((q) => {
    const id = String(q.id || "").trim();
    const blocking = Boolean(q.blocking);
    const st = questionStatusFromAnswers({ id }, answersById);
    if (blocking && st === "pending") pendingBlocking += 1;
    const ans = answersById.get(id);
    return {
      id,
      prompt: String(q.prompt || ""),
      kind:
        q.type === "single_choice" || q.type === "confirm"
          ? q.type
          : "free_text",
      blocking,
      options: Array.isArray(q.options)
        ? q.options.map((o) => String(o))
        : [],
      status: st,
      answer: ans ? ans.value : null,
    };
  });

  const runtimePhase = mapPhase2ToRuntimePhase(
    phase2Status,
    approvalDoc,
    pendingBlocking,
    ctx,
    questions.length,
    dir,
  );

  const planPath = path.join(dir, PLAN_REFINED_FILE);
  let refinement = {
    available: false,
    refinedTask: null,
    scopeChanges: [],
    acceptanceCriteria: [],
    risks: [],
    executionReadiness: "not_ready",
  };
  if (fs.existsSync(planPath)) {
    try {
      const md = fs.readFileSync(planPath, "utf-8");
      const parsed = parseRefinementSections(md);
      refinement = {
        available: true,
        refinedTask: parsed.refinedTask,
        scopeChanges: parsed.scopeChanges,
        acceptanceCriteria: parsed.acceptanceCriteria,
        risks: parsed.risks,
        executionReadiness:
          runtimePhase === "ready_for_execution"
            ? "ready"
            : runtimePhase === "awaiting_approval" ||
                runtimePhase === "approved"
              ? "pending_approval"
              : "not_ready",
      };
    } catch {
      /* */
    }
  }

  let approval = {
    status: "none",
    notes: null,
    decidedAt: null,
    planRef: null,
  };
  if (approvalDoc) {
    approval = {
      status:
        approvalDoc.status === "approved"
          ? "approved"
          : approvalDoc.status === "rejected"
            ? "rejected"
            : "pending",
      notes: approvalDoc.notes != null ? String(approvalDoc.notes) : null,
      decidedAt:
        approvalDoc.approved_at ||
        approvalDoc.rejected_at ||
        approvalDoc.created_at ||
        null,
      planRef: approvalDoc.plan_ref != null ? String(approvalDoc.plan_ref) : null,
    };
  } else if (runtimePhase === "awaiting_approval") {
    approval = { status: "pending", notes: null, decidedAt: null, planRef: PLAN_REFINED_FILE };
  }

  const answers = [...answersById.entries()].map(([questionId, v]) => ({
    questionId,
    value: v.value,
    recordedAt: v.recordedAt,
  }));

  const session = {
    runId,
    phase2Status,
    runtimePhase,
    currentRound:
      phase2 && typeof phase2.current_round === "number"
        ? phase2.current_round
        : sessionDoc && typeof sessionDoc.current_round === "number"
          ? sessionDoc.current_round
          : 0,
    questionsCount: questions.length,
    answersCount: answers.length,
    pendingBlockingCount: pendingBlocking,
    updatedAt:
      sessionDoc && sessionDoc.updated_at
        ? String(sessionDoc.updated_at)
        : phase2 && phase2.updated_at
          ? String(phase2.updated_at)
          : null,
    localFallbackGenerationFailed: Boolean(phase2 && phase2.local_fallback_failed),
    localFallbackGenerationDetail:
      phase2 && phase2.local_fallback_error != null
        ? String(phase2.local_fallback_error)
        : null,
  };

  return {
    ok: true,
    data: {
      session,
      questions,
      answers,
      refinement,
      approval,
      source: "runtime",
      unsupportedReason: null,
    },
  };
}

/**
 * @param {string} runId
 * @param {object|null} job
 */
function collectClarificationForRun(runId, job) {
  let outputDir;
  try {
    outputDir = resolveOutputDir(runId, { warnLegacy: false });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Output indisponível.";
    return { ok: false, error: { code: "output_unavailable", message: msg } };
  }
  return collectClarificationBundle(outputDir, runId);
}

/**
 * @param {string} outputDir
 * @param {{ question_id: string, value: string }[]} incoming
 * @returns {{ question_id: string, value: string }[], overwrite: boolean }}
 */
function mergeAnswerPairsWithExisting(outputDir, incoming) {
  const existing = loadExistingAnswersDoc(outputDir);
  /** @type {Map<string, string>} */
  const merged = new Map();
  if (existing.ok && Array.isArray(existing.doc?.answers)) {
    for (const row of existing.doc.answers) {
      const qid = row && row.question_id != null ? String(row.question_id) : "";
      if (!qid) continue;
      merged.set(qid, row.value != null ? String(row.value) : "");
    }
  }
  for (const p of incoming) {
    const id = p && p.question_id != null ? String(p.question_id).trim() : "";
    if (!id) continue;
    merged.set(id, p.value != null ? String(p.value) : "");
  }
  return {
    answerPairs: [...merged.entries()].map(([question_id, value]) => ({
      question_id,
      value,
    })),
    overwrite: existing.ok,
  };
}

/**
 * @param {string} outputDirAbs
 * @param {string} runId
 */
function buildMutationSnapshot(outputDirAbs, runId) {
  const bundle = collectClarificationBundle(outputDirAbs, runId);
  if (!bundle.ok || !bundle.data) {
    return {
      runtimePhase: null,
      session: null,
      refinement: null,
      approvalReadiness: null,
      updatedAt: null,
    };
  }
  const d = bundle.data;
  return {
    runtimePhase: d.session.runtimePhase,
    session: d.session,
    refinement: {
      available: d.refinement.available,
      executionReadiness: d.refinement.executionReadiness,
    },
    approvalReadiness:
      d.session.runtimePhase === "awaiting_approval" && d.refinement.available,
    updatedAt: d.session.updatedAt,
    nextPhase:
      d.session.runtimePhase === "ready_for_execution" ||
      d.session.runtimePhase === "strategy_pending"
        ? "strategy"
        : d.session.runtimePhase === "awaiting_approval"
          ? "approval"
          : "clarification",
  };
}

/**
 * @param {{
 *   jobId: string|null,
 *   projectId: string|null,
 *   outputDirAbs: string,
 *   runId: string,
 *   snap: { runtimePhase: string|null, nextPhase?: string|null },
 *   phase2Status: string|null,
 * }} opts
 */
/**
 * Após approve: inicia strategy automaticamente (idempotente no runtime).
 * @param {{
 *   jobId: string|null,
 *   projectId: string|null,
 *   outputDirAbs: string,
 *   runId: string,
 *   snap: { runtimePhase: string|null, nextPhase?: string|null },
 *   phase2Status: string|null,
 * }} opts
 */
async function autoStartStrategyAfterApproval(opts) {
  const { jobId, projectId, outputDirAbs, runId, snap, phase2Status } = opts;
  if (!runId || !outputDirAbs || !snap || snap.nextPhase !== "strategy") {
    return { ok: true, skipped: true, reason: "not_strategy_phase" };
  }

  runtimeLogger.info("strategy_auto_started_after_approval", {
    runId,
    jobId,
    projectId,
    outputDir: outputDirAbs,
    runtimePhase: snap.runtimePhase,
    phase2Status: phase2Status ?? null,
  });

  try {
    emitRuntimeEvent({
      type: "strategy_auto_started_after_approval",
      jobId,
      runId,
      projectId,
      data: {
        runtimePhase: snap.runtimePhase ?? null,
        phase2Status: phase2Status ?? null,
        nextPhase: snap.nextPhase ?? null,
      },
    });
  } catch (_) {
    /* */
  }

  const result = await triggerStrategyRun({
    runId,
    jobId,
    projectId,
    force: false,
  });

  if (!result.ok) {
    runtimeLogger.warn("strategy_auto_start_failed", {
      runId,
      jobId,
      projectId,
      code: result.code,
      message: result.message,
    });
    try {
      emitRuntimeEvent({
        type: "strategy_auto_start_failed",
        jobId,
        runId,
        projectId,
        data: {
          code: result.code,
          message: result.message,
        },
      });
    } catch (_) {
      /* */
    }
    return { ok: false, error: result };
  }

  return {
    ok: true,
    idempotent: Boolean(result.idempotent),
    skipped: Boolean(result.data?.skipped),
  };
}

/**
 * @param {object} err
 */
function mutationErrorCode(err) {
  const code = err && err.code ? String(err.code) : "";
  if (
    code === "CLARIFY_REFINE_PLAN_INITIAL_MISSING" ||
    code === "CLARIFY_REFINE_DISCOVERY_MISSING"
  ) {
    return "clarification_not_ready";
  }
  if (
    code === "CLARIFY_ANSWERS_VALIDATION" ||
    code.startsWith("CLARIFY_ANSWERS_")
  ) {
    return "clarification_validation_failed";
  }
  if (code === "CLARIFY_APPROVAL_BAD_PHASE" || code === "CLARIFY_APPROVAL_PLAN_MISSING") {
    return "clarification_not_ready";
  }
  if (code.includes("IDEMPOTENT") || code === "CLARIFY_ALREADY_PROCESSED") {
    return "clarification_already_processed";
  }
  return "clarification_mutation_failed";
}

/**
 * @param {string} runOrPath
 * @param {{ answerPairs?: { question_id: string, value: string }[], overwrite?: boolean, refine?: boolean, approve?: boolean, reject?: boolean, approvalNotes?: string, operatorRecommendedMode?: string|null, skipLlm?: boolean, cwd?: string, jobId?: string|null, projectId?: string|null }} opts
 */
async function runClarificationMutation(runOrPath, opts) {
  const cwd = opts.cwd ? path.resolve(String(opts.cwd)) : process.cwd();
  const jobId = opts.jobId != null ? String(opts.jobId) : null;
  const projectId = opts.projectId != null ? String(opts.projectId) : null;
  const wantsAnswers =
    Array.isArray(opts.answerPairs) &&
    opts.answerPairs.length > 0 &&
    !opts.refine &&
    !opts.approve &&
    !opts.reject;
  const wantsApprove = Boolean(opts.approve);
  const wantsReject = Boolean(opts.reject);

  let answerPairs = opts.answerPairs || [];
  let overwrite = Boolean(opts.overwrite);

  let outputDirAbs = null;
  if (wantsAnswers) {
    try {
      outputDirAbs = path.resolve(resolveOutputDir(runOrPath, { warnLegacy: false }));
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "Output indisponível.";
      return {
        ok: false,
        code: "output_unavailable",
        message: msg,
        phase2Status: null,
      };
    }
    const merged = mergeAnswerPairsWithExisting(outputDirAbs, answerPairs);
    answerPairs = merged.answerPairs;
    overwrite = overwrite || merged.overwrite;

    runtimeLogger.info("runtime.clarification_answers.submit_received", {
      runId: path.basename(outputDirAbs),
      jobId,
      projectId,
      outputDir: outputDirAbs,
      answersCount: answerPairs.length,
      reason: "mutation",
    });
  }

  if (wantsApprove) {
    try {
      outputDirAbs =
        outputDirAbs ||
        path.resolve(resolveOutputDir(runOrPath, { warnLegacy: false }));
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "Output indisponível.";
      return { ok: false, code: "output_unavailable", message: msg, phase2Status: null };
    }
    const planPath = path.join(outputDirAbs, PLAN_REFINED_FILE);
    if (!fs.existsSync(planPath)) {
      return {
        ok: false,
        code: "clarification_not_ready",
        message: "Refinement ainda não disponível — submeta respostas e aguarde o plano refinado.",
        phase2Status: null,
      };
    }
    const approvalLoad = loadApprovalState(outputDirAbs);
    if (approvalLoad.ok && approvalLoad.doc.status === "approved" && !overwrite) {
      const snap = buildMutationSnapshot(outputDirAbs, path.basename(outputDirAbs));
      const ridEarly = path.basename(outputDirAbs);
      await autoStartStrategyAfterApproval({
        jobId,
        projectId,
        outputDirAbs,
        runId: ridEarly,
        snap,
        phase2Status: "ready_for_execution",
      });
      try {
        promoteJobUiPhaseForRun(ridEarly, "strategy", {
          uiState: "ready_for_execution",
          jobId,
        });
      } catch (_) {
        /* */
      }
      return {
        ok: true,
        idempotent: true,
        message: "Clarificação já aprovada.",
        phase2Status: "ready_for_execution",
        runId: path.basename(outputDirAbs),
        outputDir: outputDirAbs,
        ...snap,
        transitionedAt: approvalLoad.doc.approved_at || null,
      };
    }
  }

  if (wantsReject) {
    try {
      outputDirAbs =
        outputDirAbs ||
        path.resolve(resolveOutputDir(runOrPath, { warnLegacy: false }));
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "Output indisponível.";
      return { ok: false, code: "output_unavailable", message: msg, phase2Status: null };
    }
    const approvalLoad = loadApprovalState(outputDirAbs);
    if (approvalLoad.ok && approvalLoad.doc.status === "rejected" && !overwrite) {
      const snap = buildMutationSnapshot(outputDirAbs, path.basename(outputDirAbs));
      return {
        ok: true,
        idempotent: true,
        message: "Clarificação já rejeitada.",
        phase2Status: "approval_rejected",
        runId: path.basename(outputDirAbs),
        outputDir: outputDirAbs,
        ...snap,
        transitionedAt: approvalLoad.doc.rejected_at || null,
      };
    }
  }

  let r = await executeClarification({
    runOrPath,
    cwd,
    skipLlm: Boolean(opts.skipLlm),
    answerPairs,
    overwrite,
    refine: Boolean(opts.refine),
    approve: wantsApprove,
    reject: wantsReject,
    approvalNotes: opts.approvalNotes || "",
    operatorRecommendedMode: opts.operatorRecommendedMode ?? null,
  });

  if (!r.ok) {
    return {
      ok: false,
      code: mutationErrorCode(r.error || {}),
      message: r.error?.message || "Clarificação falhou.",
      phase2Status: r.phase2Status ?? null,
    };
  }

  outputDirAbs = r.outputDir ? path.resolve(r.outputDir) : outputDirAbs;
  const runId = r.runId || (outputDirAbs ? path.basename(outputDirAbs) : null);

  if (wantsAnswers && outputDirAbs && runId) {
    runtimeLogger.info("runtime.clarification_answers.written", {
      runId,
      jobId,
      projectId,
      outputDir: outputDirAbs,
      answersCount: r.answersCount ?? answerPairs.length,
      phase2Status: r.phase2Status ?? null,
      reason: "persisted",
    });
    try {
      emitRuntimeEvent({
        type: "clarification_answers_submitted",
        jobId,
        runId,
        projectId,
        data: {
          answersCount: r.answersCount ?? answerPairs.length,
          phase2Status: r.phase2Status ?? null,
          outputDir: outputDirAbs,
        },
      });
    } catch (_) {
      /* */
    }

    const refinedPath = path.join(outputDirAbs, PLAN_REFINED_FILE);
    const needsRefine =
      !fs.existsSync(refinedPath) ||
      String(r.phase2Status || "") === "answers_recorded";
    if (needsRefine) {
      runtimeLogger.info("runtime.refine.started", {
        runId,
        jobId,
        projectId,
        outputDir: outputDirAbs,
        initialPlanPath: path.join(outputDirAbs, PLAN_INITIAL_FILE),
        refinedPlanPath: refinedPath,
        answersCount: r.answersCount ?? answerPairs.length,
        reason: "post_answers",
      });
      const r2 = await executeClarification({
        runOrPath: runOrPath,
        cwd,
        skipLlm: Boolean(opts.skipLlm),
        refine: true,
        answerPairs: [],
        overwrite: false,
        approve: false,
        reject: false,
        approvalNotes: "",
      });
      if (!r2.ok) {
        try {
          emitRuntimeEvent({
            type: "refinement_failed",
            jobId,
            runId,
            projectId,
            data: {
              phase: "refine",
              code: mutationErrorCode(r2.error || {}),
              message:
                r2.error?.message ||
                "Respostas gravadas mas refinement falhou — tente refine manualmente.",
              reason: String(r2.error?.code || ""),
            },
          });
        } catch (_) {
          /* */
        }
        runtimeLogger.warn("runtime.refine.failed", {
          runId,
          jobId,
          projectId,
          outputDir: outputDirAbs,
          initialPlanPath: path.join(outputDirAbs, PLAN_INITIAL_FILE),
          refinedPlanPath: refinedPath,
          reason: r2.error?.code || "refine_execute_failed",
        });
        return {
          ok: false,
          code: mutationErrorCode(r2.error || {}),
          message:
            r2.error?.message ||
            "Respostas gravadas mas refinement falhou — tente refine manualmente.",
          phase2Status: r.phase2Status ?? null,
          runId,
          outputDir: outputDirAbs,
          refineFailed: true,
        };
      }
      r = r2;
    }
  }

  const transitionedAt = new Date().toISOString();

  /** @type {{ localInitialPlanWritten?: boolean, localDiscoveryWritten?: boolean }|null} */
  const refineFx =
    r && typeof r === "object" && r.refineSideEffects && typeof r.refineSideEffects === "object"
      ? r.refineSideEffects
      : null;

  let displayMessage = `phase2=${r.phase2Status}`;
  if (wantsAnswers && refineFx?.localInitialPlanWritten) {
    displayMessage = "Respostas salvas e plano inicial gerado.";
  }

  if (wantsAnswers && refineFx?.localInitialPlanWritten && runId) {
    try {
      emitRuntimeEvent({
        type: "task_plan_initial_created",
        jobId,
        runId,
        projectId,
        data: {
          source: "local_fallback",
          outputDir: outputDirAbs,
          path: outputDirAbs ? path.join(outputDirAbs, PLAN_INITIAL_FILE) : null,
        },
      });
    } catch (_) {
      /* */
    }
  }

  if (wantsAnswers && String(r.phase2Status || "") === "plan_refined" && runId) {
    try {
      emitRuntimeEvent({
        type: "task_plan_refined_created",
        jobId,
        runId,
        projectId,
        data: {
          outputDir: outputDirAbs,
          path: outputDirAbs ? path.join(outputDirAbs, PLAN_REFINED_FILE) : null,
        },
      });
    } catch (_) {
      /* */
    }
  }

  const snap =
    outputDirAbs && runId
      ? buildMutationSnapshot(outputDirAbs, runId)
      : {
          runtimePhase: null,
          session: null,
          refinement: null,
          approvalReadiness: null,
          updatedAt: null,
          nextPhase: "clarification",
        };

  if (
    wantsAnswers &&
    snap.runtimePhase === "awaiting_approval" &&
    runId
  ) {
    try {
      emitRuntimeEvent({
        type: "approval_requested",
        jobId,
        runId,
        projectId,
        data: {
          outputDir: outputDirAbs,
          planArtifact: PLAN_REFINED_FILE,
        },
      });
    } catch (_) {
      /* */
    }
  }

  if (wantsApprove && runId && outputDirAbs) {
    await autoStartStrategyAfterApproval({
      jobId,
      projectId,
      outputDirAbs,
      runId,
      snap,
      phase2Status: r.phase2Status ?? null,
    });
    try {
      promoteJobUiPhaseForRun(runId, "strategy", {
        uiState: "ready_for_execution",
        jobId,
      });
    } catch (_) {
      /* */
    }
    const snapAfter = buildMutationSnapshot(outputDirAbs, runId);
    Object.assign(snap, snapAfter);
  }

  return {
    ok: true,
    idempotent: Boolean(r.idempotent),
    message: displayMessage,
    phase2Status: r.phase2Status ?? null,
    runId,
    outputDir: outputDirAbs,
    refineSideEffects: refineFx,
    ...snap,
    transitionedAt,
  };
}

module.exports = {
  collectClarificationForRun,
  collectClarificationBundle,
  runClarificationMutation,
  mergeAnswerPairsWithExisting,
  buildMutationSnapshot,
  mapPhase2ToRuntimePhase,
  isStrategyReadyOnDisk,
  isStrategyReadyInContext,
  QUESTIONS_FILE,
  ANSWERS_FILE,
};
