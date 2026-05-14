"use strict";

/** Fase 4.12.5 — artefacto derivado de adapters de nó (shadow). */
const NODE_ADAPTERS_SCHEMA_VERSION = 1;
const NODE_ADAPTERS_ARTIFACT_FILENAME = "execution-graph-node-adapters.json";
const NODE_ADAPTERS_PHASE = "4.12.5";

const NODE_ADAPTERS_MODE = {
  OFF: "off",
  SHADOW: "shadow",
};

module.exports = {
  NODE_ADAPTERS_SCHEMA_VERSION,
  NODE_ADAPTERS_ARTIFACT_FILENAME,
  NODE_ADAPTERS_PHASE,
  NODE_ADAPTERS_MODE,
};
