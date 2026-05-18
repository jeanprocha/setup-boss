"use strict";

const fs = require("fs");
const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const { validateIntakeArtifacts } = require("../intake/intake-manifest");
const {
  generateClarificationQuestions,
  QUESTIONS_FILE,
} = require("./question-generator");
const {
  ANSWERS_FILE,
  loadClarificationQuestions,
  parseAnswersInput,
  validateClarificationAnswers,
  buildClarificationAnswersArtifact,
  loadExistingAnswersDoc,
} = require("./answers");
const { refineTaskPlan, PLAN_REFINED_FILE } = require("./plan-refiner");
const {
  APPROVAL_STATE_FILE,
  computeFileSha256,
  buildApprovalState,
  validateApprovalState,
  loadApprovalState,
  checkApprovalReadiness,
} = require("./approval");
const { enrichClarifySuccessResult } = require("./clarification-status");

const PHASE2_INITIAL_STATUS = "clarification_initialized";
const PHASE2_QUESTIONS_STATUS = "questions_generated";
const PHASE2_ANSWERS_STATUS = "answers_recorded";
const PHASE2_PLAN_REFINED_STATUS = "plan_refined";
const PHASE2_READY_FOR_EXECUTION = "ready_for_execution";
const PHASE2_APPROVAL_REJECTED = "approval_rejected";
const SESSION_FILE = "clarification-session.json";

/**
 * @returns {string}
 */
function resolveSetupBossRepoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

/**
 * @param {string[]} argv
 * @returns {{
 *   run: string|null,
 *   json: boolean,
 *   skipLlm: boolean,
 *   answersPath: string|null,
 *   answerPairs: { question_id: string, value: string }[],
 *   overwrite: boolean,
 *   refine: boolean,
 *   approve: boolean,
 *   reject: boolean,
 *   approvalNotes: string,
 * }}
 */
function parseClarifyCliArgs(argv) {
  /** @type {{
   *   run: string|null,
   *   json: boolean,
   *   skipLlm: boolean,
   *   answersPath: string|null,
   *   answerPairs: { question_id: string, value: string }[],
   *   overwrite: boolean,
   *   refine: boolean,
   *   approve: boolean,
   *   reject: boolean,
   *   approvalNotes: string,
   * }} */
  const opts = {
    run: null,
    json: false,
    skipLlm: false,
    answersPath: null,
    answerPairs: [],
    overwrite: false,
    refine: false,
    approve: false,
    reject: false,
    approvalNotes: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--approve") {
      opts.approve = true;
      continue;
    }
    if (a === "--reject") {
      opts.reject = true;
      continue;
    }
    if (a === "--refine") {
      opts.refine = true;
      continue;
    }
    if (a === "--approval-notes") {
      opts.approvalNotes = argv[++i] != null ? String(argv[i]) : "";
      continue;
    }
    if (a.startsWith("--approval-notes=")) {
      opts.approvalNotes = a.slice("--approval-notes=".length);
      continue;
    }
    if (a === "--overwrite") {
      opts.overwrite = true;
      continue;
    }
    if (a === "--skip-llm" || a === "--skipLlm") {
      opts.skipLlm = true;
      continue;
    }
    if (a === "--run") {
      opts.run = argv[++i] != null ? String(argv[i]) : "";
      continue;
    }
    if (a.startsWith("--run=")) {
      opts.run = a.slice("--run=".length);
      continue;
    }
    if (a === "--answers") {
      opts.answersPath = argv[++i] != null ? String(argv[i]) : "";
      continue;
    }
    if (a.startsWith("--answers=")) {
      opts.answersPath = a.slice("--answers=".length);
      continue;
    }
    if (a === "--answer") {
      const raw = argv[++i] != null ? String(argv[i]) : "";
      const eq = raw.indexOf("=");
      if (eq > 0) {
        opts.answerPairs.push({
          question_id: raw.slice(0, eq).trim(),
          value: raw.slice(eq + 1).trim(),
        });
      }
      continue;
    }
  }
  if (opts.run != null) opts.run = String(opts.run).trim();
  if (opts.answersPath != null) opts.answersPath = String(opts.answersPath).trim();
  if (opts.approvalNotes != null) opts.approvalNotes = String(opts.approvalNotes);
  return opts;
}

/**
 * @param {string} outputDir
 * @returns {string|null}
 */
function readRunType(outputDir) {
  const rcPath = path.join(outputDir, "run-context.json");
  try {
    const raw = fs.readFileSync(rcPath, "utf-8");
    const rc = JSON.parse(raw);
    return rc.run_type != null ? String(rc.run_type) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @returns {object|null}
 */
function loadClassificationArtifact(outputDir) {
  const p = path.join(outputDir, "intake-classification.json");
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @returns {object|null}
 */
function loadRunContext(outputDir) {
  const rcPath = path.join(outputDir, "run-context.json");
  try {
    const raw = fs.readFileSync(rcPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDirAbs
 */
function readQuestionsCountFromDisk(outputDirAbs) {
  const fp = path.join(outputDirAbs, QUESTIONS_FILE);
  if (!fs.existsSync(fp)) return 0;
  try {
    const qj = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return Array.isArray(qj.questions) ? qj.questions.length : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {string} outputDirAbs
 */
function readAnswersCountFromDisk(outputDirAbs) {
  const ex = loadExistingAnswersDoc(outputDirAbs);
  return ex.ok ? ex.count : 0;
}

/**
 * @param {{
 *   runId: string,
 *   outputDirAbs: string,
 *   phase2Status: string,
 *   currentRound: number,
 *   questionsCount: number,
 *   answersCount: number,
 *   pendingBlockingCount: number,
 *   artifacts: string[],
 * }} p
 */
function baseSuccessCore(p) {
  /** @type {Record<string, unknown>} */
  const core = {
    ok: true,
    runId: p.runId,
    outputDir: p.outputDirAbs,
    phase2Status: p.phase2Status,
    currentRound: p.currentRound,
    questionsCount: p.questionsCount,
    answersCount: p.answersCount,
    pendingBlockingCount: p.pendingBlockingCount,
    artifacts: p.artifacts,
  };
  if (p.refineSideEffects && typeof p.refineSideEffects === "object") {
    core.refineSideEffects = p.refineSideEffects;
  }
  return core;
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   runId: string,
 *   runContext: object,
 *   skipLlm: boolean,
 *   llmClient: object|null,
 * }} p
 * @returns {Promise<{ ok: true, artifacts: string[], questionsCount: number } | { ok: false, error: { code: string, message: string } }>}
 */
async function persistQuestionGeneration(p) {
  const repoRoot = resolveSetupBossRepoRoot();
  const gen = await generateClarificationQuestions({
    outputDir: p.outputDirAbs,
    repoRoot,
    skipLlm: p.skipLlm,
    llmClient: p.llmClient || null,
  });

  if (!gen.ok) {
    return { ok: false, error: gen.error };
  }

  const sessionPath = path.join(p.outputDirAbs, SESSION_FILE);
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  const roundEntry = {
    round: 1,
    status: "questions_generated",
    questions_artifact: QUESTIONS_FILE,
  };
  const rounds = Array.isArray(session.rounds) ? session.rounds.slice() : [];
  const existingIdx = rounds.findIndex((r) => r && Number(r.round) === 1);
  if (existingIdx >= 0) {
    rounds[existingIdx] = { ...rounds[existingIdx], ...roundEntry };
  } else {
    rounds.push(roundEntry);
  }

  const nextSession = {
    ...session,
    status: PHASE2_QUESTIONS_STATUS,
    current_round: 1,
    rounds,
  };
  fs.writeFileSync(sessionPath, JSON.stringify(nextSession, null, 2), "utf-8");

  const phase2Prev = p.runContext.phase2 || {};
  const prevArtifacts = Array.isArray(phase2Prev.artifacts)
    ? phase2Prev.artifacts.slice()
    : [];
  if (!prevArtifacts.includes(QUESTIONS_FILE)) {
    prevArtifacts.push(QUESTIONS_FILE);
  }

  const nextPhase2 = {
    ...phase2Prev,
    schema_version: phase2Prev.schema_version || "1.0.0",
    status: PHASE2_QUESTIONS_STATUS,
    current_round: 1,
    started_at:
      phase2Prev.started_at != null
        ? String(phase2Prev.started_at)
        : new Date().toISOString(),
    artifacts: prevArtifacts,
  };

  const nextRc = { ...p.runContext, phase2: nextPhase2 };
  fs.writeFileSync(
    path.join(p.outputDirAbs, "run-context.json"),
    JSON.stringify(nextRc, null, 2),
    "utf-8",
  );

  return {
    ok: true,
    artifacts: [QUESTIONS_FILE, SESSION_FILE, "run-context.json"],
    questionsCount: gen.questionsCount,
  };
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   runContext: object,
 *   cwd: string,
 *   answersPath: string|null,
 *   answerPairs: { question_id: string, value: string }[],
 *   overwrite: boolean,
 * }} p
 * @returns {Promise<
 *   | { ok: true, artifacts: string[], answersCount: number, idempotent?: boolean, round?: number }
 *   | { ok: false, error: { code: string, message: string }, pendingBlockingCount?: number }
 * >}
 */
async function persistAnswersPhase(p) {
  const answersPathFull = path.join(p.outputDirAbs, ANSWERS_FILE);
  const existing = loadExistingAnswersDoc(p.outputDirAbs);
  if (existing.ok && !p.overwrite) {
    let round = 1;
    try {
      const sessionPath = path.join(p.outputDirAbs, SESSION_FILE);
      const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
      round = Number(session.current_round) || 1;
    } catch (_) {
      /* */
    }
    return {
      ok: true,
      idempotent: true,
      artifacts: [],
      answersCount: existing.count,
      round,
    };
  }

  const qLoad = loadClarificationQuestions(p.outputDirAbs);
  if (!qLoad.ok) {
    return { ok: false, error: qLoad.error };
  }

  const parsedIn = parseAnswersInput({
    answersPath: p.answersPath,
    answerPairs: p.answerPairs,
    cwd: p.cwd,
  });
  if (!parsedIn.ok) {
    return { ok: false, error: parsedIn.error };
  }

  const val = validateClarificationAnswers(
    { questions: qLoad.doc.questions },
    parsedIn.payload,
  );
  if (!val.ok) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_ANSWERS_VALIDATION",
        message: val.errors.join(" "),
      },
      pendingBlockingCount: val.pendingBlocking,
    };
  }

  const round = Number(qLoad.doc.round) || 1;
  const artifact = buildClarificationAnswersArtifact({
    round,
    normalizedAnswers: val.normalized,
  });
  fs.writeFileSync(answersPathFull, JSON.stringify(artifact, null, 2), "utf-8");

  const sessionPath = path.join(p.outputDirAbs, SESSION_FILE);
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  const rounds = Array.isArray(session.rounds) ? session.rounds.slice() : [];
  const existingIdx = rounds.findIndex((r) => r && Number(r.round) === round);
  const roundUpdate = {
    round,
    status: "answers_recorded",
    answers_artifact: ANSWERS_FILE,
    answers_count: val.normalized.length,
  };
  if (existingIdx >= 0) {
    rounds[existingIdx] = { ...rounds[existingIdx], ...roundUpdate };
  } else {
    rounds.push(roundUpdate);
  }

  const nextSession = {
    ...session,
    status: PHASE2_ANSWERS_STATUS,
    current_round: round,
    rounds,
  };
  fs.writeFileSync(sessionPath, JSON.stringify(nextSession, null, 2), "utf-8");

  const phase2Prev = p.runContext.phase2 || {};
  const prevArtifacts = Array.isArray(phase2Prev.artifacts)
    ? phase2Prev.artifacts.slice()
    : [];
  if (!prevArtifacts.includes(ANSWERS_FILE)) {
    prevArtifacts.push(ANSWERS_FILE);
  }

  const nextPhase2 = {
    ...phase2Prev,
    schema_version: phase2Prev.schema_version || "1.0.0",
    status: PHASE2_ANSWERS_STATUS,
    current_round: round,
    started_at:
      phase2Prev.started_at != null
        ? String(phase2Prev.started_at)
        : new Date().toISOString(),
    artifacts: prevArtifacts,
  };

  const nextRc = { ...p.runContext, phase2: nextPhase2 };
  fs.writeFileSync(
    path.join(p.outputDirAbs, "run-context.json"),
    JSON.stringify(nextRc, null, 2),
    "utf-8",
  );

  return {
    ok: true,
    artifacts: [ANSWERS_FILE, SESSION_FILE, "run-context.json"],
    answersCount: val.normalized.length,
    round,
  };
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   runContext: object,
 *   repoRoot: string,
 *   skipLlm: boolean,
 *   llmClient: object|null,
 *   overwrite: boolean,
 * }} p
 * @returns {Promise<
 *   | { ok: true, artifacts: string[], round: number, idempotent?: boolean }
 *   | { ok: false, error: { code: string, message: string } }
 * >}
 */
async function persistPlanRefinedPhase(p) {
  const refinedPath = path.join(p.outputDirAbs, PLAN_REFINED_FILE);
  if (fs.existsSync(refinedPath) && !p.overwrite) {
    let round = 1;
    try {
      const sessionPath = path.join(p.outputDirAbs, SESSION_FILE);
      const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
      round = Number(session.current_round) || 1;
    } catch (_) {
      /* */
    }
    return {
      ok: true,
      idempotent: true,
      artifacts: [],
      round,
    };
  }

  const gen = await refineTaskPlan({
    outputDirAbs: p.outputDirAbs,
    repoRoot: p.repoRoot,
    skipLlm: p.skipLlm,
    llmClient: p.llmClient || null,
  });
  if (!gen.ok) {
    return { ok: false, error: gen.error };
  }

  const refineSideEffects = {
    localInitialPlanWritten: Boolean(gen.localInitialPlanWritten),
    localDiscoveryWritten: Boolean(gen.localDiscoveryWritten),
  };

  let round = 1;
  try {
    const ado = JSON.parse(
      fs.readFileSync(path.join(p.outputDirAbs, ANSWERS_FILE), "utf-8"),
    );
    round = Number(ado.round) || 1;
  } catch (_) {
    /* */
  }

  const sessionPath = path.join(p.outputDirAbs, SESSION_FILE);
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  const rounds = Array.isArray(session.rounds) ? session.rounds.slice() : [];
  const existingIdx = rounds.findIndex((r) => r && Number(r.round) === round);
  const roundUpdate = {
    round,
    status: "plan_refined",
    plan_artifact: PLAN_REFINED_FILE,
  };
  if (existingIdx >= 0) {
    rounds[existingIdx] = { ...rounds[existingIdx], ...roundUpdate };
  } else {
    rounds.push(roundUpdate);
  }

  const nextSession = {
    ...session,
    status: PHASE2_PLAN_REFINED_STATUS,
    current_round: round,
    rounds,
  };
  fs.writeFileSync(sessionPath, JSON.stringify(nextSession, null, 2), "utf-8");

  const phase2Prev = p.runContext.phase2 || {};
  const prevArtifacts = Array.isArray(phase2Prev.artifacts)
    ? phase2Prev.artifacts.slice()
    : [];
  if (!prevArtifacts.includes(PLAN_REFINED_FILE)) {
    prevArtifacts.push(PLAN_REFINED_FILE);
  }

  const nextPhase2 = {
    ...phase2Prev,
    schema_version: phase2Prev.schema_version || "1.0.0",
    status: PHASE2_PLAN_REFINED_STATUS,
    current_round: round,
    started_at:
      phase2Prev.started_at != null
        ? String(phase2Prev.started_at)
        : new Date().toISOString(),
    artifacts: prevArtifacts,
    plan: {
      artifact: PLAN_REFINED_FILE,
      status: "refined",
    },
  };

  const nextRc = { ...p.runContext, phase2: nextPhase2 };
  fs.writeFileSync(
    path.join(p.outputDirAbs, "run-context.json"),
    JSON.stringify(nextRc, null, 2),
    "utf-8",
  );

  return {
    ok: true,
    artifacts: [PLAN_REFINED_FILE, SESSION_FILE, "run-context.json"],
    round,
    refineSideEffects,
  };
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   runContext: object,
 *   decision: "approved"|"rejected",
 *   notes: string,
 *   operatorRecommendedMode?: string|null,
 *   overwrite: boolean,
 * }} p
 * @returns {Promise<
 *   | {
 *       ok: true,
 *       artifacts: string[],
 *       round: number,
 *       idempotent?: boolean,
 *       decision: string,
 *       planSha256: string,
 *       planRef: string,
 *     }
 *   | { ok: false, error: { code: string, message: string }, pendingBlockingCount?: number }
 * >}
 */
async function persistApprovalPhase(p) {
  const approvalPath = path.join(p.outputDirAbs, APPROVAL_STATE_FILE);
  if (fs.existsSync(approvalPath) && !p.overwrite) {
    const loaded = loadApprovalState(p.outputDirAbs);
    if (!loaded.ok) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_APPROVAL_STATE_READ",
          message: `${APPROVAL_STATE_FILE} ilegível ou corrompido.`,
        },
      };
    }
    const v = validateApprovalState(loaded.doc);
    if (!v.ok) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_APPROVAL_STATE_INVALID",
          message: v.errors.join(" "),
        },
      };
    }
    let round = 1;
    try {
      const sessionPath = path.join(p.outputDirAbs, SESSION_FILE);
      const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
      round = Number(session.current_round) || 1;
    } catch (_) {
      /* */
    }
    const doc = /** @type {Record<string, unknown>} */ (loaded.doc);
    return {
      ok: true,
      idempotent: true,
      artifacts: [],
      round,
      decision: String(doc.status || ""),
      planSha256: String(doc.plan_sha256 || ""),
      planRef: String(doc.plan_ref || PLAN_REFINED_FILE),
    };
  }

  const planPath = path.join(p.outputDirAbs, PLAN_REFINED_FILE);
  const sha = computeFileSha256(planPath);
  const doc = buildApprovalState({
    decision: p.decision,
    planRef: PLAN_REFINED_FILE,
    planSha256: sha,
    notes: p.notes,
    operatorRecommendedMode: p.operatorRecommendedMode ?? null,
  });
  fs.writeFileSync(approvalPath, JSON.stringify(doc, null, 2), "utf-8");

  let round = 1;
  try {
    const ado = JSON.parse(
      fs.readFileSync(path.join(p.outputDirAbs, ANSWERS_FILE), "utf-8"),
    );
    round = Number(ado.round) || 1;
  } catch (_) {
    try {
      const sessionPath0 = path.join(p.outputDirAbs, SESSION_FILE);
      const session0 = JSON.parse(fs.readFileSync(sessionPath0, "utf-8"));
      round = Number(session0.current_round) || 1;
    } catch (_e) {
      /* */
    }
  }

  const sessionPath = path.join(p.outputDirAbs, SESSION_FILE);
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  const rounds = Array.isArray(session.rounds) ? session.rounds.slice() : [];
  const existingIdx = rounds.findIndex((r) => r && Number(r.round) === round);
  const roundApprovalStatus = p.decision === "approved" ? "approved" : "rejected";
  const roundUpdate = {
    round,
    status: roundApprovalStatus,
    approval_artifact: APPROVAL_STATE_FILE,
  };
  if (existingIdx >= 0) {
    rounds[existingIdx] = { ...rounds[existingIdx], ...roundUpdate };
  } else {
    rounds.push(roundUpdate);
  }

  const nextSessionStatus =
    p.decision === "approved"
      ? PHASE2_READY_FOR_EXECUTION
      : PHASE2_APPROVAL_REJECTED;

  const nextSession = {
    ...session,
    status: nextSessionStatus,
    current_round: round,
    rounds,
  };
  fs.writeFileSync(sessionPath, JSON.stringify(nextSession, null, 2), "utf-8");

  const phase2Prev = p.runContext.phase2 || {};
  const prevArtifacts = Array.isArray(phase2Prev.artifacts)
    ? phase2Prev.artifacts.slice()
    : [];
  if (!prevArtifacts.includes(APPROVAL_STATE_FILE)) {
    prevArtifacts.push(APPROVAL_STATE_FILE);
  }

  const nextPhase2Status =
    p.decision === "approved"
      ? PHASE2_READY_FOR_EXECUTION
      : PHASE2_APPROVAL_REJECTED;

  const nextPhase2 = {
    ...phase2Prev,
    schema_version: phase2Prev.schema_version || "1.0.0",
    status: nextPhase2Status,
    current_round: round,
    started_at:
      phase2Prev.started_at != null
        ? String(phase2Prev.started_at)
        : new Date().toISOString(),
    artifacts: prevArtifacts,
    approval: {
      status: p.decision === "approved" ? "approved" : "rejected",
      artifact: APPROVAL_STATE_FILE,
      plan_ref: PLAN_REFINED_FILE,
      plan_sha256: sha,
    },
  };

  const nextRc = { ...p.runContext, phase2: nextPhase2 };
  fs.writeFileSync(
    path.join(p.outputDirAbs, "run-context.json"),
    JSON.stringify(nextRc, null, 2),
    "utf-8",
  );

  return {
    ok: true,
    artifacts: [APPROVAL_STATE_FILE, SESSION_FILE, "run-context.json"],
    round,
    decision: p.decision,
    planSha256: sha,
    planRef: PLAN_REFINED_FILE,
  };
}

/**
 * @param {{
 *   runOrPath: string,
 *   cwd?: string,
 *   skipLlm?: boolean,
 *   llmClient?: { responses: { create: (opts: object) => Promise<{ output_text?: string }> } }|null,
 *   answersPath?: string|null,
 *   answerPairs?: { question_id: string, value: string }[],
 *   overwrite?: boolean,
 *   refine?: boolean,
 *   approve?: boolean,
 *   reject?: boolean,
 *   approvalNotes?: string,
 *   operatorRecommendedMode?: string|null,
 * }} input
 * @returns {Promise<{
 *   ok: true,
 *   runId: string,
 *   outputDir: string,
 *   phase2Status: string,
 *   currentRound: number,
 *   questionsCount: number,
 *   answersCount: number,
 *   pendingBlockingCount: number,
 *   artifacts: string[],
 * } | {
 *   ok: false,
 *   runId: string|null,
 *   outputDir: string|null,
 *   phase2Status: null,
 *   currentRound: null,
 *   questionsCount: null,
 *   answersCount: null,
 *   pendingBlockingCount: null,
 *   artifacts: string[],
 *   error: { code: string, message: string },
 * }>}
 */
async function executeClarification(input) {
  const runOrPath = String(input.runOrPath || "").trim();
  const cwd = path.resolve(input.cwd || process.cwd());
  const skipLlm = Boolean(input.skipLlm);
  const llmClient = input.llmClient != null ? input.llmClient : null;
  const answersPath =
    input.answersPath != null ? String(input.answersPath).trim() : "";
  const answerPairs = Array.isArray(input.answerPairs)
    ? input.answerPairs
    : [];
  const overwrite = Boolean(input.overwrite);
  const wantsRefine = Boolean(input.refine);
  const wantsApprove = Boolean(input.approve);
  const wantsReject = Boolean(input.reject);
  const approvalNotes =
    input.approvalNotes != null ? String(input.approvalNotes) : "";
  const operatorRecommendedMode =
    input.operatorRecommendedMode != null
      ? String(input.operatorRecommendedMode).trim()
      : "";

  const wantsAnswers = Boolean(answersPath) || answerPairs.length > 0;

  /** @type {string[]} */
  const artifacts = [];

  const fail = (partial) => ({
    ok: false,
    runId: partial.runId != null ? partial.runId : null,
    outputDir: partial.outputDir != null ? partial.outputDir : null,
    phase2Status: null,
    currentRound: null,
    questionsCount: null,
    answersCount: null,
    pendingBlockingCount:
      typeof partial.pendingBlockingCount === "number"
        ? partial.pendingBlockingCount
        : null,
    artifacts,
    error: partial.error,
  });

  if (wantsRefine && wantsAnswers) {
    return fail({
      error: {
        code: "CLARIFY_CLI_CONFLICT",
        message:
          "Não combine --refine com submissão de respostas (--answers / --answer) na mesma invocação.",
      },
    });
  }

  if (wantsApprove && wantsReject) {
    return fail({
      error: {
        code: "CLARIFY_CLI_CONFLICT",
        message: "Não combine --approve com --reject na mesma invocação.",
      },
    });
  }

  if ((wantsApprove || wantsReject) && wantsRefine) {
    return fail({
      error: {
        code: "CLARIFY_CLI_CONFLICT",
        message: "Não combine --approve/--reject com --refine na mesma invocação.",
      },
    });
  }

  if ((wantsApprove || wantsReject) && wantsAnswers) {
    return fail({
      error: {
        code: "CLARIFY_CLI_CONFLICT",
        message:
          "Não combine --approve/--reject com submissão de respostas (--answers / --answer).",
      },
    });
  }

  if (!runOrPath) {
    return fail({
      error: {
        code: "CLARIFY_RUN_OR_PATH_MISSING",
        message: "runOrPath obrigatório (run id indexado ou caminho para a pasta de output do intake).",
      },
    });
  }

  let outputDir;
  try {
    try {
      outputDir = resolveOutputDir(runOrPath);
    } catch (firstErr) {
      if (path.isAbsolute(runOrPath)) {
        throw firstErr;
      }
      const viaCwd = path.resolve(cwd, runOrPath);
      try {
        outputDir = resolveOutputDir(viaCwd);
      } catch {
        throw firstErr;
      }
    }
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    return fail({
      error: { code: "CLARIFY_RESOLVE_FAILED", message },
    });
  }

  const outputDirAbs = path.resolve(outputDir);
  const runId = path.basename(outputDirAbs);

  if (answerPairs.length > 0) {
    const seenCli = new Set();
    for (const p of answerPairs) {
      const id = p && p.question_id != null ? String(p.question_id).trim() : "";
      if (seenCli.has(id)) {
        return fail({
          runId,
          outputDir: outputDirAbs,
          error: {
            code: "CLARIFY_ANSWERS_DUPLICATE_CLI",
            message: `question_id duplicado em --answer: ${id}`,
          },
        });
      }
      seenCli.add(id);
    }
  }

  const runType = readRunType(outputDirAbs);
  if (runType !== "intake") {
    return fail({
      runId,
      outputDir: outputDirAbs,
      error: {
        code: "CLARIFY_NOT_INTAKE_RUN",
        message:
          runType == null
            ? "run-context.json em falta ou ilegível; esperado run_type intake."
            : `Corrida não é intake (run_type=${runType}). Clarificação só suporta outputs de intake.`,
      },
    });
  }

  const validation = validateIntakeArtifacts(outputDirAbs);
  if (!validation.ok) {
    const msg =
      validation.errors && validation.errors.length
        ? validation.errors.join(" ")
        : "Validação de artefactos intake falhou.";
    return fail({
      runId,
      outputDir: outputDirAbs,
      error: { code: "CLARIFY_INTAKE_ARTIFACTS_INVALID", message: msg },
    });
  }

  let runContext = loadRunContext(outputDirAbs);
  if (!runContext || typeof runContext !== "object") {
    return fail({
      runId,
      outputDir: outputDirAbs,
      error: {
        code: "CLARIFY_RUN_CONTEXT_INVALID",
        message: "run-context.json ilegível após validação.",
      },
    });
  }

  loadClassificationArtifact(outputDirAbs);

  const questionsDisk = path.join(outputDirAbs, QUESTIONS_FILE);
  const answersDisk = path.join(outputDirAbs, ANSWERS_FILE);
  const sessionPath = path.join(outputDirAbs, SESSION_FILE);
  const refinedDisk = path.join(outputDirAbs, PLAN_REFINED_FILE);
  const approvalDisk = path.join(outputDirAbs, APPROVAL_STATE_FILE);

  const phase2 = runContext.phase2;
  const hasPhase2 = phase2 && typeof phase2 === "object";
  const st = hasPhase2 ? String(phase2.status || "") : "";

  const qc = readQuestionsCountFromDisk(outputDirAbs);
  const ac = readAnswersCountFromDisk(outputDirAbs);

  const isPassive =
    !wantsAnswers && !wantsRefine && !wantsApprove && !wantsReject;
  const clarifyOk = (r) =>
    enrichClarifySuccessResult(r, outputDirAbs, runId, isPassive);
  const baseSuccess = (p) => clarifyOk(baseSuccessCore(p));

  if (wantsApprove || wantsReject) {
    const decision = wantsApprove ? "approved" : "rejected";
    if (!fs.existsSync(sessionPath)) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_SESSION_MISSING",
          message: `${SESSION_FILE} em falta; execute clarify uma vez para inicializar.`,
        },
      });
    }
    if (!fs.existsSync(refinedDisk)) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_APPROVAL_PLAN_MISSING",
          message: `${PLAN_REFINED_FILE} em falta; execute --refine antes de --approve/--reject.`,
        },
      });
    }

    const idempotentApproval = fs.existsSync(approvalDisk) && !overwrite;
    if (!idempotentApproval) {
      const readyChk = checkApprovalReadiness(outputDirAbs);
      if (!readyChk.ok) {
        return fail({
          runId,
          outputDir: outputDirAbs,
          error: readyChk.error,
          pendingBlockingCount: readyChk.pendingBlockingCount,
        });
      }
      if (decision === "rejected") {
        if (st !== PHASE2_PLAN_REFINED_STATUS) {
          return fail({
            runId,
            outputDir: outputDirAbs,
            error: {
              code: "CLARIFY_APPROVAL_BAD_PHASE",
              message: `--reject exige phase2.status=${PHASE2_PLAN_REFINED_STATUS}.`,
            },
          });
        }
      } else {
        const allowApprove =
          st === PHASE2_PLAN_REFINED_STATUS ||
          (overwrite && st === PHASE2_READY_FOR_EXECUTION);
        if (!allowApprove) {
          return fail({
            runId,
            outputDir: outputDirAbs,
            error: {
              code: "CLARIFY_APPROVAL_BAD_PHASE",
              message: `--approve exige phase2.status=${PHASE2_PLAN_REFINED_STATUS} (ou ready_for_execution com --overwrite para regravar).`,
            },
          });
        }
      }
    }

    runContext = loadRunContext(outputDirAbs);
    if (!runContext || !runContext.phase2) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_SESSION_INVALID",
          message: "Estado de clarificação inconsistente (session/run-context).",
        },
      });
    }

    const pa = await persistApprovalPhase({
      outputDirAbs,
      runContext,
      decision,
      notes: approvalNotes,
      operatorRecommendedMode: operatorRecommendedMode || null,
      overwrite,
    });

    if (!pa.ok) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: pa.error,
        pendingBlockingCount: pa.pendingBlockingCount,
      });
    }

    /** @type {string[]} */
    let strategyArtifacts = [];
    if (pa.decision === "approved") {
      const { runStrategyRuntimeBase } = require("../strategy-runtime/run-strategy-runtime");
      let getWorkspaceRun;
      let updateWorkspaceRun;
      let loadWorkspaceRunsUnsafe;
      let resolveProjectForWorkspaceStrategy;
      try {
        const wsReg = require("../../daemon/lib/workspace-run-registry");
        const projReg = require("../../daemon/lib/project-registry");
        const stratApi = require("../../daemon/lib/run-strategy-api");
        getWorkspaceRun = wsReg.getWorkspaceRun;
        updateWorkspaceRun = wsReg.updateWorkspaceRun;
        loadWorkspaceRunsUnsafe = wsReg.loadWorkspaceRunsUnsafe;
        resolveProjectForWorkspaceStrategy =
          stratApi.resolveProjectForWorkspaceStrategy;
      } catch (_) {
        /* daemon registry indisponível (CLI puro) */
      }

      const sr = runStrategyRuntimeBase({
        outputDirAbs,
        runId,
        force: overwrite && wantsApprove,
        getWorkspaceRun,
        resolveProject: resolveProjectForWorkspaceStrategy,
      });
      if (!sr.ok) {
        return fail({
          runId,
          outputDir: outputDirAbs,
          error: sr.error,
        });
      }
      strategyArtifacts = Array.isArray(sr.artifacts) ? sr.artifacts.slice() : [];

      if (getWorkspaceRun && updateWorkspaceRun && loadWorkspaceRunsUnsafe) {
        try {
          const { syncWorkspaceAfterPlanningStrategy } = require("../../../core/sync-workspace-after-planning-strategy");
          const wsSync = syncWorkspaceAfterPlanningStrategy({
            planningRunId: runId,
            outputDirAbs,
            loadWorkspaceRuns: () => loadWorkspaceRunsUnsafe(),
            getWorkspaceRun,
            updateWorkspaceRun,
            resolveProject: resolveProjectForWorkspaceStrategy,
            force: overwrite && wantsApprove,
          });
          if (wsSync.ok && wsSync.workspaceRunId && !wsSync.skipped) {
            try {
              const { notifyWorkspaceRunSse } = require("../../daemon/lib/workspace-run-sse");
              notifyWorkspaceRunSse("workspace_run.updated", wsSync.workspaceRunId, {
                runId,
                message: `Materializadas ${wsSync.miniActivityCount ?? 0} mini-atividades`,
              });
            } catch (_) {
              /* */
            }
          }
        } catch (_) {
          /* */
        }
      }
    }

    const rcFresh = loadRunContext(outputDirAbs);
    const phaseOut = pa.idempotent
      ? pa.decision === "approved"
        ? PHASE2_READY_FOR_EXECUTION
        : PHASE2_APPROVAL_REJECTED
      : rcFresh && rcFresh.phase2 && rcFresh.phase2.status != null
        ? String(rcFresh.phase2.status)
        : pa.decision === "approved"
          ? PHASE2_READY_FOR_EXECUTION
          : PHASE2_APPROVAL_REJECTED;
    const outRound =
      typeof pa.round === "number" && Number.isFinite(pa.round) ? pa.round : 1;
    const mergedApprovalArtifacts = (pa.artifacts || []).concat(strategyArtifacts);

    return clarifyOk({
      ...baseSuccessCore({
        runId,
        outputDirAbs,
        phase2Status: phaseOut,
        currentRound: outRound,
        questionsCount: qc,
        answersCount: ac,
        pendingBlockingCount: 0,
        artifacts: mergedApprovalArtifacts,
      }),
      approvalStatus: pa.decision,
      planRef: pa.planRef,
      planSha256: pa.planSha256,
      approvalArtifact: APPROVAL_STATE_FILE,
    });
  }

  if (wantsRefine) {
    if (!fs.existsSync(questionsDisk)) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_REFINE_QUESTIONS_MISSING",
          message: `${QUESTIONS_FILE} em falta; gere perguntas antes de --refine.`,
        },
      });
    }
    if (!fs.existsSync(answersDisk)) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_REFINE_ANSWERS_MISSING",
          message: `${ANSWERS_FILE} em falta; grave respostas antes de --refine.`,
        },
      });
    }
    if (!fs.existsSync(sessionPath)) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_SESSION_MISSING",
          message: `${SESSION_FILE} em falta; execute clarify uma vez para inicializar.`,
        },
      });
    }

    if (fs.existsSync(refinedDisk) && !overwrite) {
      let idRound = 1;
      try {
        const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
        idRound = Number(session.current_round) || 1;
      } catch (_) {
        /* */
      }
      return baseSuccess({
        runId,
        outputDirAbs,
        phase2Status: PHASE2_PLAN_REFINED_STATUS,
        currentRound: idRound,
        questionsCount: qc,
        answersCount: ac,
        pendingBlockingCount: 0,
        artifacts: [],
      });
    }

    runContext = loadRunContext(outputDirAbs);
    if (!runContext || !runContext.phase2) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_SESSION_INVALID",
          message: "Estado de clarificação inconsistente (session/run-context).",
        },
      });
    }

    const pr = await persistPlanRefinedPhase({
      outputDirAbs,
      runContext,
      repoRoot: resolveSetupBossRepoRoot(),
      skipLlm,
      llmClient,
      overwrite,
    });

    if (!pr.ok) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: pr.error,
      });
    }

    const outRound =
      typeof pr.round === "number" && Number.isFinite(pr.round) ? pr.round : 1;
    return baseSuccess({
      runId,
      outputDirAbs,
      phase2Status: PHASE2_PLAN_REFINED_STATUS,
      currentRound: outRound,
      questionsCount: qc,
      answersCount: ac,
      pendingBlockingCount: 0,
      artifacts: pr.artifacts,
      refineSideEffects:
        pr.refineSideEffects && typeof pr.refineSideEffects === "object"
          ? pr.refineSideEffects
          : undefined,
    });
  }

  if (wantsAnswers) {
    if (!fs.existsSync(questionsDisk)) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_ANSWERS_QUESTIONS_MISSING",
          message: `${QUESTIONS_FILE} em falta; gere perguntas antes de gravar respostas.`,
        },
      });
    }
    if (st === PHASE2_INITIAL_STATUS || !hasPhase2) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_ANSWERS_NEED_QUESTIONS",
          message:
            "Gere perguntas (fase questions_generated) antes de submeter respostas.",
        },
      });
    }
    const allowAnswers =
      st === PHASE2_QUESTIONS_STATUS ||
      (st === PHASE2_ANSWERS_STATUS && overwrite);
    if (!allowAnswers) {
      if (st === PHASE2_ANSWERS_STATUS && fs.existsSync(answersDisk) && !overwrite) {
        return baseSuccess({
          runId,
          outputDirAbs,
          phase2Status: PHASE2_ANSWERS_STATUS,
          currentRound: Number(phase2.current_round) || 1,
          questionsCount: qc,
          answersCount: ac,
          pendingBlockingCount: 0,
          artifacts: [],
        });
      }
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_ANSWERS_BAD_PHASE",
          message: `Estado phase2 (${st}) não permite gravar respostas neste momento.`,
        },
      });
    }

    runContext = loadRunContext(outputDirAbs);
    if (!runContext || !runContext.phase2) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_SESSION_INVALID",
          message: "Estado de clarificação inconsistente (session/run-context).",
        },
      });
    }
    if (!fs.existsSync(sessionPath)) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: {
          code: "CLARIFY_SESSION_MISSING",
          message: `${SESSION_FILE} em falta; execute clarify uma vez para inicializar.`,
        },
      });
    }

    const ap = await persistAnswersPhase({
      outputDirAbs,
      runContext,
      cwd,
      answersPath: answersPath || null,
      answerPairs,
      overwrite,
    });

    if (!ap.ok) {
      return fail({
        runId,
        outputDir: outputDirAbs,
        error: ap.error,
        pendingBlockingCount: ap.pendingBlockingCount,
      });
    }

    const outRound =
      typeof ap.round === "number" && Number.isFinite(ap.round) ? ap.round : 1;
    return baseSuccess({
      runId,
      outputDirAbs,
      phase2Status: PHASE2_ANSWERS_STATUS,
      currentRound: outRound,
      questionsCount: qc,
      answersCount: ap.answersCount,
      pendingBlockingCount: 0,
      artifacts: ap.artifacts,
    });
  }

  if (st === PHASE2_READY_FOR_EXECUTION) {
    let approvalStatus = "approved";
    let planRef = PLAN_REFINED_FILE;
    let planSha256 = "";
    const ld = loadApprovalState(outputDirAbs);
    if (ld.ok) {
      approvalStatus = String(ld.doc.status || "approved");
      planRef = String(ld.doc.plan_ref || PLAN_REFINED_FILE);
      planSha256 = String(ld.doc.plan_sha256 || "");
    }
    return clarifyOk({
      ...baseSuccessCore({
        runId,
        outputDirAbs,
        phase2Status: PHASE2_READY_FOR_EXECUTION,
        currentRound: Number(phase2.current_round) || 1,
        questionsCount: qc,
        answersCount: ac,
        pendingBlockingCount: 0,
        artifacts: [],
      }),
      approvalStatus,
      planRef,
      planSha256,
      approvalArtifact: APPROVAL_STATE_FILE,
    });
  }

  if (st === PHASE2_APPROVAL_REJECTED) {
    let approvalStatus = "rejected";
    let planRef = PLAN_REFINED_FILE;
    let planSha256 = "";
    const ld = loadApprovalState(outputDirAbs);
    if (ld.ok) {
      approvalStatus = String(ld.doc.status || "rejected");
      planRef = String(ld.doc.plan_ref || PLAN_REFINED_FILE);
      planSha256 = String(ld.doc.plan_sha256 || "");
    }
    return clarifyOk({
      ...baseSuccessCore({
        runId,
        outputDirAbs,
        phase2Status: PHASE2_APPROVAL_REJECTED,
        currentRound: Number(phase2.current_round) || 1,
        questionsCount: qc,
        answersCount: ac,
        pendingBlockingCount: 0,
        artifacts: [],
      }),
      approvalStatus,
      planRef,
      planSha256,
      approvalArtifact: APPROVAL_STATE_FILE,
    });
  }

  if (st === PHASE2_PLAN_REFINED_STATUS) {
    if (fs.existsSync(refinedDisk)) {
      return baseSuccess({
        runId,
        outputDirAbs,
        phase2Status: PHASE2_PLAN_REFINED_STATUS,
        currentRound: Number(phase2.current_round) || 1,
        questionsCount: qc,
        answersCount: ac,
        pendingBlockingCount: 0,
        artifacts: [],
      });
    }
    return fail({
      runId,
      outputDir: outputDirAbs,
      error: {
        code: "CLARIFY_REFINE_ARTIFACT_MISSING",
        message:
          "Estado phase2 plan_refined mas task-plan-refined.md em falta; execute com --refine --overwrite para regenerar.",
      },
    });
  }

  if (st === PHASE2_ANSWERS_STATUS && fs.existsSync(answersDisk)) {
    return baseSuccess({
      runId,
      outputDirAbs,
      phase2Status: PHASE2_ANSWERS_STATUS,
      currentRound: Number(phase2.current_round) || 1,
      questionsCount: qc,
      answersCount: ac,
      pendingBlockingCount: 0,
      artifacts: [],
    });
  }

  if (st === PHASE2_QUESTIONS_STATUS && fs.existsSync(questionsDisk)) {
    return baseSuccess({
      runId,
      outputDirAbs,
      phase2Status: PHASE2_QUESTIONS_STATUS,
      currentRound: Number(phase2.current_round) || 1,
      questionsCount: qc,
      answersCount: ac,
      pendingBlockingCount: 0,
      artifacts: [],
    });
  }

  const recoveryQuestions =
    st === PHASE2_QUESTIONS_STATUS && !fs.existsSync(questionsDisk);

  const alreadyInit =
    hasPhase2 &&
    st === PHASE2_INITIAL_STATUS &&
    fs.existsSync(sessionPath);

  const skipInitBecauseAdvanced =
    hasPhase2 &&
    (st === PHASE2_QUESTIONS_STATUS ||
      st === PHASE2_ANSWERS_STATUS ||
      st === PHASE2_PLAN_REFINED_STATUS ||
      st === PHASE2_READY_FOR_EXECUTION ||
      st === PHASE2_APPROVAL_REJECTED);

  if (!alreadyInit && !recoveryQuestions && !skipInitBecauseAdvanced) {
    const startedAt = new Date().toISOString();

    const phase2Init = {
      schema_version: "1.0.0",
      status: PHASE2_INITIAL_STATUS,
      current_round: 0,
      started_at: startedAt,
      artifacts: [],
    };

    const sessionPayload = {
      schema_version: "1.0.0",
      run_id: runId,
      status: PHASE2_INITIAL_STATUS,
      current_round: 0,
      rounds: [],
    };

    fs.writeFileSync(
      sessionPath,
      JSON.stringify(sessionPayload, null, 2),
      "utf-8",
    );
    artifacts.push(SESSION_FILE);

    const nextContext = {
      ...runContext,
      phase2: phase2Init,
    };

    fs.writeFileSync(
      path.join(outputDirAbs, "run-context.json"),
      JSON.stringify(nextContext, null, 2),
      "utf-8",
    );
    artifacts.push("run-context.json");

    let fallbackApplied = false;
    /** @type {number} */
    let fbQuestionsCount = 0;
    /** @type {string[]} */
    let fbArtifacts = [];
    /** @type {string|null} */
    let fbSource = null;
    /** @type {string|null} */
    let fbReason = null;

    if (skipLlm) {
      const clsArt = loadClassificationArtifact(outputDirAbs);
      const clVal =
        clsArt && clsArt.classification != null
          ? String(clsArt.classification).trim()
          : "";
      if (clVal === "needs_context") {
        let logger = null;
        try {
          logger = require("../logger");
        } catch (_) {
          /* */
        }
        const {
          persistLocalFallbackClarificationQuestions,
          LOCAL_FALLBACK_REASON,
        } = require("./local-fallback-questions");

        if (logger) {
          logger.info("runtime.clarification_fallback.started", {
            runId,
            jobId: null,
            projectId: null,
            outputDir: outputDirAbs,
            reason: LOCAL_FALLBACK_REASON,
          });
        }

        const fb = persistLocalFallbackClarificationQuestions({
          outputDirAbs,
          runId,
        });

        if (fb.ok) {
          fallbackApplied = true;
          fbQuestionsCount = fb.questionsCount;
          fbArtifacts = Array.isArray(fb.artifacts) ? fb.artifacts.slice() : [];
          fbSource = "local_fallback";
          fbReason = LOCAL_FALLBACK_REASON;
          if (logger) {
            logger.info("runtime.clarification_fallback.questions_written", {
              runId,
              jobId: null,
              projectId: null,
              outputDir: outputDirAbs,
              questionsCount: fb.questionsCount,
              questionsPath: fb.questionsPath,
              reason: LOCAL_FALLBACK_REASON,
            });
          }
        } else {
          if (logger) {
            logger.error(
              "runtime.clarification_fallback.failed",
              new Error(fb.error?.message || "persist_failed"),
              {
                runId,
                jobId: null,
                projectId: null,
                outputDir: outputDirAbs,
                questionsCount: 0,
                questionsPath: path.join(outputDirAbs, QUESTIONS_FILE),
                reason: LOCAL_FALLBACK_REASON,
              },
            );
          }
          try {
            const rcPath = path.join(outputDirAbs, "run-context.json");
            const rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
            if (rc.phase2 && typeof rc.phase2 === "object") {
              rc.phase2.local_fallback_failed = true;
              rc.phase2.local_fallback_error = fb.error?.message
                ? String(fb.error.message).slice(0, 500)
                : "local_fallback_failed";
              fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2), "utf-8");
            }
          } catch (_) {
            /* */
          }
        }
      }
    }

    if (fallbackApplied) {
      return baseSuccess({
        runId,
        outputDirAbs,
        phase2Status: PHASE2_QUESTIONS_STATUS,
        currentRound: 1,
        questionsCount: fbQuestionsCount,
        answersCount: 0,
        pendingBlockingCount: 0,
        artifacts: artifacts.concat(fbArtifacts),
        clarificationQuestionsSource: fbSource,
        clarificationQuestionsReason: fbReason,
      });
    }

    return baseSuccess({
      runId,
      outputDirAbs,
      phase2Status: PHASE2_INITIAL_STATUS,
      currentRound: 0,
      questionsCount: 0,
      answersCount: 0,
      pendingBlockingCount: 0,
      artifacts,
    });
  }

  runContext = loadRunContext(outputDirAbs);
  if (!runContext || !runContext.phase2) {
    return fail({
      runId,
      outputDir: outputDirAbs,
      error: {
        code: "CLARIFY_SESSION_INVALID",
        message: "Estado de clarificação inconsistente (session/run-context).",
      },
    });
  }

  if (!fs.existsSync(sessionPath)) {
    return fail({
      runId,
      outputDir: outputDirAbs,
      error: {
        code: "CLARIFY_SESSION_MISSING",
        message: `${SESSION_FILE} em falta; execute clarify uma vez para inicializar.`,
      },
    });
  }

  const persisted = await persistQuestionGeneration({
    outputDirAbs,
    runId,
    runContext,
    skipLlm,
    llmClient,
  });

  if (!persisted.ok) {
    return fail({
      runId,
      outputDir: outputDirAbs,
      error: persisted.error,
    });
  }

  return baseSuccess({
    runId,
    outputDirAbs,
    phase2Status: PHASE2_QUESTIONS_STATUS,
    currentRound: 1,
    questionsCount: persisted.questionsCount,
    answersCount: 0,
    pendingBlockingCount: 0,
    artifacts: persisted.artifacts,
  });
}

module.exports = {
  parseClarifyCliArgs,
  executeClarification,
  PHASE2_INITIAL_STATUS,
  PHASE2_QUESTIONS_STATUS,
  PHASE2_ANSWERS_STATUS,
  PHASE2_PLAN_REFINED_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
  SESSION_FILE,
  QUESTIONS_FILE,
  ANSWERS_FILE,
  PLAN_REFINED_FILE,
  APPROVAL_STATE_FILE,
};
