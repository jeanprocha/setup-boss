"use strict";

const fs = require("fs");
const path = require("path");

const {
  sanitizeUpdatedPlanPresentation,
} = require("./generate-full-updated-plan-presentation.js");

const {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  baseSnapshotDocIsStale,
} = require("./operational-plan-staleness.js");

const BASE_SNAPSHOT_FILE = "plan-presentation-base.json";
const SCHEMA_VERSION = OPERATIONAL_PLAN_SCHEMA_VERSION;

/**
 * @param {string} outputDir
 */
function snapshotPath(outputDir) {
  return path.join(path.resolve(String(outputDir || "")), BASE_SNAPSHOT_FILE);
}

/**
 * @param {string} outputDir
 */
function readPlanPresentationBaseSnapshotDoc(outputDir) {
  const fp = snapshotPath(outputDir);
  if (!fs.existsSync(fp)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(fp, "utf-8"));
    if (!doc || typeof doc !== "object") return null;
    return doc;
  } catch {
    return null;
  }
}

/**
 * Apresentação canonicalizada do plano v1 (fonte única para comentários).
 *
 * @param {string} outputDir
 */
function readPlanPresentationBaseSnapshot(outputDir) {
  const doc = readPlanPresentationBaseSnapshotDoc(outputDir);
  const raw = doc?.presentation;
  if (!raw || typeof raw !== "object") return null;
  const pres = sanitizeUpdatedPlanPresentation(raw);
  if (!pres?.hasContent) return null;
  if (baseSnapshotDocIsStale(doc)) {
    try {
      writePlanPresentationBaseSnapshot(outputDir, pres, {
        source: doc?.source || "migration",
        generatedAt: doc?.generatedAt,
      });
    } catch {
      /* */
    }
  }
  return pres;
}

/**
 * @param {string} outputDir
 * @param {object} presentation
 * @param {{ source?: string, generatedAt?: string }} [meta]
 */
function writePlanPresentationBaseSnapshot(outputDir, presentation, meta = {}) {
  const pres = sanitizeUpdatedPlanPresentation(presentation);
  if (!pres?.hasContent) {
    throw new Error("presentation inválida ou sem conteúdo");
  }

  const doc = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: meta.generatedAt || new Date().toISOString(),
    canonicalized: true,
    source: meta.source || "ui",
    planVersion: 1,
    presentation: pres,
  };

  const fp = snapshotPath(outputDir);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(doc, null, 2), "utf-8");
  return doc;
}

module.exports = {
  BASE_SNAPSHOT_FILE,
  SCHEMA_VERSION,
  snapshotPath,
  readPlanPresentationBaseSnapshotDoc,
  readPlanPresentationBaseSnapshot,
  writePlanPresentationBaseSnapshot,
};
