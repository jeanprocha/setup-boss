"use strict";

const fs = require("fs");
const path = require("path");

const {
  buildOperationalExecutableStrategy,
  OPERATIONAL_EXECUTABLE_STRATEGY_REL,
} = require("./build-operational-executable-strategy");

/**
 * @param {string} outputDirAbs
 * @returns {number}
 */
function resolvePlanVersionFromOutput(outputDirAbs) {
  const root = path.resolve(outputDirAbs);
  const oesPath = path.join(root, OPERATIONAL_EXECUTABLE_STRATEGY_REL);
  const existing = readJsonObject(oesPath);
  if (existing && existing.planVersion != null) {
    const m = /^v(\d+)$/i.exec(String(existing.planVersion).trim());
    if (m) return Math.max(1, parseInt(m[1], 10));
    const n = Number(existing.planVersion);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }

  const commentsDir = path.join(root, "plan-comments");
  if (fs.existsSync(commentsDir)) {
    try {
      for (const name of fs.readdirSync(commentsDir)) {
        if (!name.endsWith(".json")) continue;
        const doc = readJsonObject(path.join(commentsDir, name));
        if (!doc) continue;
        const threads = Array.isArray(doc.threads) ? doc.threads : [];
        let max = 1;
        for (const t of threads) {
          if (!t || typeof t !== "object") continue;
          const up = /** @type {Record<string, unknown>} */ (t).updatedPlan;
          if (up && typeof up === "object" && !Array.isArray(up)) {
            const pv = Number(/** @type {Record<string, unknown>} */ (up).planVersion);
            if (Number.isFinite(pv) && pv > max) max = pv;
          }
        }
        if (max > 1) return max;
      }
    } catch {
      /* ignore */
    }
  }

  return 1;
}

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function readJsonObject(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * Carrega OES do disco ou constrói a partir das fontes strategy/*.
 *
 * @param {string} outputDirAbs
 * @param {{ runId?: string, planVersion?: number, writeIfBuilt?: boolean }} [opts]
 */
function loadOrBuildOperationalExecutableStrategy(outputDirAbs, opts = {}) {
  const root = path.resolve(outputDirAbs);
  const oesPath = path.join(root, OPERATIONAL_EXECUTABLE_STRATEGY_REL);
  const planVersion =
    opts.planVersion != null
      ? Math.max(1, Math.floor(Number(opts.planVersion)))
      : resolvePlanVersionFromOutput(root);

  if (fs.existsSync(oesPath)) {
    const artifact = readJsonObject(oesPath);
    if (artifact) {
      return {
        ok: true,
        source: "disk",
        degraded: false,
        artifact,
        warnings: [],
        relPath: OPERATIONAL_EXECUTABLE_STRATEGY_REL,
      };
    }
  }

  const built = buildOperationalExecutableStrategy({
    outputDirAbs: root,
    runId: opts.runId,
    planVersion,
    sourcePlanVersion: planVersion,
    write: opts.writeIfBuilt === true,
  });

  return {
    ...built,
    source: "built",
  };
}

module.exports = {
  loadOrBuildOperationalExecutableStrategy,
  resolvePlanVersionFromOutput,
  readJsonObject,
};
