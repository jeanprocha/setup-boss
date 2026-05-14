const { finding } = require("./invariant-types");

function evaluateReplayInvariant(snapshot) {
  const out = [];
  const ck = snapshot.runtime_checkpoints;
  if (!ck || typeof ck !== "object") return out;

  const entries = Array.isArray(ck.checkpoints) ? ck.checkpoints : Array.isArray(ck.entries) ? ck.entries : null;
  if (!entries || entries.length < 2) return out;

  let lastPhase = null;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const phase = e.phase != null ? String(e.phase) : "";
    if (lastPhase === "review" && phase === "executor") {
      out.push(
        finding(
          "replay_invariant.phase_regression",
          "replay",
          "medium",
          "warn",
          { from: lastPhase, to: phase },
          ["Verificar runtime-checkpoints.json por drift ou replay parcial."],
        ),
      );
    }
    lastPhase = phase || lastPhase;
  }

  const pm = snapshot.patch_manifest;
  if (pm && pm.run_id && snapshot.metadata && snapshot.metadata.runId) {
    if (String(pm.run_id) !== String(snapshot.metadata.runId)) {
      out.push(
        finding(
          "replay_invariant.run_id_mismatch",
          "replay",
          "medium",
          "warn",
          { patch_manifest_run_id: pm.run_id, metadata_run_id: snapshot.metadata.runId },
          ["Alinhar identificadores de run nos artefactos de replay."],
        ),
      );
    }
  }

  return out;
}

module.exports = { evaluateReplayInvariant };
