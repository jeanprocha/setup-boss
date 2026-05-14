/**
 * Nomes estáveis para artefactos do Transaction Runtime (Fase 4.6).
 */

const CONTRACT_FILENAME = "transaction-runtime.json";

const TRANSACTION_MANIFEST_FILENAME = "transaction-runtime-manifest.json";

const TELEMETRY_FILENAME = "transaction-runtime-telemetry.ndjson";

const SNAPSHOT_REL_DIR = "execution-snapshots";

const LATEST_SNAPSHOT_FILENAME = "execution-snapshot.json";

const SCHEMA_VERSION = 1;

/** @typedef {'initialization'|'planning'|'validation'|'risk_analysis'|'review'|'correction'|'execution'|'finalization'} TransactionStageId */

/** @typedef {'draft'|'running'|'partial'|'completed'|'failed'|'recovered'} TransactionStatus */

/**
 * Hooks de checkpoint oficiais (pós-componente).
 * @type {readonly string[]}
 */
const CHECKPOINT_HOOKS = Object.freeze([
  "post_preflight",
  "post_architect",
  "post_plan",
  "post_validation",
  "post_risk",
  "post_executor",
  "post_review",
  "post_correction",
  "post_knowledge",
]);

module.exports = {
  SCHEMA_VERSION,
  CONTRACT_FILENAME,
  TRANSACTION_MANIFEST_FILENAME,
  TELEMETRY_FILENAME,
  SNAPSHOT_REL_DIR,
  LATEST_SNAPSHOT_FILENAME,
  CHECKPOINT_HOOKS,
};
