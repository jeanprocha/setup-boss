"use strict";

const fs = require("fs");
const path = require("path");
const { OVERLAY_ARTIFACT_FILENAME } = require("./constants");

/**
 * @param {string} outputDir
 * @param {object} report
 */
function writeOverlayReportArtifact(outputDir, report) {
  const dir = path.resolve(String(outputDir || ""));
  if (!dir) throw new Error("outputDir obrigatório");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, OVERLAY_ARTIFACT_FILENAME);
  fs.writeFileSync(p, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

module.exports = {
  writeOverlayReportArtifact,
};
