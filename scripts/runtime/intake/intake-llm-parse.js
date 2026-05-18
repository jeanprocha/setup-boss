"use strict";

const MARK_DISCOVERY = "---TASK_DISCOVERY---";
const MARK_PLAN = "---TASK_PLAN_INITIAL---";

/**
 * @param {string} outputText
 * @returns {{ ok: true, taskDiscoveryMarkdown: string, taskPlanInitialMarkdown: string } | { ok: false, error: { code: string, message: string } }}
 */
function parseTaskIntakeLlmOutput(outputText) {
  const raw = String(outputText ?? "");
  const trimmedStart = raw.replace(/^\uFEFF/, "").trimStart();

  const dIdx = trimmedStart.indexOf(MARK_DISCOVERY);
  const pIdx = trimmedStart.indexOf(MARK_PLAN);

  if (dIdx === -1) {
    return {
      ok: false,
      error: {
        code: "INTAKE_LLM_PARSE_MISSING_MARKERS",
        message: `Marcador obrigatório em falta: ${MARK_DISCOVERY}`,
      },
    };
  }

  if (dIdx !== 0) {
    return {
      ok: false,
      error: {
        code: "INTAKE_LLM_PARSE_MISSING_MARKERS",
        message: `A resposta deve começar por ${MARK_DISCOVERY} (sem texto antes).`,
      },
    };
  }

  if (pIdx === -1) {
    return {
      ok: false,
      error: {
        code: "INTAKE_LLM_PARSE_MISSING_MARKERS",
        message: `Marcador obrigatório em falta: ${MARK_PLAN}`,
      },
    };
  }

  if (pIdx <= dIdx) {
    return {
      ok: false,
      error: {
        code: "INTAKE_LLM_PARSE_INVALID_ORDER",
        message: `${MARK_PLAN} deve aparecer depois de ${MARK_DISCOVERY}.`,
      },
    };
  }

  const afterDiscoveryMark = trimmedStart.slice(dIdx + MARK_DISCOVERY.length);
  const planMarkerInSlice = afterDiscoveryMark.indexOf(MARK_PLAN);
  if (planMarkerInSlice === -1) {
    return {
      ok: false,
      error: {
        code: "INTAKE_LLM_PARSE_MISSING_MARKERS",
        message: `Estrutura inválida: ${MARK_PLAN} não encontrado após discovery.`,
      },
    };
  }

  const taskDiscoveryMarkdown = afterDiscoveryMark.slice(0, planMarkerInSlice).trim();
  const afterPlanMark = afterDiscoveryMark.slice(
    planMarkerInSlice + MARK_PLAN.length,
  );
  const taskPlanInitialMarkdown = afterPlanMark.trim();

  if (!taskDiscoveryMarkdown) {
    return {
      ok: false,
      error: {
        code: "INTAKE_LLM_PARSE_EMPTY_BLOCK",
        message: "Bloco TASK_DISCOVERY vazio.",
      },
    };
  }

  if (!taskPlanInitialMarkdown) {
    return {
      ok: false,
      error: {
        code: "INTAKE_LLM_PARSE_EMPTY_BLOCK",
        message: "Bloco TASK_PLAN_INITIAL vazio.",
      },
    };
  }

  return {
    ok: true,
    taskDiscoveryMarkdown,
    taskPlanInitialMarkdown,
  };
}

module.exports = {
  parseTaskIntakeLlmOutput,
  MARK_DISCOVERY,
  MARK_PLAN,
};
