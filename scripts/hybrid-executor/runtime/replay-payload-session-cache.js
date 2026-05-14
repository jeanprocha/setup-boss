"use strict";

/**
 * Cache por corrida (invocação de writeHybridExecutionArtifacts): deduplica
 * `buildStructuralReplayShadowPayload` entre artefactos replay e bundle observability.
 */
function createReplayPayloadRunScope() {
  /** @type {object|null} */
  let cached = null;

  return {
    /**
     * @template T
     * @param {() => T} buildFn
     * @returns {T}
     */
    getOrBuild(buildFn) {
      if (cached === null) {
        cached = buildFn();
      }
      return cached;
    },
  };
}

module.exports = {
  createReplayPayloadRunScope,
};
