"use strict";

const { RELEASE_READINESS_ENV } = require("./constants");

/** Flags de modo (apenas off | shadow). */
const MODE_FLAGS = [
  "SETUP_BOSS_EXECUTION_GRAPH",
  "SETUP_BOSS_EXECUTION_GRAPH_RUNTIME",
  "SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER",
  "SETUP_BOSS_EXECUTION_GRAPH_OVERLAY",
  "SETUP_BOSS_EXECUTION_GRAPH_NODE_ADAPTERS",
  "SETUP_BOSS_EXECUTION_GRAPH_REPLAY",
  "SETUP_BOSS_EXECUTION_GRAPH_RISK",
  RELEASE_READINESS_ENV,
];

/** Opcionais / texto — não bloqueiam por valor. */
const FREE_FLAGS = [
  "SETUP_BOSS_EXECUTION_GRAPH_REPLAY_TARGETS",
  "SETUP_BOSS_EXECUTION_GRAPH_REPLAY_BOUNDARY_STOPS",
  "SETUP_BOSS_EXECUTION_GRAPH_DEBUG",
];

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {'off'|'shadow'}
 */
function effectiveMode(raw) {
  if (raw == null || String(raw).trim() === "") return "off";
  const x = String(raw).toLowerCase().trim();
  if (x === "shadow") return "shadow";
  if (x === "off" || x === "0" || x === "false" || x === "no") return "off";
  return String(raw);
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function auditFeatureFlags(env) {
  const e = env || process.env;
  const modeRows = [];
  const invalid = [];
  let allUnsetDefaultOff = true;

  for (const name of MODE_FLAGS) {
    const raw = e[name];
    if (raw != null && String(raw).trim() !== "") allUnsetDefaultOff = false;
    const eff = effectiveMode(raw);
    const allowed = eff === "off" || eff === "shadow";
    if (!allowed) invalid.push(name);
    modeRows.push({
      name,
      raw_value: raw == null ? null : String(raw),
      effective: eff,
      allowed,
    });
  }

  const freeRows = FREE_FLAGS.map((name) => ({
    name,
    raw_value: e[name] == null ? null : String(e[name]),
  }));

  return {
    mode_flags: modeRows,
    free_flags: freeRows,
    invalid_mode_flags: invalid,
    all_mode_flags_off_or_shadow: invalid.length === 0,
    /** Quando nenhum modo está definido no env, tudo equivale a off. */
    all_defaults_off_when_unset: allUnsetDefaultOff,
  };
}

module.exports = {
  MODE_FLAGS,
  FREE_FLAGS,
  effectiveMode,
  auditFeatureFlags,
};
