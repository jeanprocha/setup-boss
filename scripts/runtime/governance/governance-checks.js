/**
 * Heurísticas de caminhos sensíveis e correspondência a listas protegidas.
 */

const PATH_HINT_RUNTIME =
  /(scripts[/\\]runtime[/\\]|orchestration\.js|executor\.js|correction\.js|replay[/\\])/i;

/**
 * @param {string} raw
 */
function normalizeRel(raw) {
  return String(raw || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function pathTouchesProtected(relPath, protectedList) {
  const rp = normalizeRel(relPath).toLowerCase();
  const hits = [];

  for (const patt of protectedList || []) {
    const p = normalizeRel(patt).toLowerCase();
    if (!p) continue;

    let ok = false;
    if (p.endsWith("*")) {
      const pre = p.slice(0, -1);
      ok = rp.startsWith(pre);
    } else if (p.endsWith("/")) {
      ok = rp.includes(p) || rp.startsWith(p);
    } else {
      ok = rp === p || rp.endsWith("/" + p) || rp.includes("/" + p + "/") || rp.endsWith("/" + p);
    }

    if (ok) hits.push(patt);
  }

  return hits;
}

/**
 * Percorre caminhos (executor-changes) e lista os que são protegidos.
 *
 * @param {Array<{path?: string, file?: string, target?: string}>} changes
 */
function collectProtectedTouches(changes, protectedList) {
  const uniq = new Set();

  const out = [];

  const consider = (p) => {
    const rp = normalizeRel(p);
    if (!rp || uniq.has(rp)) return;

    uniq.add(rp);

    const h = pathTouchesProtected(rp, protectedList);
    if (h.length) {
      out.push({ path: rp, matched_patterns: h });
    }
  };

  for (const ch of changes || []) {
    consider(ch.path || ch.file || ch.target || "");
  }

  return out;
}

/** @returns {boolean} */
function snippetLooksRuntimeSensitive(text) {
  return PATH_HINT_RUNTIME.test(String(text || ""));
}

function riskIsElevated(riskTier) {
  const t = String(riskTier || "").toUpperCase();
  return t === "HIGH" || t === "CRITICAL";
}

function complexityIsElevated(compTier) {
  const t = String(compTier || "").toUpperCase();
  return t === "HIGH" || t === "EXTREME";
}

function signalsFromPreflight(preflightReport, taskContent) {
  const riskTier = preflightReport && preflightReport.risk && preflightReport.risk.tier;
  const complexityTier =
    preflightReport && preflightReport.complexity && preflightReport.complexity.tier;

  const changeTypes =
    (preflightReport && preflightReport.scope && preflightReport.scope.change_types) || [];

  const migrationOrSecuritySignals =
    changeTypes.some((x) =>
      /seguran|persist|migration|schema|dados/i.test(String(x)),
    ) || snippetLooksRuntimeSensitive(String(taskContent || ""));

  const runtimeCoreSuggested =
    (preflightReport &&
      Array.isArray(preflightReport.warnings) &&
      preflightReport.warnings.some(
        (w) => String(w.code) === "runtime_touch",
      )) ||
    snippetLooksRuntimeSensitive(String(taskContent || ""));

  const maxFilesEstimate =
    (preflightReport &&
      preflightReport.scope &&
      preflightReport.scope.estimated_files_max) ||
    0;

  return {
    riskTier,
    complexityTier,
    migrationOrSecuritySignals,
    runtimeCoreSuggested,
    maxFilesEstimate,
    elevatedRisk: riskIsElevated(riskTier),
    elevatedComplexity: complexityIsElevated(complexityTier),
    crossLayerSuggested:
      (preflightReport &&
        Array.isArray(preflightReport.warnings) &&
        preflightReport.warnings.some((w) => String(w.code) === "cross_layer")) ||
      false,
  };
}

module.exports = {
  normalizeRel,
  pathTouchesProtected,
  collectProtectedTouches,
  snippetLooksRuntimeSensitive,
  signalsFromPreflight,
  riskIsElevated,
  complexityIsElevated,
};
