"use strict";

/**
 * Contratos estruturais 4.12.1 (sem runtime scheduler).
 */
const { NODE_KINDS_ORDER, NODE_STATUS, EDGE_KIND } = require("./constants");
const { validateExecutionGraphDoc } = require("./graph-validation");

const ALLOWED_NODE_STATUS = new Set(Object.values(NODE_STATUS));
const ALLOWED_EDGE_KIND = new Set(Object.values(EDGE_KIND));
const ALLOWED_NODE_KIND = new Set(NODE_KINDS_ORDER);

function assertAllowedNodeKind(kind) {
  return ALLOWED_NODE_KIND.has(kind);
}

module.exports = {
  ALLOWED_NODE_STATUS,
  ALLOWED_EDGE_KIND,
  ALLOWED_NODE_KIND,
  assertAllowedNodeKind,
  validateExecutionGraphDoc,
};
