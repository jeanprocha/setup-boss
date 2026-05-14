/**
 * Construção de contexto compacto por etapa + estabilização estrutural para prefixos.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function compactArrayStrings(arr, maxItems, maxItemLen) {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, maxItems)
    .map((x) => {
      const s = String(x == null ? "" : x).trim();
      if (maxItemLen > 0 && s.length > maxItemLen) {
        return `${s.slice(0, maxItemLen - 1)}…`;
      }
      return s;
    })
    .filter(Boolean);
}

function buildArchitectSliceForMode(runContext, mode, includeViolations) {
  const arch = runContext.architect && typeof runContext.architect === "object"
    ? runContext.architect
    : {};

  const base = {
    status: arch.status,
    allowed_files: arch.allowed_files,
    plan_summary: arch.plan_summary,
    risks: arch.risks,
    stop_criteria: arch.stop_criteria,
    task_valid:
      arch.task_valid !== undefined ? arch.task_valid : null,
  };

  if (includeViolations && arch.violations) {
    base.violations = arch.violations;
  }

  if (mode === "review") {
    return {
      ...base,
      risks: compactArrayStrings(arch.risks, 8, 260),
      stop_criteria: compactArrayStrings(arch.stop_criteria, 6, 220),
    };
  }

  if (mode === "correction") {
    return {
      status: arch.status,
      allowed_files: arch.allowed_files,
      plan_summary: arch.plan_summary,
      risks: compactArrayStrings(arch.risks, 5, 220),
      stop_criteria: compactArrayStrings(arch.stop_criteria, 4, 200),
      task_valid:
        arch.task_valid !== undefined ? arch.task_valid : null,
    };
  }

  return { ...base };
}

function buildTaskSliceForMode(runContext, mode) {
  const t =
    runContext.task && typeof runContext.task === "object"
      ? runContext.task
      : {};

  if (mode === "review" || mode === "correction") {
    return {
      path: t.path,
      title: t.title,
      summary: t.summary,
      acceptance_level: t.acceptance_level,
      acceptance_criteria: Array.isArray(t.acceptance_criteria)
        ? compactArrayStrings(t.acceptance_criteria, 25, 280)
        : t.acceptance_criteria,
    };
  }

  return { ...t };
}

function buildExecutionContextSlice(runContext, mode) {
  const ex =
    runContext.execution_context &&
    typeof runContext.execution_context === "object"
      ? runContext.execution_context
      : {};

  if (mode === "correction") {
    return {
      allowed_files: ex.allowed_files,
      review_focus: Array.isArray(ex.review_focus)
        ? compactArrayStrings(ex.review_focus, 14, 260)
        : ex.review_focus,
      primary_files: ex.primary_files,
      reference_files: ex.reference_files,
      scan_skipped: ex.scan_skipped,
    };
  }

  if (mode === "review") {
    return {
      ...ex,
      review_focus: Array.isArray(ex.review_focus)
        ? ex.review_focus
        : ex.review_focus,
    };
  }

  return { ...ex };
}

/**
 * Objeto de contexto serializado no prompt (determinístico por modo).
 */
function buildPromptRunContextObject(runContext, opts = {}) {
  const mode = opts.mode || "executor";
  const includeViolations = opts.includeArchitectViolations === true;

  if (!runContext || typeof runContext !== "object") {
    return { error: "invalid_run_context" };
  }

  const architect = buildArchitectSliceForMode(
    runContext,
    mode,
    includeViolations,
  );

  return {
    version: runContext.version,
    run_id: runContext.run_id,
    project: runContext.project,
    task: buildTaskSliceForMode(runContext, mode),
    architect,
    execution_context: buildExecutionContextSlice(runContext, mode),
  };
}

function buildCompactRunContextString(runContext, opts = {}) {
  const obj = buildPromptRunContextObject(runContext, opts);
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/**
 * Heurística conservadora: colapsa quebras longas (não remove conteúdo semântico).
 */
function safeCompactWhitespace(text) {
  const s = String(text || "");
  if (s.length < 4000) return s;
  return s.replace(/\n{4,}/g, "\n\n\n");
}

/** Ordenação determinística de paths + hash do conteúdo (prep para prefix caching). */
function stablePrefixFingerprintFromFiles(absPaths) {
  const sorted = [...new Set(absPaths.map((p) => path.resolve(p)))].sort();
  const h = crypto.createHash("sha256");
  for (const abs of sorted) {
    try {
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        h.update(`${abs}|missing\n`);
        continue;
      }
      const raw = fs.readFileSync(abs);
      const sig = crypto.createHash("sha256").update(raw).digest("hex");
      h.update(`${abs}|${sig}\n`);
    } catch (_) {
      h.update(`${abs}|error\n`);
    }
  }
  return {
    paths: sorted,
    fingerprint_sha256: h.digest("hex"),
  };
}

/**
 * Prefixo estável do agente loader (agents/*.md ordenados opcionalmente).
 */
function fingerprintAgentPromptFile(agentMarkdownPath) {
  return stablePrefixFingerprintFromFiles([
    agentMarkdownPath,
    path.join(REPO_ROOT, "agents", "project-scan.md"),
  ]);
}

module.exports = {
  buildPromptRunContextObject,
  buildCompactRunContextString,
  safeCompactWhitespace,
  stablePrefixFingerprintFromFiles,
  fingerprintAgentPromptFile,
};
