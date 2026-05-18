"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @typedef {"always"|"llm_completed"} ArtifactRequiredWhen
 */

/**
 * @type {{ name: string, type: string, requiredWhen: ArtifactRequiredWhen|"optional" }[]}
 */
const INTAKE_MANIFEST_ARTIFACT_SPECS = [
  { name: "metadata.json", type: "metadata", requiredWhen: "always" },
  { name: "run-context.json", type: "run_context", requiredWhen: "always" },
  { name: "intake-context-summary.json", type: "context_summary", requiredWhen: "always" },
  { name: "intake-discovery-analysis.json", type: "discovery", requiredWhen: "always" },
  { name: "intake-classification.json", type: "classification", requiredWhen: "always" },
  { name: "task-discovery.md", type: "markdown", requiredWhen: "llm_completed" },
  { name: "task-plan-initial.md", type: "markdown", requiredWhen: "llm_completed" },
  { name: "intake-llm-error.json", type: "llm_error", requiredWhen: "optional" },
];

/**
 * @param {ArtifactRequiredWhen|"optional"} when
 * @param {string} llmStatus
 */
function isArtifactRequired(when, llmStatus) {
  if (when === "always") return true;
  if (when === "optional") return false;
  if (when === "llm_completed") return llmStatus === "completed";
  return false;
}

/**
 * @param {{
 *   runId: string,
 *   runType: string,
 *   generatedAt: string,
 *   classification: string,
 *   llmStatus: string,
 *   outputDir: string,
 * }} p
 */
function buildIntakeManifest(p) {
  const outDir = path.resolve(p.outputDir);
  const llmStatus = String(p.llmStatus || "skipped");

  /** @type {{ name: string, type: string, required: boolean, exists: boolean }[]} */
  const artifacts = [];

  for (const spec of INTAKE_MANIFEST_ARTIFACT_SPECS) {
    const required = isArtifactRequired(spec.requiredWhen, llmStatus);
    const abs = path.join(outDir, spec.name);
    const exists = fs.existsSync(abs);
    artifacts.push({
      name: spec.name,
      type: spec.type,
      required,
      exists,
    });
  }

  return {
    schema_version: "1.0.0",
    run_id: p.runId,
    run_type: p.runType,
    generated_at: p.generatedAt,
    status: "classified",
    classification: p.classification,
    artifacts,
  };
}

/**
 * @param {string} outputDir
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateIntakeArtifacts(outputDir) {
  const outDir = path.resolve(outputDir);
  /** @type {string[]} */
  const errors = [];

  const rcPath = path.join(outDir, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta (necessário para inferir regras LLM).");
    return { ok: false, errors };
  }

  let llmStatus = "skipped";
  try {
    const raw = fs.readFileSync(rcPath, "utf-8");
    const rc = JSON.parse(raw);
    if (rc.phase1 && rc.phase1.llm && rc.phase1.llm.status) {
      llmStatus = String(rc.phase1.llm.status);
    }
  } catch {
    errors.push("run-context.json inválido ou ilegível.");
    return { ok: false, errors };
  }

  const requiredNames = new Set(
    INTAKE_MANIFEST_ARTIFACT_SPECS.filter((s) =>
      isArtifactRequired(s.requiredWhen, llmStatus),
    ).map((s) => s.name),
  );

  for (const name of requiredNames) {
    const fp = path.join(outDir, name);
    if (!fs.existsSync(fp)) {
      errors.push(`Artefacto obrigatório em falta: ${name}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const manifestPath = path.join(outDir, "intake-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    errors.push("intake-manifest.json em falta.");
    return { ok: false, errors };
  }

  return { ok: true };
}

/**
 * @param {string} outputDir
 */
function validateIntakeArtifactsOrThrow(outputDir) {
  const r = validateIntakeArtifacts(outputDir);
  if (!r.ok) {
    const e = new Error(
      r.errors && r.errors.length ? r.errors.join(" ") : "Validação de artefactos falhou.",
    );
    /** @type {any} */ (e).code = "INTAKE_ARTIFACT_VALIDATION_FAILED";
    /** @type {any} */ (e).errors = r.errors;
    throw e;
  }
}

module.exports = {
  buildIntakeManifest,
  validateIntakeArtifacts,
  validateIntakeArtifactsOrThrow,
  INTAKE_MANIFEST_ARTIFACT_SPECS,
};
