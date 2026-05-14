/**
 * Camada semântica determinística (heurísticas sobre artefactos; sem LLM).
 * Não substitui o review estrutural nem decide isoladamente.
 */

const { getAllowedFilesFromRunContext } = require("../../shared-utils");

function countLines(text) {
  if (!text) return 0;
  return String(text).split(/\r?\n/).length;
}

function runSemanticReview(snapshot) {
  const changes = snapshot.executor_changes || [];
  const executorMd = snapshot.executor_output_excerpt || "";
  const findings = [];
  let score = 100;

  const nFiles = new Set(
    changes.map((c) => (c && c.path ? String(c.path) : "")).filter(Boolean),
  ).size;

  if (nFiles > 12) {
    findings.push({
      id: "semantic_scope.broad_touch",
      kind: "maintainability",
      severity: "low",
      detail: { touched_files: nFiles },
      hint: "Grande número de ficheiros tocados — considerar dividir a task.",
    });
    score -= 8;
  }

  const mdLines = countLines(executorMd);
  if (mdLines > 400) {
    findings.push({
      id: "semantic_output.verbose_executor_log",
      kind: "readability",
      severity: "info",
      detail: { excerpt_lines_est: mdLines },
      hint: "Saída do executor muito longa — pode indicar falta de foco.",
    });
    score -= 4;
  }

  const runCtxFiles = snapshot.run_context
    ? getAllowedFilesFromRunContext(snapshot.run_context).length
    : null;

  if (runCtxFiles != null && nFiles > runCtxFiles) {
    findings.push({
      id: "semantic_drift.more_files_than_run_context",
      kind: "intent_alignment",
      severity: "medium",
      detail: { touched: nFiles, allowed_hint: runCtxFiles },
      hint: "Alterações excedem ficheiros alvo do run-context.",
    });
    score -= 12;
  }

  if (!snapshot.validation_results && nFiles > 0) {
    findings.push({
      id: "semantic_quality.missing_validation_surface",
      kind: "technical_debt",
      severity: "low",
      detail: {},
      hint: "Sem validation-results.json apesar de haver alterações.",
    });
    score -= 6;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    findings,
    semantic_score: score,
    dimensions: {
      maintainability: Math.max(0, 100 - (nFiles > 12 ? 12 : 0)),
      readability: Math.max(0, 100 - (mdLines > 400 ? 10 : 0)),
      architecture_signal: snapshot.plan ? 88 : 80,
      intent_alignment: runCtxFiles != null && nFiles > runCtxFiles ? 65 : 90,
    },
  };
}

module.exports = { runSemanticReview };
