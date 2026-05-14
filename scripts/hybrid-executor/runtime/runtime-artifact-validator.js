"use strict";

const { getArtifactContract } = require("./runtime-lifecycle");

/**
 * @param {string} filename
 * @param {object|null|undefined} doc
 * @returns {{ ok: boolean, skipped?: boolean, errors: string[] }}
 */
function validateArtifactDoc(filename, doc) {
  const contract = getArtifactContract(filename);

  if (!contract) {
    return { ok: true, skipped: true, errors: [] };
  }

  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: [`${filename}: documento ausente ou inválido`] };
  }

  /** @type {string[]} */
  const errors = [];

  if (doc.schema_version !== contract.schema_version) {
    errors.push(
      `${filename}: schema_version esperado ${contract.schema_version}, recebido ${doc.schema_version}`,
    );
  }

  if (String(doc.phase || "") !== contract.phase) {
    errors.push(`${filename}: phase esperada "${contract.phase}", recebida "${doc.phase}"`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {Record<string, object>} bundle — filename → objeto parseado
 */
function validateArtifactsBundleDocuments(bundle) {
  const out = [];

  for (const filename of Object.keys(bundle || {})) {
    const doc = bundle[filename];
    const one = validateArtifactDoc(filename, doc);
    if (!one.skipped) {
      out.push({ filename, ok: one.ok, errors: one.errors });
    }
  }

  return {
    ok: out.every((x) => x.ok),
    per_file: out,
  };
}

/**
 * Regras cruzadas MVP entre artefactos presentes no bundle.
 * @param {Record<string, object>} bundle
 */
function validateArtifactsBundleConsistency(bundle) {
  /** @type {string[]} */
  const errors = [];

  const hybrid = bundle["hybrid-execution-results.json"];
  const fb = bundle["structural-fallback-report.json"];
  const cls = bundle["structural-replay-classification.json"];

  if (hybrid && Array.isArray(hybrid.per_patch) && fb && Array.isArray(fb.entries)) {
    if (hybrid.per_patch.length !== fb.entries.length) {
      errors.push(
        `hybrid-execution-results.per_patch (${hybrid.per_patch.length}) ≠ structural-fallback-report.entries (${fb.entries.length})`,
      );
    }
  }

  if (hybrid && cls && cls.summary && typeof cls.summary.per_patch === "number") {
    if (hybrid.per_patch && hybrid.per_patch.length !== cls.summary.per_patch) {
      errors.push(
        `hybrid-execution-results.per_patch (${hybrid.per_patch.length}) ≠ classification.summary.per_patch (${cls.summary.per_patch})`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {Record<string, object>} bundle
 */
function runArtifactValidationSuite(bundle) {
  const docs = validateArtifactsBundleDocuments(bundle);
  const consistency = validateArtifactsBundleConsistency(bundle);

  return {
    ok: docs.ok && consistency.ok,
    documents: docs,
    consistency,
  };
}

module.exports = {
  validateArtifactDoc,
  validateArtifactsBundleDocuments,
  validateArtifactsBundleConsistency,
  runArtifactValidationSuite,
};
