"use strict";

const { buildIaValidation } = require("./ia-validation-diagnostics");
const {
  validateGovernanceStructure,
  buildInvalidStructureFailure,
} = require("./validate-ia-governance-structure");
const {
  detectStructuralDrift,
  buildStructuralDriftFailure,
} = require("./validate-ia-structural-drift");
const {
  validateIaContentPolicy,
  buildSensitiveDataFailure,
} = require("./validate-ia-content-policy");
const {
  validateIaSpecVersion,
  buildSpecVersionFailure,
} = require("./validate-ia-spec-version");

/** Ordem oficial SPEC v1.0 (após Git tracked). */
const PIPELINE_STAGE_ORDER = Object.freeze([
  "seed",
  "version",
  "structure",
  "drift",
  "policy",
]);

/**
 * @param {number} startedAt
 * @param {{
 *   ok: boolean,
 *   failedStage?: string|null,
 *   code?: string|null,
 *   specVersion?: string|null,
 *   stages: { id: string, durationMs: number, status: string }[],
 *   metrics: Record<string, unknown>,
 *   warnings?: string[],
 *   errors?: { check: string, code: string, message: string }[],
 * }} input
 */
function buildValidationSnapshot(input) {
  const warnings = input.warnings || [];
  const errors = input.errors || [];
  let summary;
  if (input.ok) {
    summary =
      warnings.length > 0
        ? `Knowledge base ready (${warnings.length} aviso(s))`
        : "Knowledge base ready";
  } else {
    summary = `Falha em ${input.failedStage || "unknown"}: ${input.code || "error"}`;
  }

  return {
    schemaVersion: "1.0",
    ok: input.ok,
    specVersion: input.specVersion ?? null,
    validationDurationMs: Date.now() - input.startedAt,
    failedStage: input.failedStage ?? null,
    stages: input.stages,
    metrics: input.metrics,
    checks: PIPELINE_STAGE_ORDER.map((id) => {
      const stage = input.stages.find((s) => s.id === id);
      return {
        id,
        status: stage?.status || (input.ok ? "ok" : "skip"),
        durationMs: stage?.durationMs ?? 0,
      };
    }),
    errors,
    warnings,
    summary,
  };
}

/**
 * @param {import("./ia-governance-validation-context").buildIaGovernanceValidationContext extends (...args: any) => infer R ? R : never} ctx
 * @param {string} docsIaPath
 * @returns {{
 *   ok: true,
 *   seed: Record<string, unknown>,
 *   specVersion: Record<string, unknown>,
 *   structure: Record<string, unknown>,
 *   drift: Record<string, unknown>,
 *   policy: Record<string, unknown>,
 *   validationSnapshot: Record<string, unknown>,
 * } | {
 *   ok: false,
 *   failure: Record<string, unknown>,
 *   validationSnapshot: Record<string, unknown>,
 * }}
 */
function runIaGovernanceValidationPipeline(ctx, docsIaPath) {
  /** @type {{ id: string, durationMs: number, status: string }[]} */
  const stages = [];
  /** @type {string[]} */
  const warnings = [];
  const pipelineStartedAt = ctx.startedAt || Date.now();

  /**
   * @param {string} id
   * @param {() => { stop?: boolean, failure?: Record<string, unknown>, warning?: string, status?: string }} fn
   */
  const runStage = (id, fn) => {
    const t0 = Date.now();
    const result = fn();
    const durationMs = Date.now() - t0;
    stages.push({
      id,
      durationMs,
      status: result.status || (result.stop ? "fail" : "ok"),
    });
    if (result.warning) warnings.push(result.warning);
    return result;
  };

  const kb = require("./validate-project-knowledge-base");

  const seedStage = runStage("seed", () => {
    const seed = kb.validateRequiredKnowledgeSeed(ctx.projectRootAbs, ctx.trackedFiles);
    if (!seed.seedValid) {
      return {
        stop: true,
        status: "fail",
        failure: kb.buildInvalidSeedFailure(seed, docsIaPath),
      };
    }
    return { seed };
  });
  if (seedStage.stop) {
    const snap = buildValidationSnapshot({
      ok: false,
      failedStage: "seed",
      code: String(seedStage.failure?.code || ""),
      specVersion: null,
      stages,
      metrics: { ...ctx.metrics, pipelineStageMs: sumStageMs(stages) },
      startedAt: pipelineStartedAt,
    });
    return {
      ok: false,
      failure: attachSnapshot(seedStage.failure, snap),
      validationSnapshot: snap,
    };
  }

  const versionStage = runStage("version", () => {
    const specVersion = validateIaSpecVersion(ctx.projectRootAbs, { context: ctx });
    if (!specVersion.versionValid) {
      return {
        stop: true,
        status: "fail",
        failure: buildSpecVersionFailure(specVersion, docsIaPath),
      };
    }
    return { specVersion };
  });
  if (versionStage.stop) {
    const snap = buildValidationSnapshot({
      ok: false,
      failedStage: "version",
      code: String(versionStage.failure?.code || ""),
      specVersion: versionStage.failure?.specVersion
        ? String(versionStage.failure.specVersion)
        : null,
      stages,
      metrics: { ...ctx.metrics, pipelineStageMs: sumStageMs(stages) },
      startedAt: pipelineStartedAt,
    });
    return {
      ok: false,
      failure: attachSnapshot(versionStage.failure, snap),
      validationSnapshot: snap,
    };
  }

  const structureStage = runStage("structure", () => {
    const structure = validateGovernanceStructure(ctx.projectRootAbs, ctx.trackedFiles);
    if (!structure.structureValid) {
      return {
        stop: true,
        status: "fail",
        failure: buildInvalidStructureFailure(structure, docsIaPath),
      };
    }
    return { structure };
  });
  if (structureStage.stop) {
    const snap = buildValidationSnapshot({
      ok: false,
      failedStage: "structure",
      code: String(structureStage.failure?.code || ""),
      specVersion: versionStage.specVersion?.specVersion
        ? String(versionStage.specVersion.specVersion)
        : null,
      stages,
      metrics: { ...ctx.metrics, pipelineStageMs: sumStageMs(stages) },
      startedAt: pipelineStartedAt,
    });
    return {
      ok: false,
      failure: attachSnapshot(structureStage.failure, snap),
      validationSnapshot: snap,
    };
  }

  const driftStage = runStage("drift", () => {
    const drift = detectStructuralDrift(ctx.projectRootAbs, ctx.trackedFiles);
    if (!drift.driftValid) {
      return {
        stop: true,
        status: "fail",
        failure: buildStructuralDriftFailure(drift, docsIaPath),
      };
    }
    for (const w of drift.warnings || []) warnings.push(String(w));
    return { drift, status: drift.warnings?.length ? "warn" : "ok" };
  });
  if (driftStage.stop) {
    const snap = buildValidationSnapshot({
      ok: false,
      failedStage: "drift",
      code: String(driftStage.failure?.code || ""),
      specVersion: versionStage.specVersion?.specVersion
        ? String(versionStage.specVersion.specVersion)
        : null,
      stages,
      metrics: { ...ctx.metrics, pipelineStageMs: sumStageMs(stages) },
      warnings,
      startedAt: pipelineStartedAt,
    });
    return {
      ok: false,
      failure: attachSnapshot(driftStage.failure, snap),
      validationSnapshot: snap,
    };
  }

  const policyT0 = Date.now();
  const policy = validateIaContentPolicy(ctx.projectRootAbs, ctx.trackedFiles, {
    context: ctx,
  });
  const contentScanMs = Date.now() - policyT0;
  stages.push({
    id: "policy",
    durationMs: contentScanMs,
    status: policy.policyValid
      ? policy.policyWarnings?.length
        ? "warn"
        : "ok"
      : "fail",
  });

  for (const pw of policy.policyWarnings || []) {
    warnings.push(String(pw.message || pw.code || ""));
  }

  if (!policy.policyValid) {
    const snap = buildValidationSnapshot({
      ok: false,
      failedStage: "policy",
      code: "KNOWLEDGE_BASE_SENSITIVE_DATA",
      specVersion: versionStage.specVersion?.specVersion
        ? String(versionStage.specVersion.specVersion)
        : null,
      stages,
      metrics: {
        ...ctx.metrics,
        contentScanMs,
        pipelineStageMs: sumStageMs(stages),
      },
      warnings,
      startedAt: pipelineStartedAt,
    });
    const failure = buildSensitiveDataFailure(policy, docsIaPath);
    return {
      ok: false,
      failure: attachSnapshot(failure, snap),
      validationSnapshot: snap,
    };
  }

  const validationSnapshot = buildValidationSnapshot({
    ok: true,
    specVersion: versionStage.specVersion?.specVersion
      ? String(versionStage.specVersion.specVersion)
      : null,
    stages,
    metrics: {
      ...ctx.metrics,
      contentScanMs,
      pipelineStageMs: sumStageMs(stages),
    },
    warnings,
    startedAt: pipelineStartedAt,
  });

  return {
    ok: true,
    seed: seedStage.seed,
    specVersion: versionStage.specVersion,
    structure: structureStage.structure,
    drift: driftStage.drift,
    policy,
    validationSnapshot,
  };
}

/**
 * @param {{ durationMs: number }[]} stages
 * @returns {number}
 */
function sumStageMs(stages) {
  return stages.reduce((sum, s) => sum + (s.durationMs || 0), 0);
}

/**
 * @param {Record<string, unknown>|undefined} failure
 * @param {Record<string, unknown>} snapshot
 */
function attachSnapshot(failure, snapshot) {
  if (!failure || typeof failure !== "object") return failure;
  return { ...failure, validationSnapshot: snapshot };
}

/**
 * Enriquece snapshot com iaValidation quando aplicável.
 *
 * @param {Record<string, unknown>} result
 * @returns {Record<string, unknown>}
 */
function enrichResultWithDiagnostics(result) {
  if (!result || typeof result !== "object") return result;
  const snapshot =
    result.validationSnapshot && typeof result.validationSnapshot === "object"
      ? /** @type {Record<string, unknown>} */ (result.validationSnapshot)
      : null;
  if (!snapshot) return result;

  if (result.ok === false && result.code) {
    const ia = buildIaValidation(result);
    if (ia) {
      snapshot.iaValidation = ia;
      if (ia.errors?.length) {
        snapshot.errors = ia.errors;
      }
    }
  }

  return result;
}

module.exports = {
  PIPELINE_STAGE_ORDER,
  buildValidationSnapshot,
  runIaGovernanceValidationPipeline,
  attachSnapshot,
  enrichResultWithDiagnostics,
};
