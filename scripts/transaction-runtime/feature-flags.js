/**
 * SETUP_BOSS_TRANSACTION_RUNTIME=off|shadow|active (Fase 4.6)
 * — off: comportamento legado (sem escritas transacionais)
 * — shadow: checkpoints, snapshots, manifests, telemetry
 * — active: mesmo que shadow + análise de recovery/rollback ao finalizar
 */

/**
 * @returns {'off'|'shadow'|'active'}
 */
function getTransactionRuntimeMode() {
  const raw = process.env.SETUP_BOSS_TRANSACTION_RUNTIME;
  const x = String(raw || "").toLowerCase().trim();
  if (x === "shadow" || x === "active") return x;
  return "off";
}

function isTransactionRuntimeWritesEnabled() {
  const m = getTransactionRuntimeMode();
  return m === "shadow" || m === "active";
}

function isTransactionRuntimeActiveSemantics() {
  return getTransactionRuntimeMode() === "active";
}

module.exports = {
  getTransactionRuntimeMode,
  isTransactionRuntimeWritesEnabled,
  isTransactionRuntimeActiveSemantics,
};
