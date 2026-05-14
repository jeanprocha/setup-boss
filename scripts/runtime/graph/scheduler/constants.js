"use strict";

/** Relatório advisory execution-graph-scheduler-report.json (Fase 4.12.3). */
const SCHEDULER_REPORT_SCHEMA_VERSION = 1;
const SCHEDULER_ARTIFACT_FILENAME = "execution-graph-scheduler-report.json";

/** @typedef {'off'|'shadow'} SchedulerMode */

const SCHEDULER_ENV_MODE = {
  OFF: "off",
  SHADOW: "shadow",
};

/** Nó simulado: apenas advisory; não invoca handlers reais do pipeline. */
const SCHEDULER_ADVISORY_SOURCE = "execution-graph-scheduler-advisory-mvp";

module.exports = {
  SCHEDULER_REPORT_SCHEMA_VERSION,
  SCHEDULER_ARTIFACT_FILENAME,
  SCHEDULER_ENV_MODE,
  SCHEDULER_ADVISORY_SOURCE,
};
