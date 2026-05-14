"use strict";

const constants = require("./constants");
const graphManifest = require("./graph-manifest");
const snapshotManifest = require("./snapshot-manifest");
const fingerprint = require("./fingerprint/graph-fingerprint");
const lifecycleModule = require("./lifecycle");
const validation = require("./validation/graph-validation");
const fixtureGraphBuilder = require("./fixture/fixture-graph-builder");
const jsTsImportGraphBuilder = require("./plugins/js-ts/import-graph-builder");
const semanticMutationOverlay = require("./overlay/semantic-mutation-overlay");

module.exports = {
  ...constants,
  ...graphManifest,
  ...snapshotManifest,
  ...fingerprint,
  validateDependencyGraph: validation.validateDependencyGraph,
  validateSnapshotManifest: validation.validateSnapshotManifest,
  snapshotCanonicalFingerprint: validation.snapshotCanonicalFingerprint,
  isValidLifecycleState: lifecycleModule.isValidLifecycleState,
  assertValidLifecycleStateOrThrow: lifecycleModule.assertValidLifecycleStateOrThrow,
  persistFixtureSemanticGraphArtifacts: fixtureGraphBuilder.persistFixtureSemanticGraphArtifacts,
  buildJsTsImportDependencyGraphDocument: jsTsImportGraphBuilder.buildJsTsImportDependencyGraphDocument,
  JS_TS_IMPORT_GRAPH_DEFAULT_LIMITS: jsTsImportGraphBuilder.DEFAULT_LIMITS,
  ...semanticMutationOverlay,
};
