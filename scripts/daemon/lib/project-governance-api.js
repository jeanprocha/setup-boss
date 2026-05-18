"use strict";

const { validateProjectKnowledgeBase } = require("../../../core/validate-project-knowledge-base");
const { enrichPreRunError } = require("../../../core/pre-run-error");
const { buildGovernanceUxPayload } = require("../../../core/ia-governance-ux");
const {
  resolveProjectRecord,
  canonicalProjectRoot,
  deriveProjectId,
  normalizePublicProjectId,
} = require("./project-registry");

const PROJECT_NOT_FOUND_ACTIONS = [
  "Atualize a lista de projetos",
  "Selecione novamente o projeto",
];

/**
 * Resolve projecto para GET /projects/:id/governance (mesma lógica que intake/listagem).
 *
 * @param {string} selector — projectId, path ou legado
 * @param {{ repoRoot: string, jobs?: Array<object>|null }} opts
 * @returns {{
 *   ok: true,
 *   projectId: string,
 *   projectRootCanonical: string,
 *   displayName: string,
 *   match: string|null,
 * } | {
 *   ok: false,
 *   status: number,
 *   error: { code: string, message: string, projectId: string|null, suggestedActions: string[] },
 * }}
 */
function resolveGovernanceProject(selector, opts = {}) {
  const raw = selector != null ? String(selector).trim() : "";
  const projectIdHint = normalizePublicProjectId(raw) || raw || null;

  const resolved = resolveProjectRecord(raw, {
    repoRoot: opts.repoRoot,
    jobs: opts.jobs ?? null,
  });

  if (!resolved.projectRoot) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Projeto não encontrado no registry atual.",
        projectId: projectIdHint,
        suggestedActions: [...PROJECT_NOT_FOUND_ACTIONS],
      },
    };
  }

  const projectRootCanonical = canonicalProjectRoot(resolved.projectRoot);
  const record = resolved.record;
  const projectId = record?.projectId || deriveProjectId(projectRootCanonical);

  return {
    ok: true,
    projectId,
    projectRootCanonical,
    displayName: record?.displayName || projectId,
    match: resolved.match,
  };
}

/**
 * Valida governança `.IA` de um projecto registado (sem criar run).
 *
 * @param {string} projectRootCanonical
 * @param {{
 *   projectId?: string|null,
 *   displayName?: string|null,
 *   setupBossRoot?: string,
 * }} [ctx]
 */
function buildProjectGovernanceReport(projectRootCanonical, ctx = {}) {
  const raw = validateProjectKnowledgeBase(projectRootCanonical, {
    setupBossRoot: ctx.setupBossRoot,
    forbidSetupBossRoot: true,
  });

  const enriched =
    raw.ok === false
      ? enrichPreRunError(raw, {
          projectId: ctx.projectId ?? null,
          projectRoot: projectRootCanonical,
        })
      : raw;

  const ux = buildGovernanceUxPayload(enriched, {
    projectId: ctx.projectId ?? null,
    projectRoot: projectRootCanonical,
    displayName: ctx.displayName ?? null,
    validatedAt: new Date().toISOString(),
  });

  return {
    validation: enriched,
    ux,
  };
}

module.exports = {
  buildProjectGovernanceReport,
  resolveGovernanceProject,
  PROJECT_NOT_FOUND_ACTIONS,
};
