"use strict";

const fs = require("fs");
const path = require("path");

const { REPLAY_ARTIFACT_FILENAME } = require("./constants");

/**
 * @param {string} outputDir
 * @param {object} doc
 */
function writeReplayReportArtifact(outputDir, doc) {
  const dir = path.resolve(String(outputDir || ""));
  if (!dir) throw new Error("outputDir obrigatório");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, REPLAY_ARTIFACT_FILENAME);
  fs.writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

module.exports = {
  writeReplayReportArtifact,
};
