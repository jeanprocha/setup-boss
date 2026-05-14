"use strict";

const fs = require("fs");
const path = require("path");

const FILES_TO_SCAN_FOR_IMPORTS = [
  "readiness-validator.js",
  "release-report-builder.js",
  "artifact-writer.js",
  "shadow-hook.js",
  "artifact-auditor.js",
  "flag-auditor.js",
  "diagnostics-consolidator.js",
];

const FORBIDDEN_SUBSTRINGS = [
  'require("../orchestration',
  'require("../../orchestration',
  "require('../orchestration",
  "require('../../orchestration",
  'require("./orchestration',
  'require("../executor.js',
  'require("../../executor.js',
  'require("../scan.js',
  'require("../../scan.js',
];

/**
 * Verifica que módulos desta pasta não puxam pipeline real nem orchestration.
 * @param {string} [releaseReadinessDir]
 */
function validateShadowModuleBoundary(releaseReadinessDir) {
  const dir = releaseReadinessDir || path.join(__dirname);
  const hits = [];
  let files = FILES_TO_SCAN_FOR_IMPORTS;
  try {
    fs.readdirSync(dir);
  } catch (_) {
    return { ok: false, hits: ["cannot read release-readiness dir"], files_checked: [] };
  }

  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    let txt = "";
    try {
      txt = fs.readFileSync(p, "utf8");
    } catch (_) {
      continue;
    }
    for (const sub of FORBIDDEN_SUBSTRINGS) {
      if (txt.includes(sub)) hits.push(`${f}: forbidden ref ${sub}`);
    }
  }

  return { ok: hits.length === 0, hits, files_checked: [...files] };
}

/**
 * @param {object|null} replay
 * @param {object|null} risk
 * @param {object|null} overlay
 */
function validateReportAdvisoryContracts(replay, risk, overlay) {
  const violations = [];

  if (replay) {
    const c = replay.compat || {};
    if (c.advisory_only !== true) violations.push("replay.compat.advisory_only !== true");
    if (c.real_pipeline_handlers_invoked === true) {
      violations.push("replay.compat.real_pipeline_handlers_invoked must not be true");
    }
    if (replay.repeat_edges_policy && String(replay.repeat_edges_policy).includes("operational")) {
      violations.push("replay repeat_edges_policy must remain advisory");
    }
  }

  if (risk) {
    const c = risk.compat || {};
    if (c.advisory_read_only !== true) violations.push("risk.compat.advisory_read_only !== true");
    if (c.real_pipeline_handlers_invoked === true) {
      violations.push("risk.compat.real_pipeline_handlers_invoked must not be true");
    }
  }

  if (overlay && overlay.overlay_mode != null && String(overlay.overlay_mode).toLowerCase() !== "shadow") {
    violations.push("overlay.overlay_mode must be shadow for shadow reports");
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Scheduler: repeat_edges continuam fora do motor de deps (sinais no relatório).
 * @param {object|null} scheduler
 */
function validateSchedulerAdvisorySemantics(scheduler) {
  const notes = [];
  if (!scheduler) return { ok: true, notes: ["scheduler artifact ausente — sem validação de repeat_edges advisory"] };
  const diag = scheduler.diagnostics || {};
  if (diag.scheduler_uses_repeat_edges === true) {
    return { ok: false, notes: ["scheduler_uses_repeat_edges não pode ser true (repeat_edges só advisory)"] };
  }
  if (Array.isArray(scheduler.skipped_repeat_edges) && scheduler.skipped_repeat_edges.length === 0) {
    notes.push("skipped_repeat_edges vazio (inesperado no grafo canónico)");
  }
  return { ok: true, notes };
}

/**
 * Observabilidade: apenas leitura de artefactos existentes (sem side-effects neste módulo).
 */
function observabilityReadOnlyDeclaration() {
  return {
    ok: true,
    read_only: true,
    note: "4.12.x: sem artefacto dedicado de observabilidade; relatórios existentes são consumidos só em leitura.",
  };
}

module.exports = {
  validateShadowModuleBoundary,
  validateReportAdvisoryContracts,
  validateSchedulerAdvisorySemantics,
  observabilityReadOnlyDeclaration,
  FORBIDDEN_SUBSTRINGS,
};
