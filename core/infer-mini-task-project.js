"use strict";

const path = require("path");

/**
 * @typedef {{
 *   projectId: string,
 *   displayName: string,
 *   repositoryName: string,
 *   repositorySlug: string,
 *   projectRoot: string|null,
 * }} WorkspaceProjectCatalogEntry
 */

/**
 * @param {string} haystack
 * @param {WorkspaceProjectCatalogEntry} entry
 */
function scoreProjectMatch(haystack, entry) {
  const text = String(haystack || "").toLowerCase();
  let score = 0;
  const slug = entry.repositorySlug.toLowerCase();
  const name = entry.repositoryName.toLowerCase();
  const id = entry.projectId.toLowerCase();

  if (slug && text.includes(slug)) score += 8;
  if (name && name.length > 2 && text.includes(name)) score += 6;
  if (id && text.includes(id)) score += 3;

  if (/\b(api|backend|servidor|endpoint|rest|graphql)\b/i.test(text)) {
    if (slug.includes("api") || name.includes("api") || slug.includes("back")) score += 5;
  }
  if (/\b(front|frontend|ui|ux|modal|tela|componente|react|next)\b/i.test(text)) {
    if (slug.includes("front") || name.includes("front")) score += 5;
  }

  const root = entry.projectRoot ? path.basename(entry.projectRoot).toLowerCase() : "";
  if (root && text.includes(root)) score += 7;

  return score;
}

/**
 * @param {string} filePath
 * @param {WorkspaceProjectCatalogEntry[]} catalog
 */
function inferProjectFromFilePath(filePath, catalog) {
  const norm = String(filePath || "").replace(/\\/g, "/").toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of catalog) {
    if (!entry.projectRoot) continue;
    const rootNorm = String(entry.projectRoot).replace(/\\/g, "/").toLowerCase();
    const rootBase = path.basename(rootNorm).toLowerCase();
    let score = 0;
    if (norm.includes(rootBase)) score += 5;
    if (slugifyPathHint(norm).includes(entry.repositorySlug)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

/**
 * @param {string} p
 */
function slugifyPathHint(p) {
  return String(p).replace(/[^a-z0-9]+/g, "-");
}

/**
 * @param {{
 *   title?: string,
 *   goal?: string,
 *   body?: string,
 *   files?: string[],
 *   domains?: string[],
 * }} task
 * @param {WorkspaceProjectCatalogEntry[]} catalog
 * @param {string} [fallbackProjectId]
 */
function inferProjectForTask(task, catalog, fallbackProjectId) {
  if (!catalog.length) return null;
  const blob = [
    task.title,
    task.goal,
    task.body,
    ...(task.domains || []),
    ...(task.files || []).slice(0, 8),
  ]
    .filter(Boolean)
    .join(" ");

  /** @type {Map<string, number>} */
  const scores = new Map();
  for (const entry of catalog) {
    scores.set(entry.projectId, scoreProjectMatch(blob, entry));
  }
  for (const fp of task.files || []) {
    const hit = inferProjectFromFilePath(fp, catalog);
    if (hit) {
      scores.set(hit.projectId, (scores.get(hit.projectId) || 0) + 6);
    }
  }

  let bestId = null;
  let bestScore = 0;
  for (const [pid, sc] of scores) {
    if (sc > bestScore) {
      bestScore = sc;
      bestId = pid;
    }
  }

  if (!bestId || bestScore < 2) {
    const fb =
      fallbackProjectId && catalog.some((c) => c.projectId === fallbackProjectId)
        ? fallbackProjectId
        : catalog[0].projectId;
    return catalog.find((c) => c.projectId === fb) || catalog[0];
  }
  return catalog.find((c) => c.projectId === bestId) || catalog[0];
}

/**
 * @param {string} text
 */
function looksLikeIntegrationStep(text) {
  return /\b(integrar|integração|integracao|consumir endpoint|ligar ao|wire|hook up)\b/i.test(
    String(text || ""),
  );
}

/**
 * @param {string} text
 */
function looksLikeBackendStep(text) {
  return /\b(endpoint|api|backend|servidor|export pdf|pdf server|controller|route)\b/i.test(
    String(text || ""),
  );
}

module.exports = {
  inferProjectForTask,
  inferProjectFromFilePath,
  looksLikeIntegrationStep,
  looksLikeBackendStep,
  scoreProjectMatch,
};
