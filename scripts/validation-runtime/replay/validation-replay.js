/**
 * Utilitários de consistência replay — comparar fingerprints registados (Fase 4.2).
 */

/**
 * @param {object|null} manifest
 * @param {object|null} results
 * @returns {{ ok: boolean, mismatches: object[] }}
 */
function compareReplayRefs(manifest, results) {
  const mismatches = [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: true, mismatches };
  }
  if (!results || typeof results !== "object") {
    return { ok: false, mismatches: [{ kind: "missing_results" }] };
  }

  const mf = manifest.replay && typeof manifest.replay === "object" ? manifest.replay : {};
  const expectedGraph = mf.graph_fingerprint_sha256 != null ? String(mf.graph_fingerprint_sha256) : null;
  const actualGraph =
    results.metadata &&
    typeof results.metadata === "object" &&
    results.metadata.graph_fingerprint_sha256 != null
      ? String(results.metadata.graph_fingerprint_sha256)
      : null;

  if (expectedGraph && actualGraph && expectedGraph !== actualGraph) {
    mismatches.push({
      kind: "graph_fingerprint",
      expected: expectedGraph,
      actual: actualGraph,
    });
  }

  const rows = Array.isArray(results.validators) ? results.validators : [];
  for (const row of rows) {
    const fp = row && row.replay_fingerprint_sha256 != null ? String(row.replay_fingerprint_sha256) : null;
    const meta = row && row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const expectedFp = meta.expected_replay_fingerprint_sha256 != null
      ? String(meta.expected_replay_fingerprint_sha256)
      : null;
    if (expectedFp && fp && expectedFp !== fp) {
      mismatches.push({
        kind: "validator_inputs",
        validator_id: row.validator_id,
        expected: expectedFp,
        actual: fp,
      });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

module.exports = {
  compareReplayRefs,
};
