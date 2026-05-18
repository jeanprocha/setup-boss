"use strict";

/**
 * @typedef {{ run: string|null, json: boolean, force: boolean, resume: boolean, rollback: boolean, observability: boolean }} ExecuteCliOpts
 */

/**
 * @param {ExecuteCliOpts} opts
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateExecuteCliFlagCombinations(opts) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (opts.observability && opts.rollback) {
    errors.push("Combinação inválida: --observability não pode ser usado com --rollback.");
  }
  if (opts.observability && opts.resume) {
    errors.push("Combinação inválida: --observability é modo isolado; não use --resume.");
  }
  if (opts.rollback && opts.resume) {
    errors.push("Combinação inválida: --rollback não pode ser usado com --resume.");
  }
  if (opts.force && !opts.observability && !opts.rollback && !opts.resume) {
    warnings.push("Aviso: --force no fluxo principal recria lifecycle/rollback; use com cuidado.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  validateExecuteCliFlagCombinations,
};
