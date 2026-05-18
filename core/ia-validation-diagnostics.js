"use strict";

const { SUPPORTED_SPEC_VERSIONS } = require("./validate-ia-spec-version");

/** @type {Record<string, string>} */
const CODE_TO_FAILED_CHECK = Object.freeze({
  KNOWLEDGE_BASE_MISSING: "git",
  KNOWLEDGE_BASE_UNTRACKED: "git",
  KNOWLEDGE_BASE_IGNORED: "git",
  KNOWLEDGE_BASE_NOT_GIT: "git",
  KNOWLEDGE_BASE_WRONG_PATH: "git",
  PROJECT_ROOT_UNRESOLVED: "git",
  KNOWLEDGE_BASE_INVALID_SEED: "seed",
  KNOWLEDGE_BASE_VERSION_MISSING: "version",
  KNOWLEDGE_BASE_VERSION_INVALID: "version",
  KNOWLEDGE_BASE_UNSUPPORTED_VERSION: "version",
  KNOWLEDGE_BASE_INVALID_STRUCTURE: "structure",
  KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION: "structure",
  KNOWLEDGE_BASE_STRUCTURAL_DRIFT: "drift",
  KNOWLEDGE_BASE_SENSITIVE_DATA: "policy",
  KNOWLEDGE_BASE_LANGUAGE_WARNING: "policy",
});

/** @type {readonly { id: string, label: string }[]} */
const CHECK_DEFINITIONS = Object.freeze([
  { id: "git", label: "Git / docs/.IA" },
  { id: "seed", label: "Seed mínimo SPEC v1.0" },
  { id: "version", label: "Versão da SPEC" },
  { id: "structure", label: "Estrutura governada" },
  { id: "drift", label: "Drift estrutural" },
  { id: "policy", label: "Content Policy" },
]);

const CHECK_ORDER = Object.freeze(CHECK_DEFINITIONS.map((c) => c.id));

/**
 * @param {string} code
 * @returns {boolean}
 */
function isIaKnowledgeCode(code) {
  const c = String(code || "").trim();
  return c.startsWith("KNOWLEDGE_BASE_") || c === "PROJECT_ROOT_UNRESOLVED";
}

/**
 * @param {string} checkId
 * @param {string|null} failedCheck
 * @param {boolean} hasDriftWarnings
 * @param {boolean} hasPolicyLanguageWarnings
 * @returns {"ok"|"fail"|"skip"|"warn"}
 */
function statusForCheck(checkId, failedCheck, hasDriftWarnings, hasPolicyLanguageWarnings) {
  if (!failedCheck) {
    if (checkId === "drift" && hasDriftWarnings) return "warn";
    if (checkId === "policy" && hasPolicyLanguageWarnings) return "warn";
    return "ok";
  }
  const failedIdx = CHECK_ORDER.indexOf(failedCheck);
  const checkIdx = CHECK_ORDER.indexOf(checkId);
  if (checkIdx < 0 || failedIdx < 0) return "skip";
  if (checkIdx < failedIdx) return "ok";
  if (checkIdx === failedIdx) {
    if (checkId === "policy" && failedCheck === "policy" && hasPolicyLanguageWarnings) {
      return "warn";
    }
    return "fail";
  }
  return "skip";
}

/**
 * @param {Record<string, unknown>} enriched
 * @returns {Record<string, unknown>|null}
 */
function buildIaValidation(enriched) {
  const code = String(enriched.code || "").trim();
  if (!isIaKnowledgeCode(code)) return null;

  const failedCheck = CODE_TO_FAILED_CHECK[code] || null;
  const driftWarnings = Array.isArray(enriched.warnings)
    ? enriched.warnings.map((w) => String(w)).filter(Boolean)
    : [];
  const hasDriftWarnings = driftWarnings.length > 0;

  const details =
    enriched.details && typeof enriched.details === "object" && !Array.isArray(enriched.details)
      ? /** @type {Record<string, unknown>} */ (enriched.details)
      : {};

  const policyFromDetails =
    details.policyValidation &&
    typeof details.policyValidation === "object"
      ? /** @type {Record<string, unknown>} */ (details.policyValidation)
      : null;

  const policyWarnings = Array.isArray(enriched.policyWarnings)
    ? enriched.policyWarnings
        .map((w) => {
          if (typeof w === "string") return w;
          if (w && typeof w === "object" && /** @type {{ message?: string }} */ (w).message) {
            return String(/** @type {{ message: string }} */ (w).message);
          }
          return "";
        })
        .filter(Boolean)
    : [];

  const languageScan =
    enriched.languageScan &&
    typeof enriched.languageScan === "object" &&
    !Array.isArray(enriched.languageScan)
      ? /** @type {Record<string, unknown>} */ (enriched.languageScan)
      : policyFromDetails?.languageScan &&
          typeof policyFromDetails.languageScan === "object"
        ? /** @type {Record<string, unknown>} */ (policyFromDetails.languageScan)
        : null;

  const secretScan =
    enriched.secretScan &&
    typeof enriched.secretScan === "object" &&
    !Array.isArray(enriched.secretScan)
      ? /** @type {Record<string, unknown>} */ (enriched.secretScan)
      : policyFromDetails?.secretScan &&
          typeof policyFromDetails.secretScan === "object"
        ? /** @type {Record<string, unknown>} */ (policyFromDetails.secretScan)
        : null;

  const hasPolicyLanguageWarnings =
    policyWarnings.length > 0 ||
    code === "KNOWLEDGE_BASE_LANGUAGE_WARNING" ||
    (languageScan && languageScan.ok === false);

  const combinedWarnings = [
    ...driftWarnings,
    ...policyWarnings.filter((w) => !driftWarnings.includes(w)),
  ];

  /** @type {{ id: string, label: string, status: string }[]} */
  const checks = CHECK_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    status: statusForCheck(
      def.id,
      failedCheck,
      hasDriftWarnings,
      Boolean(hasPolicyLanguageWarnings),
    ),
  }));

  const valid =
    !failedCheck && !hasDriftWarnings && !hasPolicyLanguageWarnings;

  /** @type {{ check: string, code: string, message: string }[]} */
  const errors = [];
  if (failedCheck) {
    errors.push({
      check: failedCheck,
      code,
      message: String(enriched.message || enriched.title || code),
    });
  }

  const policyLangFlag = Boolean(hasPolicyLanguageWarnings);

  const gitOk =
    statusForCheck("git", failedCheck, hasDriftWarnings, policyLangFlag) === "ok";
  const seedOk =
    statusForCheck("seed", failedCheck, hasDriftWarnings, policyLangFlag) === "ok";
  const versionOk =
    statusForCheck("version", failedCheck, hasDriftWarnings, policyLangFlag) === "ok";
  const structureOk =
    statusForCheck("structure", failedCheck, hasDriftWarnings, policyLangFlag) === "ok";
  const driftOk =
    statusForCheck("drift", failedCheck, hasDriftWarnings, policyLangFlag) === "ok" &&
    !hasDriftWarnings;
  const policyOk =
    statusForCheck("policy", failedCheck, hasDriftWarnings, policyLangFlag) === "ok" &&
    !hasPolicyLanguageWarnings;

  const detectedSpecVersion =
    enriched.specVersion != null && String(enriched.specVersion).trim()
      ? String(enriched.specVersion).trim()
      : enriched.detectedSpecVersion != null &&
          String(enriched.detectedSpecVersion).trim()
        ? String(enriched.detectedSpecVersion).trim()
        : null;

  const supportedVersions = Array.isArray(enriched.supportedVersions)
    ? enriched.supportedVersions.map((v) => String(v)).filter(Boolean)
    : [...SUPPORTED_SPEC_VERSIONS];

  /** @type {Record<string, unknown>} */
  const git = {
    ok: gitOk,
    ...(code && !gitOk ? { code } : {}),
    ...(enriched.docsIaPath || details.docsIaPath
      ? { docsIaPath: String(enriched.docsIaPath || details.docsIaPath) }
      : {}),
    ...(details.relativePath ? { relativePath: String(details.relativePath) } : {}),
    ...(enriched.wrongFolder ? { wrongFolder: String(enriched.wrongFolder) } : {}),
    ...(details.ignoredFiles
      ? { ignoredFiles: details.ignoredFiles }
      : {}),
    ...(details.addableFiles ? { addableFiles: details.addableFiles } : {}),
  };

  /** @type {Record<string, unknown>} */
  const seed = {
    ok: seedOk,
    ...(enriched.missingFiles?.length
      ? { missingFiles: enriched.missingFiles }
      : {}),
    ...(enriched.requiredFiles?.length
      ? { requiredFiles: enriched.requiredFiles }
      : {}),
    ...(enriched.existingFiles?.length
      ? { existingFiles: enriched.existingFiles }
      : {}),
  };

  const versionFromDetails =
    details.versionValidation &&
    typeof details.versionValidation === "object"
      ? /** @type {Record<string, unknown>} */ (details.versionValidation)
      : null;

  /** @type {Record<string, unknown>} */
  const version = {
    ok: versionOk,
    ...(detectedSpecVersion || versionFromDetails?.detectedSpecVersion
      ? {
          detectedSpecVersion:
            detectedSpecVersion ||
            String(versionFromDetails?.detectedSpecVersion || ""),
        }
      : {}),
    supportedVersions,
    ...(enriched.indexPath || versionFromDetails?.indexPath
      ? { indexPath: String(enriched.indexPath || versionFromDetails?.indexPath) }
      : { indexPath: "docs/.IA/index.md" }),
    ...(code && !versionOk ? { code } : {}),
  };

  /** @type {Record<string, unknown>} */
  const structure = {
    ok: structureOk,
    ...(enriched.missingDirectories?.length
      ? { missingDirectories: enriched.missingDirectories }
      : {}),
    ...(enriched.missingIndexFiles?.length
      ? { missingIndexFiles: enriched.missingIndexFiles }
      : {}),
    ...(enriched.invalidBootstrapFiles?.length
      ? { invalidBootstrapFiles: enriched.invalidBootstrapFiles }
      : {}),
    ...(enriched.allowedBootstrapFiles?.length
      ? { allowedBootstrapFiles: enriched.allowedBootstrapFiles }
      : {}),
  };

  /** @type {Record<string, unknown>} */
  const drift = {
    ok: driftOk,
    driftValid: driftOk,
    ...(enriched.criticalDrift?.length
      ? { criticalDrift: enriched.criticalDrift }
      : {}),
    ...(enriched.duplicatedBootstrapPrompts?.length
      ? { duplicatedBootstrapPrompts: enriched.duplicatedBootstrapPrompts }
      : {}),
    ...(enriched.legacyIaPath ? { legacyIaPath: enriched.legacyIaPath } : {}),
    ...(enriched.unknownFolders?.length
      ? { unknownFolders: enriched.unknownFolders }
      : {}),
    ...(enriched.unexpectedRootFiles?.length
      ? { unexpectedRootFiles: enriched.unexpectedRootFiles }
      : {}),
  };

  const matchedFiles = Array.isArray(enriched.matchedFiles)
    ? enriched.matchedFiles.map((f) => String(f)).filter(Boolean)
    : secretScan && Array.isArray(secretScan.matchedFiles)
      ? secretScan.matchedFiles.map((f) => String(f)).filter(Boolean)
      : [];

  const ruleIds = Array.isArray(enriched.ruleIds)
    ? enriched.ruleIds.map((f) => String(f)).filter(Boolean)
    : secretScan && Array.isArray(secretScan.ruleIds)
      ? secretScan.ruleIds.map((f) => String(f)).filter(Boolean)
      : [];

  const redactedSamples = Array.isArray(enriched.redactedSamples)
    ? enriched.redactedSamples.map((f) => String(f)).filter(Boolean)
    : secretScan && Array.isArray(secretScan.redactedSamples)
      ? secretScan.redactedSamples.map((f) => String(f)).filter(Boolean)
      : [];

  const suspectedFiles =
    languageScan && Array.isArray(languageScan.suspectedFiles)
      ? languageScan.suspectedFiles.map((f) => String(f)).filter(Boolean)
      : [];

  /** @type {Record<string, unknown>} */
  const policy = {
    ok: policyOk,
    ...(secretScan ? { secretScan } : {}),
    ...(languageScan ? { languageScan } : {}),
    ...(matchedFiles.length ? { matchedFiles } : {}),
    ...(ruleIds.length ? { ruleIds } : {}),
    ...(redactedSamples.length ? { redactedSamples } : {}),
    ...(suspectedFiles.length ? { suspectedFiles } : {}),
    ...(languageScan?.confidence != null ? { confidence: languageScan.confidence } : {}),
    ...(languageScan?.sampleReason
      ? { sampleReason: String(languageScan.sampleReason) }
      : {}),
    ...(code && !policyOk && failedCheck === "policy" ? { code } : {}),
  };

  return {
    valid,
    specVersion: detectedSpecVersion || (valid ? supportedVersions[0] : null),
    supportedVersions,
    checks,
    errors,
    warnings: combinedWarnings,
    git,
    seed,
    version,
    structure,
    drift,
    policy,
  };
}

/**
 * Resumo curto para listagens.
 *
 * @param {Record<string, unknown>} enriched
 * @param {Record<string, unknown>|null|undefined} iaValidation
 * @returns {string}
 */
function buildDiagnosticSummary(enriched, iaValidation) {
  if (iaValidation && Array.isArray(iaValidation.checks)) {
    const failed = /** @type {{ id: string, status: string }[]} */ (
      iaValidation.checks
    ).filter((c) => c.status === "fail");
    if (failed.length) {
      return `Falha em: ${failed.map((c) => c.id).join(", ")}`;
    }
    if (Array.isArray(iaValidation.warnings) && iaValidation.warnings.length) {
      const policyWarn = /** @type {{ id: string, status: string }[]} */ (
        iaValidation.checks
      ).some((c) => c.id === "policy" && c.status === "warn");
      return policyWarn
        ? `Avisos de policy (${iaValidation.warnings.length})`
        : `Avisos de drift (${iaValidation.warnings.length})`;
    }
  }
  return String(enriched.message || enriched.title || enriched.code || "");
}

/**
 * Evento compacto para API / observabilidade.
 *
 * @param {Record<string, unknown>} enriched
 * @returns {Record<string, unknown>}
 */
/**
 * Agrupa campos de diagnóstico por check (payload mais legível na UI).
 *
 * @param {Record<string, unknown>} enriched
 * @param {Record<string, unknown>|null|undefined} iaValidation
 * @returns {Record<string, unknown>|null}
 */
function buildGroupedDiagnostics(enriched, iaValidation) {
  if (!iaValidation || typeof iaValidation !== "object") return null;
  const ia = /** @type {Record<string, unknown>} */ (iaValidation);
  return {
    failedChecks: Array.isArray(ia.checks)
      ? ia.checks.filter((c) => /** @type {{ status?: string }} */ (c).status === "fail")
      : [],
    warnChecks: Array.isArray(ia.checks)
      ? ia.checks.filter((c) => /** @type {{ status?: string }} */ (c).status === "warn")
      : [],
    git: ia.git ?? null,
    seed: ia.seed ?? null,
    version: ia.version ?? null,
    structure: ia.structure ?? null,
    drift: ia.drift ?? null,
    policy: ia.policy ?? null,
    validationSnapshot: enriched.validationSnapshot ?? null,
  };
}

function compactDiagnosticEvent(enriched) {
  const iaValidation =
    enriched.iaValidation && typeof enriched.iaValidation === "object"
      ? enriched.iaValidation
      : buildIaValidation(enriched);

  const groupedDiagnostics = buildGroupedDiagnostics(enriched, iaValidation);

  return {
    code: enriched.code,
    phase: enriched.phase,
    title: enriched.title,
    message: enriched.message,
    description: enriched.description,
    projectId: enriched.projectId ?? null,
    projectRoot: enriched.projectRoot ?? null,
    traceId: enriched.traceId ?? null,
    timestamp: enriched.timestamp,
    suggestedActions: enriched.suggestedActions ?? [],
    summary: buildDiagnosticSummary(enriched, iaValidation),
    ...(iaValidation ? { iaValidation } : {}),
    ...(groupedDiagnostics ? { groupedDiagnostics } : {}),
    ...(enriched.validationSnapshot && typeof enriched.validationSnapshot === "object"
      ? { validationSnapshot: enriched.validationSnapshot }
      : {}),
  };
}

/**
 * Texto para clipboard com iaValidation completo.
 *
 * @param {Record<string, unknown>} enriched
 * @returns {string}
 */
function formatIaDiagnosticCopy(enriched) {
  const compact = compactDiagnosticEvent(enriched);
  const lines = [
    `code: ${compact.code}`,
    compact.phase ? `phase: ${compact.phase}` : null,
    compact.title ? `title: ${compact.title}` : null,
    `message: ${compact.message}`,
    compact.description ? `description: ${compact.description}` : null,
    compact.summary ? `summary: ${compact.summary}` : null,
    compact.projectId ? `projectId: ${compact.projectId}` : null,
    compact.projectRoot ? `projectRoot: ${compact.projectRoot}` : null,
    compact.traceId ? `traceId: ${compact.traceId}` : null,
    compact.timestamp ? `timestamp: ${compact.timestamp}` : null,
    Array.isArray(compact.suggestedActions) && compact.suggestedActions.length
      ? `suggestedActions:\n${compact.suggestedActions.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}`
      : null,
    compact.validationSnapshot
      ? `validationSnapshot:\n${JSON.stringify(compact.validationSnapshot, null, 2)}`
      : null,
    compact.iaValidation
      ? `iaValidation:\n${JSON.stringify(compact.iaValidation, null, 2)}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

module.exports = {
  CODE_TO_FAILED_CHECK,
  CHECK_DEFINITIONS,
  isIaKnowledgeCode,
  buildIaValidation,
  buildGroupedDiagnostics,
  buildDiagnosticSummary,
  compactDiagnosticEvent,
  formatIaDiagnosticCopy,
};
