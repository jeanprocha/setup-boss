const path = require("path");
const { createTelemetry } = require("./telemetry");
const { createFileCache } = require("./file-cache");
const { createSnippetCache } = require("./snippet-cache");

const SCRIPT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Contexto compartilhado do pipeline (um por run, in-process).
 */
function createRuntimeContext(partial) {
  const telemetry = createTelemetry();
  const cache = createFileCache({ telemetry });
  const snippetCache = createSnippetCache({ telemetry });

  const baseState = partial.state && typeof partial.state === "object" ? partial.state : {};

  return {
    runId: partial.runId,
    taskArg: partial.taskArg,
    projectArg: partial.projectArg,
    taskPath: partial.taskPath,
    projectPath: partial.projectPath,
    projectRoot: partial.projectRoot,
    outputDir: partial.outputDir,
    rootDir: partial.rootDir || REPO_ROOT,
    scriptsDir: partial.scriptsDir || SCRIPT_ROOT,
    logger: partial.logger ?? null,
    metadata: partial.metadata ?? null,
    runContext: partial.runContext ?? null,
    artifacts: partial.artifacts || {},
    metrics: partial.metrics || {},
    execution: partial.execution || { dryRun: false },
    cache,
    snippetCache,
    telemetry,
    iteration: partial.iteration ?? 0,
    state: {
      virtual_project_overlay: {},
      ...baseState,
    },
  };
}

/**
 * Contexto mínimo para scripts CLI que só recebem runId (executor, review, ...).
 */
function createStageContextFromOutputDir(outputDir, extra = {}) {
  const telemetry = createTelemetry();
  const cache = createFileCache({ telemetry });
  const snippetCache = createSnippetCache({ telemetry });
  const baseState = extra.state && typeof extra.state === "object" ? extra.state : {};
  return {
    ...extra,
    outputDir,
    rootDir: extra.rootDir || REPO_ROOT,
    scriptsDir: extra.scriptsDir || SCRIPT_ROOT,
    logger: extra.logger ?? null,
    metadata: extra.metadata ?? null,
    runContext: extra.runContext ?? null,
    artifacts: extra.artifacts || {},
    metrics: extra.metrics || {},
    execution: extra.execution || { dryRun: false },
    cache,
    snippetCache,
    telemetry,
    iteration: extra.iteration ?? 0,
    state: {
      virtual_project_overlay: {},
      ...baseState,
    },
  };
}

module.exports = {
  REPO_ROOT,
  SCRIPT_ROOT,
  createRuntimeContext,
  createStageContextFromOutputDir,
};
