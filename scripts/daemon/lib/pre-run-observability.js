"use strict";

const fs = require("fs");
const path = require("path");

const { enrichPreRunError } = require("../../../core/pre-run-error");
const { compactDiagnosticEvent } = require("../../../core/ia-validation-diagnostics");
const { appendRuntimeTrace, fallbackTraceFileAbs } = require("../../runtime-observability/runtime-trace");

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {{
 *   projectId?: string|null,
 *   projectRoot?: string|null,
 *   traceId?: string|null,
 *   timestamp?: string|null,
 * }} [ctx]
 * @returns {Record<string, unknown>}
 */
function buildStructuredPreRunError(raw, ctx = {}) {
  return enrichPreRunError(raw, ctx);
}

/**
 * @param {{
 *   requestId?: string|null,
 *   projectId?: string|null,
 *   projectRoot?: string|null,
 *   component?: string,
 *   error: Record<string, unknown>,
 * }} input
 */
function recordPreRunFailed(input) {
  const traceId =
    input.traceId != null && String(input.traceId).trim()
      ? String(input.traceId).trim()
      : input.requestId != null && String(input.requestId).trim()
        ? String(input.requestId).trim()
        : null;

  const error = buildStructuredPreRunError(input.error, {
    projectId: input.projectId,
    projectRoot: input.projectRoot,
    traceId,
  });
  const compact = compactDiagnosticEvent(error);

  appendRuntimeTrace({
    component: input.component || "run_intake_api",
    event: "pre_run_failed",
    phase: String(error.phase || "submit"),
    level: "error",
    message: String(error.message || error.title || error.code || "pre_run_failed"),
    source: "daemon",
    derivedFrom: "state",
    requestId: input.requestId != null ? String(input.requestId) : error.traceId,
    projectId: error.projectId,
    projectRoot: error.projectRoot,
    metadata: {
      channel: "pre_run",
      code: error.code,
      phase: error.phase,
      title: error.title,
      summary: compact.summary,
      iaValidation: compact.iaValidation,
      groupedDiagnostics: compact.groupedDiagnostics,
      validationSnapshot: compact.validationSnapshot ?? error.validationSnapshot,
      suggestedActions: error.suggestedActions,
    },
    error,
  });

  return error;
}

/**
 * Trace append-only para falha de validação docs/.IA (sem run criada).
 *
 * @param {{
 *   projectId?: string|null,
 *   projectRoot?: string|null,
 *   requestId?: string|null,
 *   traceId?: string|null,
 *   raw: Record<string, unknown>,
 *   setupBossRoot?: string|null,
 *   expectedKnowledgePath?: string|null,
 * }} input
 * @returns {Record<string, unknown>}
 */
function traceKnowledgeBootstrapFailed(input) {
  const structured = buildStructuredPreRunError(input.raw, {
    projectId: input.projectId,
    projectRoot: input.projectRoot,
    traceId: input.traceId || input.requestId,
  });
  const compact = compactDiagnosticEvent(structured);

  const code = String(structured.code || "");
  let event = input.event || "knowledge_bootstrap_failed";
  let step = input.step || "validate_docs_ia";
  if (code === "KNOWLEDGE_BASE_INVALID_SEED") {
    event = input.event || "knowledge_seed_validation_failed";
    step = input.step || "validate_knowledge_seed";
  } else if (
    code === "KNOWLEDGE_BASE_VERSION_MISSING" ||
    code === "KNOWLEDGE_BASE_VERSION_INVALID" ||
    code === "KNOWLEDGE_BASE_UNSUPPORTED_VERSION"
  ) {
    event = input.event || "knowledge_spec_version_failed";
    step = input.step || "validate_knowledge_spec_version";
  } else if (code === "KNOWLEDGE_BASE_INVALID_STRUCTURE") {
    event = input.event || "knowledge_governance_structure_failed";
    step = input.step || "validate_knowledge_structure";
  } else if (code === "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION") {
    event = input.event || "knowledge_bootstrap_ownership_failed";
    step = input.step || "validate_knowledge_structure";
  } else if (code === "KNOWLEDGE_BASE_STRUCTURAL_DRIFT") {
    event = input.event || "knowledge_structural_drift_failed";
    step = input.step || "validate_knowledge_drift";
  } else if (code === "KNOWLEDGE_BASE_SENSITIVE_DATA") {
    event = input.event || "knowledge_content_policy_failed";
    step = input.step || "validate_knowledge_content_policy";
  } else if (code.startsWith("KNOWLEDGE_BASE_")) {
    event = input.event || "knowledge_bootstrap_failed";
    step = input.step || "validate_docs_ia";
  } else if (input.event) {
    event = input.event;
    step = input.step || step;
  }

  appendRuntimeTrace({
    component: "run_intake_api",
    event,
    phase: "initialization",
    step,
    level: "error",
    message: String(structured.message || structured.title || structured.code),
    source: "daemon",
    derivedFrom: "state",
    requestId:
      input.requestId != null
        ? String(input.requestId)
        : structured.traceId != null
          ? String(structured.traceId)
          : null,
    projectId: structured.projectId,
    projectRoot: structured.projectRoot,
    metadata: {
      channel: "pre_run",
      code: structured.code,
      phase: structured.phase,
      title: structured.title,
      summary: structured.summary,
      iaValidation: structured.iaValidation,
      docsIaPath: input.raw.docsIaPath,
      targetProjectRoot: input.projectRoot,
      setupBossRoot: input.setupBossRoot,
      expectedKnowledgePath: input.expectedKnowledgePath,
      suggestedActions: structured.suggestedActions,
      validationSnapshot:
        structured.validationSnapshot ?? input.raw.validationSnapshot,
      groupedDiagnostics: compact.groupedDiagnostics,
    },
    error: structured,
  });

  return structured;
}

/**
 * @param {string} fileAbs
 * @param {number} maxLines
 * @returns {Record<string, unknown>[]}
 */
function readJsonlTail(fileAbs, maxLines) {
  if (!fs.existsSync(fileAbs)) return [];
  let raw = "";
  try {
    raw = fs.readFileSync(fileAbs, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const slice = lines.slice(-maxLines);
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const line of slice) {
    try {
      const row = JSON.parse(line);
      if (row && typeof row === "object") out.push(row);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {boolean}
 */
function isPreRunTraceRow(row) {
  const ev = String(row.event || "");
  if (ev === "pre_run_failed") return true;
  if (ev === "run_create_failed") return true;
  if (ev === "knowledge_bootstrap_failed") return true;
  if (ev === "knowledge_seed_validation_failed") return true;
  if (ev === "knowledge_governance_structure_failed") return true;
  if (ev === "knowledge_bootstrap_ownership_failed") return true;
  if (ev === "knowledge_structural_drift_failed") return true;
  if (ev === "knowledge_spec_version_failed") return true;
  if (ev === "project_resolve_failed") return true;
  if (ev === "validation_failed") return true;
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  if (meta.channel === "pre_run") return true;
  const code =
    (meta.code != null ? String(meta.code) : "") ||
    (row.error &&
    typeof row.error === "object" &&
    /** @type {{ code?: unknown }} */ (row.error).code != null
      ? String(/** @type {{ code?: unknown }} */ (row.error).code)
      : "");
  return /^(KNOWLEDGE_BASE_|project_not_found|project_id_required|task_too_short|PROJECT_ROOT_)/.test(
    code,
  );
}

/**
 * Normaliza entrada de trace para resposta compacta da API.
 *
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function mapTraceRowToDiagnosticEvent(row) {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? /** @type {Record<string, unknown>} */ (row.metadata)
      : {};
  const err =
    row.error && typeof row.error === "object" && !Array.isArray(row.error)
      ? /** @type {Record<string, unknown>} */ (row.error)
      : {};

  const code = String(
    err.code || meta.code || row.message || "pre_run_failed",
  ).trim();

  const enriched = enrichPreRunError(
    {
      code,
      phase: err.phase || meta.phase || row.phase,
      title: err.title || meta.title,
      message: err.message || row.message,
      description: err.description,
      projectId: err.projectId || row.projectId,
      projectRoot: err.projectRoot || row.projectRoot,
      iaValidation: err.iaValidation || meta.iaValidation,
      details: err.details || meta.details,
      suggestedActions: err.suggestedActions || meta.suggestedActions,
      docsIaPath: err.docsIaPath || meta.docsIaPath,
      wrongFolder: err.wrongFolder || meta.wrongFolder,
      missingFiles: err.missingFiles || meta.missingFiles,
      requiredFiles: err.requiredFiles || meta.requiredFiles,
      existingFiles: err.existingFiles || meta.existingFiles,
      missingDirectories: err.missingDirectories || meta.missingDirectories,
      missingIndexFiles: err.missingIndexFiles || meta.missingIndexFiles,
      invalidBootstrapFiles: err.invalidBootstrapFiles || meta.invalidBootstrapFiles,
      allowedBootstrapFiles: err.allowedBootstrapFiles || meta.allowedBootstrapFiles,
      criticalDrift: err.criticalDrift || meta.criticalDrift,
      warnings: err.warnings || meta.warnings,
      unknownFolders: err.unknownFolders || meta.unknownFolders,
      unexpectedRootFiles: err.unexpectedRootFiles || meta.unexpectedRootFiles,
      duplicatedBootstrapPrompts:
        err.duplicatedBootstrapPrompts || meta.duplicatedBootstrapPrompts,
      legacyIaPath: err.legacyIaPath || meta.legacyIaPath,
      traceId: err.traceId || row.requestId,
      timestamp: err.timestamp || row.timestamp,
    },
    {
      projectId: row.projectId != null ? String(row.projectId) : null,
      projectRoot: row.projectRoot != null ? String(row.projectRoot) : null,
      traceId: row.requestId != null ? String(row.requestId) : null,
      timestamp: row.timestamp != null ? String(row.timestamp) : null,
    },
  );

  const compact = compactDiagnosticEvent(enriched);

  return {
    id: `pre_${String(row.timestamp || enriched.timestamp)}_${code}`,
    channel: "pre_run",
    event: String(row.event || "pre_run_failed"),
    ...compact,
  };
}

/**
 * @param {{
 *   channel?: string,
 *   projectId?: string|null,
 *   code?: string|null,
 *   phase?: string|null,
 *   limit?: number,
 * }} [opts]
 */
function readPreRunDiagnosticEvents(opts = {}) {
  const channel = opts.channel != null ? String(opts.channel).trim() : "pre_run";
  if (channel && channel !== "pre_run") return [];

  const limit =
    typeof opts.limit === "number" && opts.limit > 0
      ? Math.min(Math.floor(opts.limit), 100)
      : 40;

  const pidFilter =
    opts.projectId != null && String(opts.projectId).trim()
      ? String(opts.projectId).trim()
      : null;

  const codeFilter =
    opts.code != null && String(opts.code).trim()
      ? String(opts.code).trim()
      : null;

  const phaseFilter =
    opts.phase != null && String(opts.phase).trim()
      ? String(opts.phase).trim()
      : null;

  const rows = readJsonlTail(fallbackTraceFileAbs(), 2000);
  const hits = rows.filter(isPreRunTraceRow);
  let mapped = hits.map(mapTraceRowToDiagnosticEvent);
  if (pidFilter) {
    mapped = mapped.filter((e) => e.projectId === pidFilter);
  }
  if (codeFilter) {
    mapped = mapped.filter((e) => String(e.code || "") === codeFilter);
  }
  if (phaseFilter) {
    mapped = mapped.filter((e) => String(e.phase || "") === phaseFilter);
  }
  return mapped.slice(-limit).reverse();
}

module.exports = {
  buildStructuredPreRunError,
  recordPreRunFailed,
  traceKnowledgeBootstrapFailed,
  readPreRunDiagnosticEvents,
  readJsonlTail,
  isPreRunTraceRow,
};
