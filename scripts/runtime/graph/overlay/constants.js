"use strict";

/** execution-graph-overlay-report.json (Fase 4.12.4) */
const OVERLAY_REPORT_SCHEMA_VERSION = 1;
const OVERLAY_ARTIFACT_FILENAME = "execution-graph-overlay-report.json";

/** @typedef {'off'|'shadow'} GraphOverlayMode */

const OVERLAY_MODE = {
  OFF: "off",
  SHADOW: "shadow",
};

/**
 * @typedef {'consistent'|'warning'|'divergent'} OverlayStatus
 */
const OVERLAY_STATUS = {
  CONSISTENT: "consistent",
  WARNING: "warning",
  DIVERGENT: "divergent",
};

module.exports = {
  OVERLAY_REPORT_SCHEMA_VERSION,
  OVERLAY_ARTIFACT_FILENAME,
  OVERLAY_MODE,
  OVERLAY_STATUS,
};
