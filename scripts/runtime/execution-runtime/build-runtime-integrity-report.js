"use strict";

const fs = require("fs");
const path = require("path");
const { validateExecutionRuntimeDetailed } = require("./validate-execution-runtime");

const INTEGRITY_REL = "execution/runtime-integrity-report.json";

/**
 * @param {string} outputDirAbs
 * @param {{ force?: boolean }} [opts]
 * @returns {{ ok: boolean, path?: string, error?: { code: string, message: string } }}
 */
function writeRuntimeIntegrityReport(outputDirAbs, opts) {
  const root = path.resolve(String(outputDirAbs || ""));
  const execDir = path.join(root, "execution");
  const outPath = path.join(execDir, "runtime-integrity-report.json");
  const force = opts && opts.force === true;

  if (!fs.existsSync(execDir)) {
    return { ok: false, error: { code: "INTEGRITY_NO_EXEC", message: "Pasta execution/ em falta." } };
  }

  const detail = validateExecutionRuntimeDetailed(root, { skipObservability: false });
  const report = {
    version: 1,
    valid: detail.errors.length === 0,
    warnings: detail.warnings,
    errors: detail.errors,
    checked_artifacts: detail.checked_artifacts,
    checked_subtasks: detail.checked_subtasks,
    generated_at: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return { ok: false, error: { code: "INTEGRITY_WRITE_FAILED", message: msg } };
  }

  return { ok: true, path: outPath.replace(/\\/g, "/") };
}

module.exports = {
  INTEGRITY_REL,
  writeRuntimeIntegrityReport,
};
