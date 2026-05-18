"use strict";

const fs = require("fs");
const path = require("path");

const { appendRuntimeTrace } = require("./runtime-trace");

/** Artefactos críticos sob outputDir da corrida (ausência = diagnóstico, não fatal). */
const RUN_OUTPUT_CRITICAL = [
  "run-context.json",
  "task-plan-initial.md",
  "task-plan-refined.md",
  "clarification-session.json",
  "clarification-questions.json",
  "clarification-answers.json",
  "approval-state.json",
];

/**
 * @param {string} outputDirAbs
 * @param {{ eventPrefix?: string, phase?: string }} [opts]
 */
function auditRunOutputArtifacts(outputDirAbs, opts = {}) {
  const dir = path.resolve(String(outputDirAbs || ""));
  const phase = opts.phase != null ? String(opts.phase) : "artifacts";
  const prefix = opts.eventPrefix != null ? String(opts.eventPrefix) : "artifact";

  if (!dir || !fs.existsSync(dir)) {
    appendRuntimeTrace({
      component: "artifact_audit",
      event: `${prefix}_scan_skipped`,
      phase,
      message: `outputDir ausente ou inválido: ${dir}`,
      derivedFrom: "artifact",
      metadata: { outputDir: dir, reason: "missing_dir" },
    });
    return;
  }

  appendRuntimeTrace({
    component: "artifact_audit",
    event: `${prefix}_expected_set`,
    phase,
    message: "Lista nominal de artefactos auditáveis (run output)",
    derivedFrom: "state",
    metadata: { names: RUN_OUTPUT_CRITICAL.slice() },
    outputDir: dir,
  });

  for (const name of RUN_OUTPUT_CRITICAL) {
    const fp = path.join(dir, name);
    const exists = fs.existsSync(fp);
    appendRuntimeTrace({
      component: "artifact_audit",
      event: exists ? `${prefix}_exists` : `${prefix}_missing`,
      phase,
      step: name,
      message: exists ? `presente: ${name}` : `ausente: ${name}`,
      artifactPath: name,
      derivedFrom: "artifact",
      outputDir: dir,
      metadata: { bytes: exists ? safeStatSize(fp) : null },
    });
  }
}

/**
 * @param {string} fp
 * @returns {number|null}
 */
function safeStatSize(fp) {
  try {
    return fs.statSync(fp).size;
  } catch {
    return null;
  }
}

/**
 * Estado do daemon (events + status) sob dataDir — caminhos absolutos em metadata.
 * @param {string} dataDirAbs
 * @param {{ phase?: string }} [opts]
 */
function auditDaemonArtifacts(dataDirAbs, opts = {}) {
  const phase = opts.phase != null ? String(opts.phase) : "daemon_artifacts";
  const root = path.resolve(String(dataDirAbs || ""));
  const eventsPath = path.join(root, "daemon", "events.jsonl");
  const statusPath = path.join(root, "daemon", "status.json");

  for (const [label, fp] of /** @type {const} */ ([
    ["events.jsonl", eventsPath],
    ["status.json", statusPath],
  ])) {
    const exists = fs.existsSync(fp);
    appendRuntimeTrace({
      component: "artifact_audit",
      event: exists ? "artifact_exists" : "artifact_missing",
      phase,
      step: label,
      message: exists ? `daemon ${label} presente` : `daemon ${label} ausente`,
      artifactPath: path.relative(root, fp).replace(/\\/g, "/"),
      derivedFrom: "artifact",
      metadata: {
        absolutePath: fp,
        bytes: exists ? safeStatSize(fp) : null,
      },
    });
  }
}

/**
 * @param {string} outputDirAbs
 * @param {string} label
 */
function traceArtifactWritten(outputDirAbs, label) {
  appendRuntimeTrace({
    component: "artifact_audit",
    event: "artifact_written",
    phase: "artifacts",
    artifactPath: String(label),
    message: `gravado ${label}`,
    derivedFrom: "artifact",
    outputDir: path.resolve(outputDirAbs),
  });
}

/**
 * @param {string} outputDirAbs
 * @param {string} label
 */
function traceArtifactRead(outputDirAbs, label) {
  appendRuntimeTrace({
    component: "artifact_audit",
    event: "artifact_read",
    phase: "artifacts",
    artifactPath: String(label),
    message: `lido ${label}`,
    derivedFrom: "artifact",
    outputDir: path.resolve(outputDirAbs),
  });
}

/**
 * @param {string} outputDirAbs
 * @param {string} label
 * @param {unknown} errOrMsg
 */
function traceArtifactValidationFailed(outputDirAbs, label, errOrMsg) {
  const msg = errOrMsg && typeof errOrMsg === "object" && "message" in errOrMsg
    ? String(/** @type {{ message?: string }} */ (errOrMsg).message)
    : String(errOrMsg || "validation_failed");
  appendRuntimeTrace({
    component: "artifact_audit",
    event: "artifact_validation_failed",
    phase: "artifacts",
    artifactPath: String(label),
    message: msg,
    derivedFrom: "artifact",
    level: "warn",
    outputDir: path.resolve(outputDirAbs),
    error:
      errOrMsg && typeof errOrMsg === "object"
        ? /** @type {Record<string, unknown>} */ (errOrMsg)
        : { message: msg },
  });
}

module.exports = {
  RUN_OUTPUT_CRITICAL,
  auditRunOutputArtifacts,
  auditDaemonArtifacts,
  traceArtifactWritten,
  traceArtifactRead,
  traceArtifactValidationFailed,
};
