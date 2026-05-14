"use strict";

/**
 * Semantic Dependency Graph Core — constantes centrais (Fase 4.8.1).
 * O campo lifecycle existe no artefacto, mas não entra no payload canónico do fingerprint
 * do grafo (identidade estrutural + política de geração).
 */

const SEMANTIC_DEP_GRAPH_SCHEMA_VERSION = "semantic-dependency-graph/1";
const GRAPH_SNAPSHOT_SCHEMA_VERSION = "semantic-graph-snapshot/1";

const GRAPH_MANIFEST_FILENAME = "dependency-graph.json";
const GRAPH_SNAPSHOT_MANIFEST_FILENAME = "graph-snapshot.json";

/** @typedef {typeof LifecycleState[keyof typeof LifecycleState]} LifecycleStateEnum */
const LifecycleState = Object.freeze({
  REQUESTED: "REQUESTED",
  BUILDING: "BUILDING",
  SNAPSHOTTED: "SNAPSHOTTED",
  SUPERSEDED: "SUPERSEDED",
  FAILED: "FAILED",
});

/** Conjuntos mínimos v1 — extensíveis nos próximos passos sem quebrar validação quando desligada. */
const NODE_KIND_VALUES = Object.freeze([
  "file",
  "module",
  "package",
  "symbol_placeholder",
]);

const EDGE_KIND_VALUES = Object.freeze([
  "placeholder_dependency",
  "import_placeholder",
  "module_placeholder",
  /** Fase 4.8.2 — JS/TS import graph MVP */
  "static_relative_import",
  "export_relative_reexport",
  "dynamic_relative_import",
  "require_relative",
]);

const LifecycleState_VALUES = Object.freeze([
  LifecycleState.REQUESTED,
  LifecycleState.BUILDING,
  LifecycleState.SNAPSHOTTED,
  LifecycleState.SUPERSEDED,
  LifecycleState.FAILED,
]);

const NODE_KIND_SET = new Set(NODE_KIND_VALUES);
const EDGE_KIND_SET = new Set(EDGE_KIND_VALUES);
const LifecycleState_SET = new Set(LifecycleState_VALUES);

/** Relatório consolidado — Fase 4.8.8 (só leitura / inspect). */
const SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION = "semantic-diagnostics/1";
const SEMANTIC_DIAGNOSTICS_FILENAME = "semantic-diagnostics.json";

module.exports = {
  SEMANTIC_DEP_GRAPH_SCHEMA_VERSION,
  GRAPH_SNAPSHOT_SCHEMA_VERSION,
  GRAPH_MANIFEST_FILENAME,
  GRAPH_SNAPSHOT_MANIFEST_FILENAME,
  SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION,
  SEMANTIC_DIAGNOSTICS_FILENAME,
  LifecycleState,
  NODE_KIND_VALUES,
  EDGE_KIND_VALUES,
  NODE_KIND_SET,
  EDGE_KIND_SET,
  LifecycleState_SET,
};
