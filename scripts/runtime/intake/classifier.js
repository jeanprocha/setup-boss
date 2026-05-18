"use strict";

/** @typedef {"ready_for_clarification"|"needs_context"|"blocked"} IntakeClassification */

const IA_TOTAL_CHARS_VERY_LOW = 400;

/**
 * @param {object} discoveryAnalysis
 * @returns {string[]}
 */
function getBlockedSignals(discoveryAnalysis) {
  const arr =
    discoveryAnalysis &&
    discoveryAnalysis.discovery_signals &&
    discoveryAnalysis.discovery_signals.blocked_signals;
  return Array.isArray(arr) ? arr.map(String) : [];
}

/**
 * @param {object} discoveryAnalysis
 * @returns {string[]}
 */
function getNeedsContextSignals(discoveryAnalysis) {
  const arr =
    discoveryAnalysis &&
    discoveryAnalysis.discovery_signals &&
    discoveryAnalysis.discovery_signals.needs_context_signals;
  return Array.isArray(arr) ? arr.map(String) : [];
}

/**
 * Heurística leve sobre task-discovery.md (sem ler ficheiros IA completos).
 * @param {string|null|undefined} taskDiscoveryText
 */
function taskDiscoverySuggestsNeedsAttention(taskDiscoveryText) {
  const t = String(taskDiscoveryText || "").trim();
  if (!t) return false;

  const gap = /##\s*Gaps de Contexto\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(t);
  if (gap) {
    const body = gap[1]
      .trim()
      .replace(/^[-*]\s*/gm, "")
      .replace(/\s+/g, " ");
    if (body.length < 10) return false;
    if (/^(nenhum|nada|n\/a|—|-|n\.?\s*a\.?)$/i.test(body)) return false;
    if (/^(n\/a|none)\b/i.test(body)) return false;
    if (/\bn\/?a\b/i.test(body) && body.length < 80) return false;
    return true;
  }

  const amb = /##\s*Ambiguidades Identificadas\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(t);
  if (amb) {
    const body = amb[1].trim();
    const norm = body.replace(/^[-*]\s*/gm, "").trim();
    if (body.length < 14) return false;
    if (/^nenhuma\b/i.test(norm)) return false;
    return true;
  }

  return false;
}

/**
 * @param {string} code
 */
function isLlmContractParseFailure(code) {
  return String(code || "").startsWith("INTAKE_LLM_PARSE_");
}

/**
 * @param {{
 *   iaContextSummary: {
 *     status?: string,
 *     files_missing?: string[],
 *     total_chars?: number,
 *     index_found?: boolean,
 *     files_found?: number,
 *   },
 *   discoveryAnalysis: object,
 *   llmPhase: { status: string, error?: { code?: string, message?: string } },
 *   taskDiscoveryText: string|null|undefined,
 * }} input
 * @returns {{
 *   classification: IntakeClassification,
 *   reason: string,
 *   missing_definitions: string[],
 *   signals: string[],
 *   confidence: "low"|"medium"|"high",
 * }}
 */
function classifyIntake(input) {
  const ia = input.iaContextSummary || {};
  const disc = input.discoveryAnalysis || {};
  const llm = input.llmPhase || { status: "skipped" };
  const taskDiscoveryText =
    input.taskDiscoveryText != null ? String(input.taskDiscoveryText) : "";

  const taskLen =
    disc.task && disc.task.length != null ? Number(disc.task.length) : 0;

  /** @type {string[]} */
  const signals = [];
  /** @type {string[]} */
  const missingDefinitions = [];

  const iaStatus = ia.status != null ? String(ia.status) : "";
  const filesMissing = Array.isArray(ia.files_missing) ? ia.files_missing : [];
  const totalChars = Number(ia.total_chars);
  const indexFound = Boolean(ia.index_found);
  const filesFound = Number(ia.files_found);

  const blockedSignals = getBlockedSignals(disc);
  const needsCtxSignals = getNeedsContextSignals(disc);

  const llmStatus = String(llm.status || "skipped");
  const llmErrorCode =
    llm.error && llm.error.code != null ? String(llm.error.code) : "";

  // --- blocked (prioridade máxima)
  if (!Number.isFinite(taskLen) || taskLen <= 0) {
    signals.push("blocked:task_empty_or_invalid");
    return {
      classification: "blocked",
      reason: "Task sem conteúdo válido (length=0).",
      missing_definitions: ["task_content"],
      signals,
      confidence: "high",
    };
  }

  if (blockedSignals.length > 0) {
    for (const s of blockedSignals) signals.push(`blocked:discovery:${s}`);
    return {
      classification: "blocked",
      reason: `Sinais de bloqueio no discovery: ${blockedSignals.join(", ")}.`,
      missing_definitions: blockedSignals.slice(),
      signals,
      confidence: "high",
    };
  }

  if (llmStatus === "failed" && isLlmContractParseFailure(llmErrorCode)) {
    signals.push(`blocked:llm_contract_invalid:${llmErrorCode}`);
    missingDefinitions.push("valid_task_discovery_markdown");
    return {
      classification: "blocked",
      reason: `Falha de contrato LLM (parser): ${llmErrorCode}.`,
      missing_definitions: missingDefinitions.slice(),
      signals,
      confidence: "high",
    };
  }

  // --- needs_context
  if (llmStatus === "skipped") {
    signals.push("needs_context:llm_skipped");
    missingDefinitions.push("task_intake_llm_markdown");
  }

  if (llmStatus === "failed" && !isLlmContractParseFailure(llmErrorCode)) {
    signals.push(`needs_context:llm_failed_non_contract:${llmErrorCode}`);
    missingDefinitions.push("task_intake_llm_markdown");
  }

  if (iaStatus === "partial") {
    signals.push("needs_context:ia_status_partial");
    for (const f of filesMissing) missingDefinitions.push(`ia_file:${f}`);
  }

  if (filesMissing.length > 0) {
    signals.push("needs_context:ia_files_missing");
    for (const f of filesMissing) {
      const tag = `ia_file:${f}`;
      if (!missingDefinitions.includes(tag)) missingDefinitions.push(tag);
    }
  }

  if (Number.isFinite(totalChars) && totalChars >= 0 && totalChars < IA_TOTAL_CHARS_VERY_LOW) {
    signals.push("needs_context:ia_total_chars_low");
    missingDefinitions.push("ia_context_density");
  }

  if (needsCtxSignals.length > 0) {
    for (const s of needsCtxSignals) signals.push(`needs_context:discovery:${s}`);
  }

  if (taskDiscoverySuggestsNeedsAttention(taskDiscoveryText)) {
    signals.push("needs_context:task_discovery_gaps_or_ambiguity");
  }

  const needsContext =
    signals.some((s) => s.startsWith("needs_context:")) ||
    missingDefinitions.length > 0;

  if (needsContext) {
    const reasonParts = [];
    if (signals.includes("needs_context:llm_skipped")) {
      reasonParts.push("fase LLM ignorada ou não executada");
    }
    if (signals.some((s) => s.startsWith("needs_context:llm_failed_non_contract"))) {
      reasonParts.push("LLM falhou sem artefactos de discovery/plan");
    }
    if (iaStatus === "partial" || filesMissing.length > 0) {
      reasonParts.push("contexto IA incompleto ou ficheiros em falta");
    }
    if (needsCtxSignals.length > 0) {
      reasonParts.push(`sinais discovery: ${needsCtxSignals.join(", ")}`);
    }
    if (signals.includes("needs_context:ia_total_chars_low")) {
      reasonParts.push("volume muito baixo de texto IA agregado");
    }
    if (signals.includes("needs_context:task_discovery_gaps_or_ambiguity")) {
      reasonParts.push("task-discovery indica gaps ou ambiguidades relevantes");
    }
    const conf =
      signals.length >= 3 || missingDefinitions.length >= 3 ? "low" : "medium";
    return {
      classification: "needs_context",
      reason:
        reasonParts.length > 0
          ? `Necessita contexto: ${reasonParts.join("; ")}.`
          : "Necessita contexto adicional antes de clarificação.",
      missing_definitions: missingDefinitions,
      signals,
      confidence: conf,
    };
  }

  // --- ready_for_clarification
  if (llmStatus !== "completed") {
    signals.push("needs_context:llm_not_completed");
    return {
      classification: "needs_context",
      reason: "LLM não concluiu com artefactos markdown.",
      missing_definitions: ["task_intake_llm_markdown"],
      signals,
      confidence: "medium",
    };
  }

  if (iaStatus !== "ok") {
    signals.push("needs_context:ia_not_ok");
    return {
      classification: "needs_context",
      reason: "IA não está em estado ok mínimo.",
      missing_definitions: missingDefinitions.length ? missingDefinitions : ["ia_baseline"],
      signals,
      confidence: "medium",
    };
  }

  if (filesMissing.length > 0) {
    // redundante, mas defensivo
    signals.push("needs_context:ia_files_missing");
    return {
      classification: "needs_context",
      reason: "Ficheiros IA em falta.",
      missing_definitions: filesMissing.map((f) => `ia_file:${f}`),
      signals,
      confidence: "medium",
    };
  }

  if (!indexFound && filesFound < 1) {
    signals.push("needs_context:ia_minimal_evidence_weak");
    return {
      classification: "needs_context",
      reason: "Evidência mínima de IA fraca (sem index e sem ficheiros contados).",
      missing_definitions: ["ia_index_or_core_files"],
      signals,
      confidence: "low",
    };
  }

  signals.push("ready:llm_completed_ia_ok");

  return {
    classification: "ready_for_clarification",
    reason:
      "LLM concluiu com markdown, contexto IA mínimo válido e sem bloqueios nem lacunas prioritárias.",
    missing_definitions: [],
    signals,
    confidence: "high",
  };
}

/**
 * @param {ReturnType<typeof classifyIntake>} result
 * @param {string} artifactName
 */
function classificationPhaseForRunContext(result, artifactName) {
  return {
    status: "completed",
    value: result.classification,
    reason: result.reason,
    missing_definitions: result.missing_definitions.slice(),
    confidence: result.confidence,
    artifact: artifactName,
  };
}

module.exports = {
  classifyIntake,
  classificationPhaseForRunContext,
  IA_TOTAL_CHARS_VERY_LOW,
};
