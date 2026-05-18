"use strict";

const { buildIaValidation } = require("./ia-validation-diagnostics");

/**
 * Catálogo de erros antes da criação da run (POST /runs).
 * Fase pública estável para UI/diagnóstico.
 */

/** @type {Record<string, { phase: string, suggestedActions: string[] }>} */
const CATALOG = {
  project_id_required: {
    phase: "submit",
    suggestedActions: [
      "Seleccione um projecto registado na barra lateral",
      "Actualize a lista de projectos (GET /projects)",
    ],
  },
  task_too_short: {
    phase: "submit",
    suggestedActions: [
      "Descreva a tarefa com pelo menos 12 caracteres",
      "Inclua objectivo e contexto mínimo",
    ],
  },
  project_not_found: {
    phase: "resolve_project",
    suggestedActions: [
      "Actualize a lista de projectos no Mission Control",
      "Registe o repositório (POST /projects/register)",
      "Confirme que o daemon vê o clone em setup-boss-projects",
    ],
  },
  KNOWLEDGE_BASE_MISSING: {
    phase: "validate_docs_ia",
    suggestedActions: [
      "Crie a pasta docs/.IA no projecto-alvo",
      "Execute o bootstrap de documentação (docs/.IA/system/bootstrap-create.md)",
    ],
  },
  KNOWLEDGE_BASE_UNTRACKED: {
    phase: "validate_docs_ia",
    suggestedActions: [
      "Revise o conteúdo de docs/.IA",
      "Execute git add docs/.IA",
      "Faça commit e push da base de conhecimento",
    ],
  },
  KNOWLEDGE_BASE_IGNORED: {
    phase: "validate_docs_ia",
    suggestedActions: [
      "Remova docs/.IA do .gitignore do projecto",
      "Confirme com git check-ignore -v docs/.IA/<ficheiro>",
      "Versione os ficheiros com git add e commit",
    ],
  },
  KNOWLEDGE_BASE_NOT_GIT: {
    phase: "validate_docs_ia",
    suggestedActions: [
      "Inicialize Git no projecto-alvo (git init)",
      "Crie docs/.IA e faça o primeiro commit",
    ],
  },
  KNOWLEDGE_BASE_WRONG_PATH: {
    phase: "validate_docs_ia",
    suggestedActions: [
      "Renomeie docs/IA para docs/.IA",
      "Faça commit da pasta correcta",
    ],
  },
  PROJECT_ROOT_UNRESOLVED: {
    phase: "validate_docs_ia",
    suggestedActions: [
      "Confirme que o projectRoot aponta ao clone do cliente, não ao Setup-Boss",
      "Registe novamente o projecto com o caminho correcto",
    ],
  },
  KNOWLEDGE_BASE_INVALID_SEED: {
    phase: "validate_knowledge_seed",
    suggestedActions: [
      "Crie os ficheiros obrigatórios em falta sob docs/.IA",
      "Revise docs/.IA/system/seed-rules.md (SPEC v1.0)",
      "Execute o bootstrap em docs/.IA/system/bootstrap-create.md",
    ],
  },
  KNOWLEDGE_BASE_VERSION_MISSING: {
    phase: "validate_knowledge_spec_version",
    suggestedActions: [
      "Adicione `Version: 1.0` em docs/.IA/index.md",
      "Revise docs/.IA/system/seed-rules.md para o formato da versão",
      "Faça commit de docs/.IA/index.md",
    ],
  },
  KNOWLEDGE_BASE_VERSION_INVALID: {
    phase: "validate_knowledge_spec_version",
    suggestedActions: [
      "Corrija a linha Version em docs/.IA/index.md (ex.: Version: 1.0)",
      "Use apenas números e pontos na versão (formato semver simples)",
      "Faça commit após corrigir",
    ],
  },
  KNOWLEDGE_BASE_UNSUPPORTED_VERSION: {
    phase: "validate_knowledge_spec_version",
    suggestedActions: [
      "Altere a versão em docs/.IA/index.md para uma versão suportada (1.0)",
      "Consulte a documentação do Setup-Boss sobre versões SPEC suportadas",
      "Aguarde suporte futuro se o projecto usa SPEC mais recente",
    ],
  },
  KNOWLEDGE_BASE_INVALID_STRUCTURE: {
    phase: "validate_knowledge_structure",
    suggestedActions: [
      "Crie os domínios core em falta (system, architecture, environment, standards, prompts)",
      "Adicione os ficheiros index-<folder>.md obrigatórios em cada domínio",
      "Revise docs/.IA/system/seed-rules.md para a estrutura SPEC v1.0",
    ],
  },
  KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION: {
    phase: "validate_knowledge_structure",
    suggestedActions: [
      "Remova bootstrap-discovery.md e bootstrap-create.md fora de docs/.IA/system",
      "Mantenha os prompts apenas em docs/.IA/system/",
      "Faça commit após mover ou eliminar cópias inválidas",
    ],
  },
  KNOWLEDGE_BASE_STRUCTURAL_DRIFT: {
    phase: "validate_knowledge_drift",
    suggestedActions: [
      "Remova a pasta legada `.IA/` na raiz se `docs/.IA/` já existir",
      "Elimine cópias de bootstrap fora de docs/.IA/system/",
      "Revise pastas e ficheiros soltos listados no diagnóstico",
      "Consulte docs/.IA/system/structure-rules.md (SPEC v1.0)",
    ],
  },
  KNOWLEDGE_BASE_SENSITIVE_DATA: {
    phase: "validate_knowledge_content_policy",
    suggestedActions: [
      "Remova segredos, tokens e passwords reais dos ficheiros listados",
      "Substitua credenciais por placeholders (ex.: `<REDACTED>`)",
      "Revise docs/.IA/environment/access.md e ficheiros similares",
      "Faça commit apenas após sanitizar a Knowledge Base",
    ],
  },
  KNOWLEDGE_BASE_LANGUAGE_WARNING: {
    phase: "validate_knowledge_content_policy",
    suggestedActions: [
      "A SPEC v1.0 espera documentação em inglês",
      "Traduza ou reescreva os ficheiros listados no aviso de idioma",
      "Mantenha nomes técnicos e paths em inglês quando possível",
    ],
  },
  run_create_failed: {
    phase: "submit",
    suggestedActions: [
      "Consulte Observabilidade > Logs (canal pre_run)",
      "Copie o diagnóstico e partilhe com suporte",
    ],
  },
};

/**
 * @param {string} code
 * @returns {string}
 */
function publicPhaseForCode(code) {
  const c = String(code || "").trim();
  return CATALOG[c]?.phase || "submit";
}

/**
 * @param {string} code
 * @returns {string[]}
 */
function suggestedActionsForCode(code) {
  const c = String(code || "").trim();
  return [...(CATALOG[c]?.suggestedActions || CATALOG.run_create_failed.suggestedActions)];
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {{
 *   projectId?: string|null,
 *   projectRoot?: string|null,
 *   traceId?: string|null,
 *   timestamp?: string|null,
 * }} [ctx]
 * @returns {Record<string, unknown>}
 */
function enrichPreRunError(raw, ctx = {}) {
  const err = raw && typeof raw === "object" ? { ...raw } : {};
  const code = String(err.code || "run_create_failed").trim() || "run_create_failed";
  const phase = CATALOG[code]
    ? publicPhaseForCode(code)
    : err.phase != null && String(err.phase).trim()
      ? String(err.phase).trim()
      : "submit";

  const title =
    err.title != null && String(err.title).trim()
      ? String(err.title).trim()
      : String(err.message || code);

  const message =
    err.message != null && String(err.message).trim()
      ? String(err.message).trim()
      : title;

  const description =
    err.description != null && String(err.description).trim()
      ? String(err.description).trim()
      : message;

  const suggestedActions = Array.isArray(err.suggestedActions)
    ? err.suggestedActions.map((s) => String(s)).filter(Boolean)
    : suggestedActionsForCode(code);

  const seedFromDetails =
    err.details &&
    typeof err.details === "object" &&
    !Array.isArray(err.details) &&
    /** @type {{ seedValidation?: unknown }} */ (err.details).seedValidation &&
    typeof /** @type {{ seedValidation?: Record<string, unknown> }} */ (err.details)
      .seedValidation === "object"
      ? /** @type {Record<string, unknown>} */ (
          /** @type {{ seedValidation: Record<string, unknown> }} */ (err.details)
            .seedValidation
        )
      : null;

  const missingFiles = Array.isArray(err.missingFiles)
    ? err.missingFiles.map((f) => String(f)).filter(Boolean)
    : seedFromDetails && Array.isArray(seedFromDetails.missingFiles)
      ? seedFromDetails.missingFiles.map((f) => String(f)).filter(Boolean)
      : [];

  const requiredFiles = Array.isArray(err.requiredFiles)
    ? err.requiredFiles.map((f) => String(f)).filter(Boolean)
    : seedFromDetails && Array.isArray(seedFromDetails.requiredFiles)
      ? seedFromDetails.requiredFiles.map((f) => String(f)).filter(Boolean)
      : [];

  const existingFiles = Array.isArray(err.existingFiles)
    ? err.existingFiles.map((f) => String(f)).filter(Boolean)
    : seedFromDetails && Array.isArray(seedFromDetails.existingFiles)
      ? seedFromDetails.existingFiles.map((f) => String(f)).filter(Boolean)
      : [];

  const structureFromDetails =
    err.details &&
    typeof err.details === "object" &&
    !Array.isArray(err.details) &&
    /** @type {{ structureValidation?: unknown }} */ (err.details).structureValidation &&
    typeof /** @type {{ structureValidation?: Record<string, unknown> }} */ (err.details)
      .structureValidation === "object"
      ? /** @type {Record<string, unknown>} */ (
          /** @type {{ structureValidation: Record<string, unknown> }} */ (err.details)
            .structureValidation
        )
      : null;

  const pickStringArray = (primary, fallbackKey) => {
    if (Array.isArray(primary)) {
      return primary.map((v) => String(v)).filter(Boolean);
    }
    if (
      structureFromDetails &&
      Array.isArray(structureFromDetails[fallbackKey])
    ) {
      return structureFromDetails[fallbackKey].map((v) => String(v)).filter(Boolean);
    }
    return [];
  };

  const missingDirectories = pickStringArray(err.missingDirectories, "missingDirectories");
  const missingIndexFiles = pickStringArray(err.missingIndexFiles, "missingIndexFiles");
  const requiredDirectories = pickStringArray(
    err.requiredDirectories,
    "requiredDirectories",
  );
  const requiredIndexFiles = pickStringArray(err.requiredIndexFiles, "requiredIndexFiles");
  const invalidBootstrapFiles = pickStringArray(
    err.invalidBootstrapFiles,
    "invalidBootstrapFiles",
  );
  const allowedBootstrapFiles = pickStringArray(
    err.allowedBootstrapFiles,
    "allowedBootstrapFiles",
  );

  const driftFromDetails =
    err.details &&
    typeof err.details === "object" &&
    !Array.isArray(err.details) &&
    /** @type {{ driftValidation?: unknown }} */ (err.details).driftValidation &&
    typeof /** @type {{ driftValidation?: Record<string, unknown> }} */ (err.details)
      .driftValidation === "object"
      ? /** @type {Record<string, unknown>} */ (
          /** @type {{ driftValidation: Record<string, unknown> }} */ (err.details)
            .driftValidation
        )
      : null;

  const pickDriftArray = (primary, fallbackKey) => {
    if (Array.isArray(primary)) {
      return primary.map((v) => String(v)).filter(Boolean);
    }
    if (driftFromDetails && Array.isArray(driftFromDetails[fallbackKey])) {
      return driftFromDetails[fallbackKey].map((v) => String(v)).filter(Boolean);
    }
    return [];
  };

  const criticalDrift = pickDriftArray(err.criticalDrift, "criticalDrift");
  const driftWarnings = pickDriftArray(err.warnings, "warnings");
  const unknownFolders = pickDriftArray(err.unknownFolders, "unknownFolders");
  const unexpectedRootFiles = pickDriftArray(
    err.unexpectedRootFiles,
    "unexpectedRootFiles",
  );
  const duplicatedBootstrapPrompts = pickDriftArray(
    err.duplicatedBootstrapPrompts,
    "duplicatedBootstrapPrompts",
  );
  const legacyIaPath =
    err.legacyIaPath != null && String(err.legacyIaPath).trim()
      ? String(err.legacyIaPath).trim()
      : driftFromDetails?.legacyIaPath != null &&
          String(driftFromDetails.legacyIaPath).trim()
        ? String(driftFromDetails.legacyIaPath).trim()
        : null;

  const specVersion =
    err.specVersion != null && String(err.specVersion).trim()
      ? String(err.specVersion).trim()
      : err.detectedSpecVersion != null && String(err.detectedSpecVersion).trim()
        ? String(err.detectedSpecVersion).trim()
        : null;

  const detectedSpecVersion =
    err.detectedSpecVersion != null && String(err.detectedSpecVersion).trim()
      ? String(err.detectedSpecVersion).trim()
      : specVersion;

  const supportedVersions = Array.isArray(err.supportedVersions)
    ? err.supportedVersions.map((v) => String(v)).filter(Boolean)
    : [];

  const indexPath =
    err.indexPath != null && String(err.indexPath).trim()
      ? String(err.indexPath).trim()
      : null;

  const policyFromDetails =
    err.details &&
    typeof err.details === "object" &&
    !Array.isArray(err.details) &&
    /** @type {{ policyValidation?: unknown }} */ (err.details).policyValidation &&
    typeof /** @type {{ policyValidation?: Record<string, unknown> }} */ (err.details)
      .policyValidation === "object"
      ? /** @type {Record<string, unknown>} */ (
          /** @type {{ policyValidation: Record<string, unknown> }} */ (err.details)
            .policyValidation
        )
      : null;

  const pickPolicyArray = (primary, nestedKey, nestedField) => {
    if (Array.isArray(primary)) {
      return primary.map((v) => String(v)).filter(Boolean);
    }
    const nested =
      policyFromDetails?.[nestedKey] &&
      typeof policyFromDetails[nestedKey] === "object"
        ? /** @type {Record<string, unknown>} */ (policyFromDetails[nestedKey])
        : null;
    if (nested && Array.isArray(nested[nestedField])) {
      return nested[nestedField].map((v) => String(v)).filter(Boolean);
    }
    return [];
  };

  const matchedFiles = pickPolicyArray(err.matchedFiles, "secretScan", "matchedFiles");
  const ruleIds = pickPolicyArray(err.ruleIds, "secretScan", "ruleIds");
  const redactedSamples = pickPolicyArray(
    err.redactedSamples,
    "secretScan",
    "redactedSamples",
  );

  const languageFromDetails =
    policyFromDetails?.languageScan &&
    typeof policyFromDetails.languageScan === "object"
      ? /** @type {Record<string, unknown>} */ (policyFromDetails.languageScan)
      : err.languageScan && typeof err.languageScan === "object"
        ? /** @type {Record<string, unknown>} */ (err.languageScan)
        : null;

  const suspectedFiles = pickPolicyArray(
    err.suspectedFiles,
    "languageScan",
    "suspectedFiles",
  ).length
    ? pickPolicyArray(err.suspectedFiles, "languageScan", "suspectedFiles")
    : languageFromDetails && Array.isArray(languageFromDetails.suspectedFiles)
      ? languageFromDetails.suspectedFiles.map((v) => String(v)).filter(Boolean)
      : [];

  const policyWarnings = Array.isArray(err.policyWarnings)
    ? err.policyWarnings
    : [];

  /** @type {Record<string, unknown>} */
  const details = {
    ...(err.details && typeof err.details === "object" && !Array.isArray(err.details)
      ? err.details
      : {}),
    ...(err.relativePath ? { relativePath: err.relativePath } : {}),
    ...(err.documentationHint ? { documentationHint: err.documentationHint } : {}),
    ...(err.docsIaPath ? { docsIaPath: err.docsIaPath } : {}),
    ...(err.wrongFolder ? { wrongFolder: err.wrongFolder } : {}),
    ...(err.hint ? { hint: err.hint } : {}),
    ...(err.receivedProjectId ? { receivedProjectId: err.receivedProjectId } : {}),
    ...(err.registryProjectCount != null
      ? { registryProjectCount: err.registryProjectCount }
      : {}),
    ...(err.resolveMatch ? { resolveMatch: err.resolveMatch } : {}),
  };

  const projectId =
    ctx.projectId != null && String(ctx.projectId).trim()
      ? String(ctx.projectId).trim()
      : err.projectId != null
        ? String(err.projectId)
        : null;

  const projectRoot =
    ctx.projectRoot != null && String(ctx.projectRoot).trim()
      ? String(ctx.projectRoot).trim()
      : err.projectRoot != null
        ? String(err.projectRoot)
        : null;

  const traceId =
    ctx.traceId != null && String(ctx.traceId).trim()
      ? String(ctx.traceId).trim()
      : err.traceId != null
        ? String(err.traceId)
        : null;

  const timestamp =
    ctx.timestamp != null && String(ctx.timestamp).trim()
      ? String(ctx.timestamp).trim()
      : err.timestamp != null
        ? String(err.timestamp)
        : new Date().toISOString();

  /** @type {Record<string, unknown>} */
  const base = {
    code,
    phase,
    title,
    message,
    description,
    projectId,
    projectRoot,
    details,
    ...(missingFiles.length ? { missingFiles } : {}),
    ...(requiredFiles.length ? { requiredFiles } : {}),
    ...(existingFiles.length ? { existingFiles } : {}),
    ...(missingDirectories.length ? { missingDirectories } : {}),
    ...(missingIndexFiles.length ? { missingIndexFiles } : {}),
    ...(requiredDirectories.length ? { requiredDirectories } : {}),
    ...(requiredIndexFiles.length ? { requiredIndexFiles } : {}),
    ...(invalidBootstrapFiles.length ? { invalidBootstrapFiles } : {}),
    ...(allowedBootstrapFiles.length ? { allowedBootstrapFiles } : {}),
    ...(criticalDrift.length ? { criticalDrift } : {}),
    ...(driftWarnings.length ? { warnings: driftWarnings } : {}),
    ...(unknownFolders.length ? { unknownFolders } : {}),
    ...(unexpectedRootFiles.length ? { unexpectedRootFiles } : {}),
    ...(duplicatedBootstrapPrompts.length ? { duplicatedBootstrapPrompts } : {}),
    ...(legacyIaPath ? { legacyIaPath } : {}),
    ...(specVersion ? { specVersion } : {}),
    ...(detectedSpecVersion ? { detectedSpecVersion } : {}),
    ...(supportedVersions.length ? { supportedVersions } : {}),
    ...(indexPath ? { indexPath } : {}),
    ...(matchedFiles.length ? { matchedFiles } : {}),
    ...(ruleIds.length ? { ruleIds } : {}),
    ...(redactedSamples.length ? { redactedSamples } : {}),
    ...(suspectedFiles.length ? { suspectedFiles } : {}),
    ...(policyWarnings.length ? { policyWarnings } : {}),
    ...(languageFromDetails ? { languageScan: languageFromDetails } : {}),
    suggestedActions,
    traceId,
    timestamp,
  };

  const iaValidation =
    err.iaValidation && typeof err.iaValidation === "object"
      ? err.iaValidation
      : buildIaValidation(base);

  if (iaValidation) {
    base.iaValidation = iaValidation;
  }

  return base;
}

module.exports = {
  CATALOG,
  publicPhaseForCode,
  suggestedActionsForCode,
  enrichPreRunError,
};
