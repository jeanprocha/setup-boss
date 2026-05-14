"use strict";

/**
 * @param {object} loaded — chaves lógicas -> doc ou null
 */
function consolidateDiagnostics(loaded) {
  const out = {
    sources: /** @type {string[]} */ ([]),
    by_source: {},
  };

  const pick = (key, doc) => {
    if (!doc || typeof doc !== "object") return;
    const d = doc.diagnostics;
    if (d != null && typeof d === "object") {
      out.sources.push(key);
      out.by_source[key] = d;
    }
  };

  pick("scheduler", loaded.scheduler);
  pick("overlay", loaded.overlay);
  pick("replay", loaded.replay);
  pick("risk", loaded.risk);
  pick("runtime", loaded.runtime);

  out.sources.sort();
  return out;
}

module.exports = {
  consolidateDiagnostics,
};
