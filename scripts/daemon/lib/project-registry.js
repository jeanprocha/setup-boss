"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs, getManagedProjectsRoot } = require("./daemon-paths");
const {
  isOperationalProjectRow: coreIsOperationalProjectRow,
  isUnderOsTempDir,
  pathLooksLikeTempHarness,
} = require("../../../core/filter-operational-projects");

const REGISTRY_SCHEMA = 1;

/** @typedef {{ projectId: string, projectRoot: string, displayName: string, firstSeenAt: string, lastSeenAt: string, lastJobId?: string|null, jobCounts?: Record<string, number>, metadata?: Record<string, unknown> }} ProjectRecord */

/** @typedef {{ schemaVersion: number, projects: ProjectRecord[] }} ProjectsFile */

/** @param {string} raw */
function canonicalProjectRoot(raw) {
  if (raw == null || typeof raw !== "string" || !String(raw).trim())
    return "";
  return path.normalize(path.resolve(String(raw).trim()));
}

/** Chave estável para deduplicar projectos pelo mesmo caminho (Windows: case-insensitive). */
function projectRootDedupKey(canon) {
  if (!canon) return "";
  if (process.platform === "win32") return String(canon).toLowerCase();
  return String(canon);
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

/**
 * Agrega contagens de jobs por projectRoot canónico (dedup Windows).
 * @param {Array<{ projectRoot?: string, status?: string }>} jobs
 * @returns {Map<string, { canonicalRoot: string, counts: Record<string, number> }>}
 */
function aggregateJobCountsByCanonicalRoot(jobs) {
  /** @type {Map<string, { canonicalRoot: string, counts: Record<string, number> }>} */
  const byKey = new Map();

  for (const j of jobs || []) {
    const raw = j && typeof j.projectRoot === "string" ? j.projectRoot : "";
    const canon = canonicalProjectRoot(raw);
    if (!canon) continue;

    const key = projectRootDedupKey(canon);
    let cur = byKey.get(key);
    if (!cur) cur = { canonicalRoot: canon, counts: {} };

    const st = String(j && j.status != null ? j.status : "").trim() || "unknown";
    cur.counts[st] = (cur.counts[st] || 0) + 1;
    byKey.set(key, cur);
  }

  return byKey;
}

/**
 * @deprecated Preferir aggregateJobCountsByCanonicalRoot; mantido para compat.
 * @param {Array<{ projectId?: string|null, projectRoot?: string, status?: string }>} jobs
 */
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

  for (const j of jobs || []) {
    const root = j && typeof j.projectRoot === "string" ? j.projectRoot : "";
    let pid = j && j.projectId != null && String(j.projectId).trim() ? String(j.projectId).trim() : "";
    if (!pid && root) pid = deriveProjectId(root);
    bump(pid, root, j && j.status);
  }

  return byId;
}

function demoProjectsEnabled() {
  return String(process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS || "").trim() === "1";
}

/**
 * @param {object} row
 * @returns {boolean}
 */
function isDemoProjectRow(row) {
  return !coreIsOperationalProjectRow(row, {
    demoProjectsEnabled: demoProjectsEnabled(),
  });
}

/** @param {string} canon @returns {boolean} */
function isSbTestHarnessRoot(canon) {
  return pathLooksLikeTempHarness(canon);
}

/**
 * Projectos Git clonados em `~/setup-boss-projects` (ou `SETUP_BOSS_PROJECTS_DIR`).
 * @returns {ProjectRecord[]}
 */
function discoverManagedProjectRows() {
  let managedRoot = "";
  try {
    managedRoot = getManagedProjectsRoot();
  } catch (_) {
    return [];
  }
  const rootCanon = canonicalProjectRoot(managedRoot);
  if (!rootCanon || !isExistingDirectory(rootCanon)) return [];

  /** @type {ProjectRecord[]} */
  const rows = [];
  let names = [];
  try {
    names = fs.readdirSync(rootCanon);
  } catch (_) {
    return [];
  }

  for (const name of names) {
    if (!name || name === "." || name === "..") continue;
    if (name.startsWith(".")) continue;
    const canon = canonicalProjectRoot(path.join(rootCanon, name));
    if (!canon || !isExistingDirectory(canon)) continue;
    const synthetic = {
      projectId: deriveProjectId(canon),
      projectRoot: canon,
      displayName: name,
      firstSeenAt: "",
      lastSeenAt: "",
      lastJobId: null,
      jobCounts: {},
      metadata: { source: { mode: "managed-git" } },
    };
    if (isDemoProjectRow(synthetic)) continue;
    rows.push(synthetic);
  }
  return rows;
}

/**
 * @param {ProjectRecord} a
 * @param {ProjectRecord} b
 * @returns {ProjectRecord}
 */
function pickPreferredRegistryRow(a, b) {
  const ba = path.basename(String(a.projectRoot || ""));
  const bb = path.basename(String(b.projectRoot || ""));
  const aCustom = Boolean(a.displayName && String(a.displayName).trim() && String(a.displayName).trim() !== ba);
  const bCustom = Boolean(b.displayName && String(b.displayName).trim() && String(b.displayName).trim() !== bb);
  if (aCustom && !bCustom) return a;
  if (!aCustom && bCustom) return b;
  const ta = Date.parse(String(a.lastSeenAt || "")) || 0;
  const tb = Date.parse(String(b.lastSeenAt || "")) || 0;
  return ta >= tb ? a : b;
}

/**
 * @param {Record<string, number>} a
 * @param {Record<string, number>|undefined} b
 */
function mergeJobCountMaps(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = (out[k] || 0) + (typeof v === "number" ? v : 0);
  }
  return out;
}

/**
 * @param {string} absPath
 * @returns {boolean}
 */
function isExistingDirectory(absPath) {
  try {
    const st = fs.statSync(absPath);
    return st.isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * Lista pública de projectos: registo + fila, deduplicada por projectRoot canónico,
 * sem paths só-fila inexistentes, com filtro demo/fixture por omissão.
 *
 * @param {Array<object>} jobsNormalized
 * @returns {{
 *   projects: ProjectRecord[],
 *   diagnostics: Record<string, unknown>
 * }}
 */
function computePublicProjectsList(jobsNormalized) {
  reconcileProjectsRegistry({ persist: true });
  const jobs = Array.isArray(jobsNormalized) ? jobsNormalized : [];
  const file = loadProjectsUnsafe();
  const aggByRoot = aggregateJobCountsByCanonicalRoot(jobs);

  let registryRowsRead = 0;
  let registryRowsSkippedInvalidRoot = 0;
  let registryRowsSkippedMissingPath = 0;
  let registryRowsSkippedDemo = 0;
  /** @type {Map<string, ProjectRecord>} */
  const registryByKey = new Map();

  for (const row of file.projects) {
    if (!row || !row.projectId) continue;
    registryRowsRead += 1;
    const canon = canonicalProjectRoot(row.projectRoot);
    if (!canon) {
      registryRowsSkippedInvalidRoot += 1;
      continue;
    }
    if (!isExistingDirectory(canon)) {
      registryRowsSkippedMissingPath += 1;
      continue;
    }
    const normalized = {
      ...row,
      projectRoot: canon,
      projectId: deriveProjectId(canon),
    };
    if (isDemoProjectRow(normalized)) {
      registryRowsSkippedDemo += 1;
      continue;
    }
    const key = projectRootDedupKey(canon);
    const existing = registryByKey.get(key);
    registryByKey.set(
      key,
      existing ? pickPreferredRegistryRow(existing, normalized) : normalized,
    );
  }

  const registryUniqueRoots = registryByKey.size;
  const registryDuplicatesMerged = Math.max(0, registryRowsRead - registryRowsSkippedInvalidRoot - registryUniqueRoots);

  /** @type {Map<string, ProjectRecord>} */
  const combined = new Map();

  for (const [key, regRow] of registryByKey) {
    const aggRow = aggByRoot.get(key);
    let jobCounts = { ...(regRow.jobCounts && typeof regRow.jobCounts === "object" ? regRow.jobCounts : {}) };
    if (aggRow) jobCounts = mergeJobCountMaps(jobCounts, aggRow.counts);

    combined.set(key, {
      ...regRow,
      projectRoot: regRow.projectRoot,
      projectId: deriveProjectId(regRow.projectRoot),
      displayName:
        regRow.displayName != null && String(regRow.displayName).trim()
          ? String(regRow.displayName).trim()
          : path.basename(regRow.projectRoot),
      jobCounts,
    });
  }

  let queueOnlyCandidates = 0;
  let queueOnlyAdded = 0;
  let removedStaleQueuePath = 0;
  let removedQueueOnlyAsDemo = 0;

  for (const [key, aggRow] of aggByRoot) {
    if (combined.has(key)) continue;
    queueOnlyCandidates += 1;
    const canon = aggRow.canonicalRoot;
    const synthetic = {
      projectId: deriveProjectId(canon),
      projectRoot: canon,
      displayName: path.basename(canon),
      firstSeenAt: "",
      lastSeenAt: "",
      lastJobId: null,
      jobCounts: { ...aggRow.counts },
      metadata: {},
    };
    if (isDemoProjectRow(synthetic)) {
      removedQueueOnlyAsDemo += 1;
      continue;
    }
    if (!isExistingDirectory(canon)) {
      removedStaleQueuePath += 1;
      continue;
    }
    combined.set(key, synthetic);
    queueOnlyAdded += 1;
  }

  let managedRowsAdded = 0;
  for (const managed of discoverManagedProjectRows()) {
    const key = projectRootDedupKey(managed.projectRoot);
    if (combined.has(key)) {
      const existing = combined.get(key);
      combined.set(
        key,
        existing
          ? pickPreferredRegistryRow(existing, managed)
          : managed,
      );
      continue;
    }
    combined.set(key, managed);
    managedRowsAdded += 1;
  }

  const preDemo = [...combined.values()].map((r) => ({
    ...r,
    jobCounts: r.jobCounts && typeof r.jobCounts === "object" ? { ...r.jobCounts } : {},
  }));

  let removedAsDemo = 0;
  const afterDemo = demoProjectsEnabled()
    ? preDemo
    : preDemo.filter((r) => {
        const drop = isDemoProjectRow(r);
        if (drop) removedAsDemo += 1;
        return !drop;
      });

  afterDemo.sort((a, b) => String(a.projectRoot).localeCompare(String(b.projectRoot)));

  const diagnostics = {
    registryRowsRead,
    registryRowsSkippedInvalidRoot,
    registryRowsSkippedMissingPath,
    registryRowsSkippedDemo,
    registryUniqueRoots,
    registryDuplicatesMerged,
    queueDistinctRootsInJobs: aggByRoot.size,
    queueOnlyCandidates,
    queueOnlyRowsAdded: queueOnlyAdded,
    managedRowsAdded,
    removedStaleQueuePath,
    removedQueueOnlyAsDemo,
    removedAsDemoPostMerge: removedAsDemo,
    demoMode: demoProjectsEnabled(),
    finalCount: afterDemo.length,
    finalProjects: afterDemo.map((r) => ({
      projectId: r.projectId,
      projectRoot: r.projectRoot,
      displayName: r.displayName,
    })),
  };

  return { projects: afterDemo, diagnostics };
}

/**
 * Lista para API/CLI (com filtros e deduplicação).
 * @param {Array<object>} jobsNormalized
 */
function buildProjectsOverview(jobsNormalized) {
  return computePublicProjectsList(jobsNormalized).projects;
}

/**
 * Merge por projectId (legado): pode duplicar o mesmo disco com ids distintos.
 * Preferir `computePublicProjectsList` / `buildProjectsOverview`.
 * @param {Array<object>} jobsNormalized
 */
function mergeProjectsOverviewFromJobs(jobsNormalized) {
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
  if (!projectRoot) return;

  const projectId = deriveProjectId(projectRoot);
  const rootKey = projectRootDedupKey(projectRoot);

  const now = new Date().toISOString();
  const payload = loadProjectsUnsafe();
  const disp =
    p.displayName != null && String(p.displayName).trim()
      ? String(p.displayName).trim()
      : path.basename(projectRoot);

  if (
    !coreIsOperationalProjectRow(
      {
        projectId,
        projectRoot,
        displayName: disp,
        metadata: p.metadata,
      },
      { demoProjectsEnabled: demoProjectsEnabled() },
    )
  ) {
    return;
  }

  let found = false;
  const next = payload.projects.map((row) => {
    if (!row) return row;
    const rowCanon = canonicalProjectRoot(row.projectRoot);
    const sameRoot =
      rowCanon && projectRootDedupKey(rowCanon) === rootKey;
    const sameLegacyId =
      p.projectId != null &&
      String(p.projectId).trim() &&
      row.projectId === String(p.projectId).trim();
    if (!sameRoot && !sameLegacyId) return row;

    found = true;
    return {
      ...row,
      projectId,
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
      projectId,
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

/** Normaliza ids públicos `proj_<8 hex>`. */
function normalizePublicProjectId(projectId) {
  const raw = projectId != null ? String(projectId).trim() : "";
  if (!raw) return "";
  if (!/^proj_/i.test(raw)) return raw;
  const suf = raw.replace(/^proj_/i, "").toLowerCase().slice(0, 8);
  return `proj_${suf}`;
}

/**
 * Linha de registo com projectRoot canónico e projectId alinhado ao path.
 * @param {ProjectRecord} row
 * @returns {ProjectRecord|null}
 */
function normalizeRegistryRow(row) {
  if (!row) return null;
  const canon = canonicalProjectRoot(row.projectRoot);
  if (!canon || !isExistingDirectory(canon)) return null;
  const derivedId = deriveProjectId(canon);
  return {
    ...row,
    projectRoot: canon,
    projectId: derivedId,
    displayName:
      row.displayName != null && String(row.displayName).trim()
        ? String(row.displayName).trim()
        : path.basename(canon),
  };
}

/**
 * Alinha `projectId` gravado com `deriveProjectId(projectRoot)`; deduplica por path.
 * @param {{ persist?: boolean }} [opts]
 * @returns {{ dirty: boolean, projectCount: number }}
 */
function reconcileProjectsRegistry(opts = {}) {
  const persist = opts.persist !== false;
  const payload = loadProjectsUnsafe();
  /** @type {Map<string, ProjectRecord>} */
  const byRootKey = new Map();
  let dirty = false;

  /** @type {ProjectRecord[]} */
  const invalidRows = [];

  for (const row of payload.projects) {
    if (!row) continue;
    const normalized = normalizeRegistryRow(row);
    if (!normalized) {
      invalidRows.push(row);
      continue;
    }
    const key = projectRootDedupKey(normalized.projectRoot);
    const existing = byRootKey.get(key);
    const merged = existing
      ? pickPreferredRegistryRow(existing, normalized)
      : normalized;
    if (
      row.projectId !== merged.projectId ||
      canonicalProjectRoot(row.projectRoot) !== merged.projectRoot
    ) {
      dirty = true;
    }
    if (existing && existing.projectId !== merged.projectId) dirty = true;
    byRootKey.set(key, merged);
  }

  const next = [...byRootKey.values(), ...invalidRows];
  if (next.length !== payload.projects.length) dirty = true;

  if (dirty && persist) {
    payload.projects = next;
    try {
      saveProjects(payload);
    } catch (_) {
      /* não bloquear listagem */
    }
  } else if (dirty) {
    payload.projects = next;
  }

  return { dirty, projectCount: next.length };
}

/**
 * @typedef {"exact_id"|"derived_id"|"root"|"public_list"|"managed"} ProjectResolveMatch
 */

/**
 * Resolve projecto para o mesmo contrato que GET /projects (sem match por displayName).
 * @param {string} selector
 * @param {{ repoRoot?: string, jobs?: Array<object>|null }} [opts]
 * @returns {{ record: ProjectRecord|null, projectRoot: string|null, match: ProjectResolveMatch|null }}
 */
function resolveProjectRecord(selector, opts = {}) {
  const sel = normalizePublicProjectId(selector);
  if (!sel) return { record: null, projectRoot: null, match: null };

  reconcileProjectsRegistry({ persist: true });

  const file = loadProjectsUnsafe();

  const exact = file.projects.find((x) => x && x.projectId === sel);
  if (exact) {
    const normalized = normalizeRegistryRow(exact);
    if (normalized) {
      return {
        record: normalized,
        projectRoot: normalized.projectRoot,
        match: "exact_id",
      };
    }
  }

  for (const row of file.projects) {
    if (!row) continue;
    const normalized = normalizeRegistryRow(row);
    if (
      normalized &&
      (normalized.projectId === sel ||
        (row.projectId === sel && deriveProjectId(normalized.projectRoot) === normalized.projectId))
    ) {
      return {
        record: normalized,
        projectRoot: normalized.projectRoot,
        match: normalized.projectId === sel ? "derived_id" : "exact_id",
      };
    }
  }

  const selResolved = resolveProjectSelector(sel, opts.repoRoot || getDaemonDirs().repoRoot);
  if (selResolved.projectRootCanonical) {
    const canon = selResolved.projectRootCanonical;
    const key = projectRootDedupKey(canon);
    for (const row of file.projects) {
      const normalized = normalizeRegistryRow(row);
      if (normalized && projectRootDedupKey(normalized.projectRoot) === key) {
        return {
          record: normalized,
          projectRoot: normalized.projectRoot,
          match: "root",
        };
      }
    }
    if (isExistingDirectory(canon)) {
      return {
        record: {
          projectId: deriveProjectId(canon),
          projectRoot: canon,
          displayName: path.basename(canon),
          firstSeenAt: "",
          lastSeenAt: "",
          lastJobId: null,
          jobCounts: {},
          metadata: {},
        },
        projectRoot: canon,
        match: "root",
      };
    }
  }

  for (const row of discoverManagedProjectRows()) {
    if (row.projectId === sel && isExistingDirectory(row.projectRoot)) {
      return {
        record: row,
        projectRoot: row.projectRoot,
        match: "managed",
      };
    }
  }

  const jobs = Array.isArray(opts.jobs) ? opts.jobs : null;
  if (jobs) {
    const { projects } = computePublicProjectsList(jobs);
    const hit = projects.find((p) => p && p.projectId === sel);
    if (hit && isExistingDirectory(hit.projectRoot)) {
      return {
        record: hit,
        projectRoot: hit.projectRoot,
        match: "public_list",
      };
    }
  }

  return { record: null, projectRoot: null, match: null };
}

/** @param {string} projectId @param {{ repoRoot?: string, jobs?: Array<object>|null }} [opts] */
function findProjectRecord(projectId, opts) {
  return resolveProjectRecord(projectId, opts).record;
}

/**
 * Remove uma entrada do ficheiro projects.json (não remove jobs da fila).
 * @param {string} projectId
 * @returns {boolean} true se havia registo e foi gravado
 */
function removeProjectRecordById(projectId) {
  const pid = projectId != null ? String(projectId).trim() : "";
  if (!pid) return false;
  const payload = loadProjectsUnsafe();
  const before = payload.projects.length;
  payload.projects = payload.projects.filter((row) => row && row.projectId !== pid);
  if (payload.projects.length === before) return false;
  try {
    saveProjects(payload);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  REGISTRY_SCHEMA,
  canonicalProjectRoot,
  projectRootDedupKey,
  deriveProjectId,
  resolveProjectSelector,
  loadProjectsUnsafe,
  saveProjects,
  upsertProjectFromUsage,
  mergeProjectsOverviewFromJobs,
  computePublicProjectsList,
  aggregateJobCountsByCanonicalRoot,
  aggregateJobCountsByProject,
  isDemoProjectRow,
  isUnderOsTempDir,
  isSbTestHarnessRoot,
  discoverManagedProjectRows,
  demoProjectsEnabled,
  buildProjectsOverview,
  normalizePublicProjectId,
  normalizeRegistryRow,
  reconcileProjectsRegistry,
  resolveProjectRecord,
  findProjectRecord,
  removeProjectRecordById,
};
