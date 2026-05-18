"use strict";

const {
  parseClarifyCliArgs,
  executeClarification,
  PHASE2_ANSWERS_STATUS,
  PHASE2_QUESTIONS_STATUS,
  PHASE2_PLAN_REFINED_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
  ANSWERS_FILE,
  QUESTIONS_FILE,
  PLAN_REFINED_FILE,
  APPROVAL_STATE_FILE,
} = require("../../runtime/clarification/clarification-runtime");

function artifactFromRes(res) {
  if (res.artifacts && res.artifacts.length) {
    return res.artifacts[0];
  }
  if (
    res.phase2Status === PHASE2_READY_FOR_EXECUTION ||
    res.phase2Status === PHASE2_APPROVAL_REJECTED
  ) {
    return APPROVAL_STATE_FILE;
  }
  if (res.phase2Status === PHASE2_PLAN_REFINED_STATUS) {
    return PLAN_REFINED_FILE;
  }
  if (res.phase2Status === PHASE2_ANSWERS_STATUS) {
    return ANSWERS_FILE;
  }
  if (res.phase2Status === PHASE2_QUESTIONS_STATUS) {
    return QUESTIONS_FILE;
  }
  return null;
}

function clarifySuccessJson(res) {
  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    runId: res.runId,
    outputDir: res.outputDir,
    status: res.phase2Status,
    phase2_status: res.phase2Status,
    round: res.currentRound,
    current_round: res.currentRound,
    questions_count: res.questionsCount,
    answers_count: res.answersCount,
    pending_blocking_count: res.pendingBlockingCount,
    artifact: artifactFromRes(res),
    operation_artifacts: res.artifacts,
    artifacts: Array.isArray(res.artifactsSnapshot) ? res.artifactsSnapshot : [],
    next_action: res.nextAction != null ? res.nextAction : null,
    passive_resume: Boolean(res.passiveResume),
  };
  const appr = res.approval_status != null ? res.approval_status : res.approvalStatus;
  if (appr != null) {
    out.approval_status = appr;
  }
  if (res.approvalStatus != null && res.planRef != null) {
    out.plan_ref = res.planRef;
    out.plan_sha256 = res.planSha256;
  }
  return out;
}

/**
 * @param {string[]} argv
 */
async function runClarify(argv) {
  const parsed = parseClarifyCliArgs(argv);
  const runArg = parsed.run != null ? String(parsed.run).trim() : "";

  if (!runArg) {
    const errPayload = {
      ok: false,
      error: {
        code: "CLARIFY_CLI_USAGE",
        message:
          'Uso: setup-boss clarify --run <runId|caminho-output> [--refine] [--approve|--reject] [--approval-notes "texto"] [--skip-llm] [--answers <ficheiro>] [--answer id=valor]... [--overwrite] [--json]',
      },
    };
    if (parsed.json) {
      console.log(JSON.stringify(errPayload, null, 2));
    } else {
      console.error(errPayload.error.message);
    }
    process.exitCode = 1;
    return;
  }

  const res = await executeClarification({
    runOrPath: runArg,
    cwd: process.cwd(),
    skipLlm: Boolean(parsed.skipLlm),
    answersPath: parsed.answersPath || null,
    answerPairs: parsed.answerPairs,
    overwrite: Boolean(parsed.overwrite),
    refine: Boolean(parsed.refine),
    approve: Boolean(parsed.approve),
    reject: Boolean(parsed.reject),
    approvalNotes: parsed.approvalNotes,
  });

  if (!res.ok) {
    if (parsed.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: res.error,
            runId: res.runId,
            outputDir: res.outputDir,
            round: res.currentRound,
            questions_count: res.questionsCount,
            answers_count: res.answersCount,
            pending_blocking_count: res.pendingBlockingCount,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(res.error.message || "clarify falhou");
      if (res.outputDir) console.error("Output:", res.outputDir);
      if (res.pendingBlockingCount != null) {
        console.error("Blocking pendentes:", res.pendingBlockingCount);
      }
    }
    process.exitCode = 1;
    return;
  }

  if (parsed.json) {
    console.log(JSON.stringify(clarifySuccessJson(res), null, 2));
  } else {
    console.log("Run id:", res.runId);
    console.log("Output dir:", res.outputDir);
    console.log("Fase 2 (status):", res.phase2Status);
    console.log("Round:", res.currentRound);
    if (res.nextAction) {
      console.log("Próximo passo sugerido:", res.nextAction.command_hint);
      console.log("Motivo:", res.nextAction.reason);
      if (Array.isArray(res.artifactsSnapshot) && res.artifactsSnapshot.length) {
        console.log("Artefactos presentes:", res.artifactsSnapshot.join(", "));
      }
    }
    console.log("Perguntas:", res.questionsCount);
    console.log("Respostas gravadas:", res.answersCount);
    console.log("Blocking pendentes:", res.pendingBlockingCount);
    console.log("Artefacto principal:", artifactFromRes(res) || "(n/d)");
    if (res.approvalStatus != null) {
      console.log("Estado de aprovação (artefacto):", res.approvalStatus);
      console.log("Referência do plano:", res.planRef);
      console.log("SHA256 do plano:", res.planSha256);
      console.log("Artefacto aprovação:", res.approvalArtifact || APPROVAL_STATE_FILE);
    }
    console.log(
      "Artefactos escritos nesta operação:",
      res.artifacts.length ? res.artifacts.join(", ") : "(nenhum — já em estado estável)",
    );
  }
}

module.exports = { runClarify };
