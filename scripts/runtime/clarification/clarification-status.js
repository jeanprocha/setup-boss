"use strict";

const fs = require("fs");
const path = require("path");

const { QUESTIONS_FILE } = require("./question-generator");
const { ANSWERS_FILE } = require("./answers");
const { PLAN_REFINED_FILE } = require("./plan-refiner");
const { APPROVAL_STATE_FILE, loadApprovalState } = require("./approval");

const SESSION_NAME = "clarification-session.json";

/** @type {readonly string[]} */
const SNAPSHOT_FILES = Object.freeze([
  SESSION_NAME,
  QUESTIONS_FILE,
  ANSWERS_FILE,
  PLAN_REFINED_FILE,
  APPROVAL_STATE_FILE,
]);

const ST = Object.freeze({
  INITIAL: "clarification_initialized",
  QUESTIONS: "questions_generated",
  ANSWERS: "answers_recorded",
  PLAN_REFINED: "plan_refined",
  READY: "ready_for_execution",
  REJECTED: "approval_rejected",
});

/**
 * @param {string} outputDirAbs
 * @param {object|null} runContext
 * @returns {string[]}
 */
function collectArtifactsSnapshot(outputDirAbs, runContext) {
  const dir = path.resolve(outputDirAbs);
  /** @type {string[]} */
  const out = [];
  const push = (name) => {
    const s = String(name || "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  const phase2 = runContext && runContext.phase2;
  const fromRc = phase2 && Array.isArray(phase2.artifacts) ? phase2.artifacts : [];
  for (const a of fromRc) {
    push(a);
  }
  for (const f of SNAPSHOT_FILES) {
    if (fs.existsSync(path.join(dir, f))) push(f);
  }
  const extras = ["task-discovery.md", "task-plan-initial.md"];
  for (const f of extras) {
    if (fs.existsSync(path.join(dir, f))) push(f);
  }
  for (const f of [
    "strategy/strategy-manifest.json",
    "strategy/execution-strategy.json",
    "strategy/complexity-analysis.json",
    "strategy/ai-strategy.json",
    "strategy/shared-runtime-context.json",
    "strategy/strategy-readiness.json",
    "strategy/strategy-diagnostics.json",
  ]) {
    if (fs.existsSync(path.join(dir, f))) push(f);
  }
  return out;
}

/**
 * @param {string} outputDirAbs
 * @returns {object|null}
 */
function readRunContextFresh(outputDirAbs) {
  const fp = path.join(path.resolve(outputDirAbs), "run-context.json");
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   runId: string,
 *   hasPhase2: boolean,
 *   phase2Status: string,
 * }} p
 * @returns {{
 *   command_hint: string,
 *   reason: string,
 *   required_artifacts: string[],
 *   optional_flags: string[],
 * }}
 */
function buildNextAction(p) {
  const rid = String(p.runId || "<runId>").trim() || "<runId>";
  const base = `npm run clarify -- --run ${rid}`;

  if (!p.hasPhase2) {
    return {
      command_hint: base,
      reason: "Fase 2 ainda não iniciada nesta corrida: criar sessão e run-context.phase2.",
      required_artifacts: [],
      optional_flags: [],
    };
  }

  const st = String(p.phase2Status || "");

  switch (st) {
    case ST.INITIAL:
      return {
        command_hint: `${base} [--skip-llm]`,
        reason: "Gerar clarification-questions.json (ou vazio em modo skip-llm).",
        required_artifacts: [SESSION_NAME],
        optional_flags: ["--skip-llm"],
      };
    case ST.QUESTIONS:
      return {
        command_hint: `${base} --answer <id>=<valor>... ou --answers <ficheiro.json>`,
        reason: "Responder às perguntas de clarificação e gravar clarification-answers.json.",
        required_artifacts: [QUESTIONS_FILE],
        optional_flags: ["--answer", "--answers", "--overwrite"],
      };
    case ST.ANSWERS:
      return {
        command_hint: `${base} --refine [--skip-llm]`,
        reason: "Produzir task-plan-refined.md a partir do plano inicial e das respostas.",
        required_artifacts: [QUESTIONS_FILE, ANSWERS_FILE],
        optional_flags: ["--refine", "--skip-llm", "--overwrite"],
      };
    case ST.PLAN_REFINED:
      return {
        command_hint: `${base} --approve [--approval-notes "…"]  ou  ${base} --reject [--approval-notes "…"]`,
        reason: "Aprovar ou rejeitar explicitamente o plano refinado antes da Fase 3.",
        required_artifacts: [PLAN_REFINED_FILE],
        optional_flags: ["--approve", "--reject", "--approval-notes", "--overwrite"],
      };
    case ST.READY:
      return {
        command_hint: `npm run strategy -- --run ${rid} [--force]`,
        reason:
          "MVP Fase 3 (strategy runtime): gera strategy/ até execution-ready-handoff.json após approve; use --force para regenerar.",
        required_artifacts: [
          PLAN_REFINED_FILE,
          APPROVAL_STATE_FILE,
          "strategy/strategy-manifest.json",
          "strategy/execution-strategy.json",
          "strategy/complexity-analysis.json",
          "strategy/ai-strategy.json",
          "strategy/decomposition.json",
          "strategy/execution-order.json",
          "strategy/shared-runtime-context.json",
          "strategy/strategy-readiness.json",
          "strategy/execution-ready-handoff.json",
        ],
        optional_flags: ["--force"],
      };
    case ST.REJECTED:
      return {
        command_hint: `${base} --refine [--overwrite]  e/ou  ${base} --answers …`,
        reason:
          "Aprovação rejeitada: rever respostas, plano refinado e contexto; depois refine e nova tentativa de aprovação.",
        required_artifacts: [QUESTIONS_FILE, ANSWERS_FILE, PLAN_REFINED_FILE],
        optional_flags: ["--refine", "--overwrite", "--answers", "--answer"],
      };
    default:
      return {
        command_hint: base,
        reason: `Estado phase2 desconhecido ou intermédio: ${st || "(vazio)"}.`,
        required_artifacts: [],
        optional_flags: [],
      };
  }
}

/**
 * @param {object} result
 * @param {string} outputDirAbs
 * @param {string} runId
 * @param {boolean} isPassive
 * @returns {object}
 */
function enrichClarifySuccessResult(result, outputDirAbs, runId, isPassive) {
  if (!result || result.ok !== true) {
    return result;
  }
  const rc = readRunContextFresh(outputDirAbs);
  const hasPhase2 = rc && rc.phase2 && typeof rc.phase2 === "object";
  const st = hasPhase2 ? String(rc.phase2.status || "") : "";
  const nextAction = buildNextAction({
    runId,
    hasPhase2,
    phase2Status: st,
  });
  const artifactsSnapshot = collectArtifactsSnapshot(outputDirAbs, rc);

  let approval_status = null;
  if (result.approvalStatus != null) {
    approval_status = String(result.approvalStatus);
  } else if (hasPhase2 && rc.phase2.approval && rc.phase2.approval.status != null) {
    approval_status = String(rc.phase2.approval.status);
  } else {
    const ld = loadApprovalState(outputDirAbs);
    if (ld.ok && ld.doc && ld.doc.status != null) {
      approval_status = String(ld.doc.status);
    }
  }

  return {
    ...result,
    nextAction,
    artifactsSnapshot,
    approval_status,
    passiveResume: isPassive,
  };
}

module.exports = {
  ST,
  collectArtifactsSnapshot,
  buildNextAction,
  enrichClarifySuccessResult,
};
