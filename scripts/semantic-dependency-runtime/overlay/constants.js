"use strict";

const SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION = "semantic-mutation-graph/1";
const PROPAGATION_MANIFEST_SCHEMA_VERSION = "propagation-manifest/1";

const SEMANTIC_MUTATION_GRAPH_FILENAME = "semantic-mutation-graph.json";
const PROPAGATION_MANIFEST_FILENAME = "propagation-manifest.json";

/** @typedef {(typeof MutationReasonCodes)[keyof typeof MutationReasonCodes]} MutationReasonEnum */

const MutationReasonCodes = Object.freeze({
  DIRECT_CHANGE: "direct_change",
  RECONCILIATION_UNEXPECTED: "reconciliation_unexpected",
  RECONCILIATION_UNMATCHED: "reconciliation_unmatched",
  IMPORT_REACH: "import_reach",
  REVERSE_IMPORT_REACH: "reverse_import_reach",
  EXPLICIT_ROOT: "explicit_root",
});

const MutationReason_SET = new Set(Object.values(MutationReasonCodes));

const OVERLAY_LIMITS_DEFAULTS = Object.freeze({
  /** Hops desde qualquer seed na direcção forwards (imports) ou backwards (reverse). */
  max_hops: 32,
  max_nodes: 2000,
  max_edges: 4096,
  enable_reverse_reach: true,
});

module.exports = {
  SEMANTIC_MUTATION_GRAPH_SCHEMA_VERSION,
  PROPAGATION_MANIFEST_SCHEMA_VERSION,
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  PROPAGATION_MANIFEST_FILENAME,
  MutationReasonCodes,
  MutationReason_SET,
  OVERLAY_LIMITS_DEFAULTS,
};
