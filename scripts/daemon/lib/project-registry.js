"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs } = require("./daemon-paths");

const REGISTRY_SCHEMA = 1;

/** @typedef {{ projectId: string, projectRoot: string, displayName: string, firstSeenAt: string, lastSeenAt: string, lastJobId?: string|null, jobCounts?: Record<string, number>, metadata?: Record<string, unknown> }} ProjectRecord */

/** @typedef {{ schemaVersion: number, projects: ProjectRecord[] }} ProjectsFile */

/** @param {string} raw */
function canonicalProjectRoot(raw) {
  if (raw == null || typeof raw !== "string" || !String(raw).trim())
    return "";
  return path.normalize(path.resolve(String(raw).trim()));
}

/** Hash estável do caminho canónico (não usar só basename). */
function deriveProjectId(projectRootCanonical) {
  const n = canonicalProjectRoot(projectRootCanonical);
  const h = crypto.createHash("sha256").update(n, "utf8").digest("hex").slice(0, 8);
  return `proj_${h}`;
}

/** @returns {ProjectsFile} */
function defaultProjectsPayload() {
  return { schemaVersion: REGISTRY_SCHEMA, projects: [] };
}

function atomicWriteJson(absPath, data) {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${absPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, absPath);
}

/** @returns {ProjectsFile} */
function loadProjectsUnsafe() {
  const { projectsPath } = getDaemonDirs();
  if (!fs.existsSync(projectsPath)) return defaultProjectsPayload();
  try {
    const parsed = JSON.parse(fs.readFileSync(projectsPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.projects))
      return defaultProjectsPayload();
    parsed.schemaVersion = REGISTRY_SCHEMA;
    return /** @type {ProjectsFile} */ (parsed);
  } catch (_) {
    return defaultProjectsPayload();
  }
}

/** @param {ProjectsFile} data */
function saveProjects(data) {
  atomicWriteJson(getDaemonDirs().projectsPath, data);
}

/**
 * @param {string} selector
 * @param {string} setupBossRepoRoot - raiz do repo Setup-Boss (resolve paths relativos à CLI)
 */
function resolveProjectSelector(selector, setupBossRepoRoot) {
  const sel = selector != null ? String(selector).trim() : "";
  if (!sel)
    return { projectId: null, projectRootCanonical: null, error: "empty_selector" };

  if (/^proj_[a-f0-9]+$/i.test(sel)) {
    const suffix = String(sel).replace(/^proj_/i, "").toLowerCase().slice(0, 8);

    const idNorm = `proj_${suffix}`;

    return { projectId: idNorm, projectRootCanonical: null, error: null };
  }

  const base = setupBossRepoRoot && String(setupBossRepoRoot).trim()
    ? path.resolve(String(setupBossRepoRoot).trim())
    : getDaemonDirs().repoRoot;

  const abs = path.isAbsolute(sel) ? path.normalize(sel) : path.normalize(path.resolve(base, sel));
  const projectRootCanonical = canonicalProjectRoot(abs);
  const projectId = deriveProjectId(projectRootCanonical);
  return { projectId, projectRootCanonical, error: null };
}

/** @param {Array<{ projectId?: string|null, projectRoot?: string, status?: string }>} jobs */
function aggregateJobCountsByProject(jobs) {
  /** @type {Map<string, { projectRoot: string, counts: Record<string, number> }>} */
  const byId = new Map();

  const bump = (pid, root, status) => {
    const st = String(status || "").trim() || "unknown";
    const canon = canonicalProjectRoot(root);
    if (!pid || !canon) return;

    let row = byId.get(pid);
    if (!row) {
      row = { projectRoot: canon, counts: {} };
      byId.set(pid, row);
    }

    row.counts[st] = (row.counts[st] || 0) + 1;
  };

  for (const j of jobs) {
    const root = j && typeof j.projectRoot === "string" ? j.projectRoot : "";
    let pid = j && j.projectId != null && String(j.projectId).trim() ? String(j.projectId).trim() : "";
    if (!pid && root) pid = deriveProjectId(root);
    bump(pid, root, j && j.status);
  }

  return byId;
}

/**
 * @param {{
 *   projectId: string,
 *   projectRoot: string,
 *   lastJobId?: string|null,
 *   displayName?: string|null,
 *   metadata?: Record<string, unknown>|null
 * }} p
 */
function upsertProjectFromUsage(p) {
  const projectRoot = canonicalProjectRoot(p.projectRoot);
  if (!projectRoot || !p.projectId) return;

  const now = new Date().toISOString();
  const payload = loadProjectsUnsafe();
  const disp =
    p.displayName != null && String(p.displayName).trim()
      ? String(p.displayName).trim()
      : path.basename(projectRoot);

  let found = false;
  const next = payload.projects.map((row) => {
    if (!row || row.projectId !== p.projectId) return row;

    found = true;
    return {
      ...row,
      projectRoot,
      displayName: disp,
      lastSeenAt: now,
      lastJobId: p.lastJobId != null ? String(p.lastJobId) : row.lastJobId ?? null,
      firstSeenAt: typeof row.firstSeenAt === "string" ? row.firstSeenAt : now,
      metadata:
        p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
          ? { ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}), ...p.metadata }
          : row.metadata && typeof row.metadata === "object"
            ? row.metadata
            : {},
    };
  });

  if (!found) {
    next.push({
      projectId: p.projectId,
      projectRoot,
      displayName: disp,
      firstSeenAt: now,
      lastSeenAt: now,
      lastJobId: p.lastJobId != null ? String(p.lastJobId) : null,
      jobCounts: {},
      metadata:
        p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? { ...p.metadata } : {},
    });
  }

  payload.projects = next;
  try {
    saveProjects(payload);
  } catch (_) {
    /* disco/perm — não bloquear fila */
  }
}

/**
 * Lista mesclada: registry + projetos só presentes na fila.
 * @param {Array<object>} jobsNormalized
 */
function buildProjectsOverview(jobsNormalized) {
  const file = loadProjectsUnsafe();
  const agg = aggregateJobCountsByProject(/** @type {any} */ (jobsNormalized));

  /** @type {Map<string, ProjectRecord>} */
  const merged = new Map();

  for (const row of file.projects) {
    if (!row || !row.projectId) continue;

    merged.set(row.projectId, { ...row });
  }

  for (const [pid, v] of agg) {
    const counts = { ...v.counts };
    const existing = merged.get(pid);
    if (existing) {
      existing.jobCounts = counts;
      if (!existing.projectRoot) existing.projectRoot = v.projectRoot;
      merged.set(pid, existing);

      continue;
    }

    merged.set(pid, {
      projectId: pid,
      projectRoot: v.projectRoot,
      displayName: path.basename(v.projectRoot),
      firstSeenAt: "",
      lastSeenAt: "",
      lastJobId: null,
      jobCounts: counts,
      metadata: {},
    });
  }

  const list = [...merged.values()].map((r) => {
    const live = agg.get(r.projectId);

    return {
      ...r,
      jobCounts: live && live.counts && typeof live.counts === "object" ? { ...live.counts } : {},
    };
  });

  list.sort((a, b) => String(a.projectRoot).localeCompare(String(b.projectRoot)));
  return list;
}

/** @param {string} projectId */
function findProjectRecord(projectId) {
  const pid = projectId != null ? String(projectId).trim() : "";
  if (!pid) return null;
  const file = loadProjectsUnsafe();
  return file.projects.find((x) => x && x.projectId === pid) || null;
}

module.exports = {
  REGISTRY_SCHEMA,
  canonicalProjectRoot,
  deriveProjectId,
  resolveProjectSelector,
  loadProjectsUnsafe,
  saveProjects,
  upsertProjectFromUsage,
  buildProjectsOverview,
  aggregateJobCountsByProject,
  findProjectRecord,
};
