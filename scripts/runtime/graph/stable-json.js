"use strict";

/**
 * Serialização JSON determinística: ordena chaves de objetos em todos os níveis.
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

/**
 * @param {unknown} v
 * @returns {unknown}
 */
function sortKeysDeep(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  /** @type {Record<string, unknown>} */
  const o = v;
  const out = {};
  for (const k of Object.keys(o).sort()) {
    out[k] = sortKeysDeep(o[k]);
  }
  return out;
}

module.exports = {
  stableStringify,
  sortKeysDeep,
};
