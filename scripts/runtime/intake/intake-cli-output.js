"use strict";

const path = require("path");
const fs = require("fs");

const PRINCIPAL_NAMES = [
  "run-context.json",
  "intake-manifest.json",
  "task-discovery.md",
  "task-plan-initial.md",
  "intake-classification.json",
];

/**
 * @param {string} outputDirAbs
 * @returns {{ name: string, path: string }[]}
 */
function listIntakePrincipalArtifacts(outputDirAbs) {
  const base = path.resolve(outputDirAbs);
  /** @type {{ name: string, path: string }[]} */
  const out = [];
  for (const name of PRINCIPAL_NAMES) {
    const fp = path.join(base, name);
    if (fs.existsSync(fp)) {
      out.push({ name, path: fp });
    }
  }
  return out;
}

/**
 * @param {{
 *   ok: true,
 *   runId: string,
 *   outputDir: string,
 *   runType: string,
 *   classification: string,
 *   confidence: string,
 *   phase1Status: string,
 *   artifacts: { name: string, path: string }[],
 * }} res
 */
function printIntakeHumanSummary(res) {
  if (!res.ok) return;
  console.log(`Run id:          ${res.runId}`);
  console.log(`Run type:        ${res.runType}`);
  console.log(`Classification:  ${res.classification}`);
  console.log(`Confidence:      ${res.confidence}`);
  console.log(`Phase1 status:   ${res.phase1Status}`);
  console.log(`Output dir:      ${res.outputDir}`);
  console.log("");
  console.log("Artefactos principais:");
  for (const a of res.artifacts) {
    console.log(`  - ${a.name}`);
  }
  console.log("");
  console.log(
    `Inspeção: setup-boss inspect ${res.runId}  (ou índice / latest no projecto)`,
  );
}

/**
 * @param {{
 *   ok: true,
 *   runId: string,
 *   outputDir: string,
 *   runType: string,
 *   classification: string,
 *   confidence: string,
 *   phase1Status: string,
 *   artifacts: { name: string, path: string }[],
 * }} res
 */
function intakeResultToJson(res) {
  if (!res.ok) {
    return {
      ok: false,
      error: res.error,
    };
  }
  return {
    ok: true,
    runId: res.runId,
    outputDir: res.outputDir,
    runType: res.runType,
    classification: res.classification,
    confidence: res.confidence,
    phase1Status: res.phase1Status,
    artifacts: res.artifacts.map((a) => ({ name: a.name, path: a.path })),
  };
}

module.exports = {
  listIntakePrincipalArtifacts,
  printIntakeHumanSummary,
  intakeResultToJson,
  PRINCIPAL_NAMES,
};
