/**
 * Texto legível para operador — recovery diagnostics.
 */

function likelyCauseLine(classification, cause) {
  const c = String(cause || "");
  if (c === "search_not_found") {
    return "Provável causa: janela de snippet ou search deslocado face ao ficheiro real.";
  }
  if (c === "search_not_unique") {
    return "Provável causa: trecho ambíguo — múltiplas ocorrências no ficheiro.";
  }
  if (c === "json_parse_failed" || c === "executor_json_parse_failed") {
    return "Provável causa: resposta do provider malformada ou truncada.";
  }
  if (classification === "PROVIDER_FAILURE") {
    return "Provável causa: instabilidade temporária ou limite do provider.";
  }
  if (c === "context_insufficient") {
    return "Provável causa: contexto ou snippets insuficientes para um patch seguro.";
  }
  return "Provável causa: requer análise manual ou correction loop.";
}

function buildRecoveryDiagnosisText(opts) {
  const {
    failureLabel,
    classification,
    cause,
    strategyLabel,
    outcome,
    attempt,
    maxAttempts,
  } = opts;

  const lines = [];
  lines.push("Failure reason:");
  lines.push(String(failureLabel || "(desconhecido)"));
  lines.push("");
  lines.push("Classification:");
  lines.push(String(classification || "—"));
  lines.push("");
  lines.push(likelyCauseLine(classification, cause));
  lines.push("");
  lines.push("Recovery used:");
  lines.push(String(strategyLabel || "—"));
  if (attempt != null && maxAttempts != null) {
    lines.push(`Retry attempt: ${attempt}/${maxAttempts}`);
  }
  lines.push("");
  lines.push("Outcome:");
  lines.push(String(outcome || "—"));
  return lines.join("\n");
}

module.exports = {
  buildRecoveryDiagnosisText,
  likelyCauseLine,
};
