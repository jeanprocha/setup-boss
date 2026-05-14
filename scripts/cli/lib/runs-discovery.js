const fs = require("fs");
const path = require("path");
const { getCliPaths } = require("./paths");
const { readJsonSafe, listDirSafe, fileExists } = require("./json-io");

/**
 * Descobre entradas de corrida a partir de `.setup-boss/runs/*.json` e,
 * opcionalmente, pastas legado em `setup-boss/outputs/*`.
 */
function loadIndexEntries(repoRoot) {
  const { RUNS_DIR } = getCliPaths(repoRoot);
  const names = listDirSafe(RUNS_DIR).filter((n) => n.endsWith(".json"));
  const entries = [];

  for (const name of names) {
    const indexPath = path.join(RUNS_DIR, name);
    const idx = readJsonSafe(indexPath, 64_000, null);
    if (!idx || typeof idx !== "object") continue;

    const runId = String(idx.run_id || path.basename(name, ".json")).trim();
    const outputDir = idx.output_dir ? String(idx.output_dir) : "";
    const projectRoot = idx.project_root ? String(idx.project_root) : "";

    let createdAt = idx.created_at ? String(idx.created_at) : null;
    try {
      if (!createdAt) {
        createdAt = fs.statSync(indexPath).mtime.toISOString();
      }
    } catch (_) {
      createdAt = createdAt || null;
    }

    entries.push({
      kind: "indexed",
      run_id: runId,
      indexPath,
      output_dir: outputDir,
      project_root: projectRoot,
      created_at: createdAt,
      index_mtime_ms: safeMtimeMs(indexPath),
    });
  }

  return entries;
}

function safeMtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch (_) {
    return 0;
  }
}

function discoverLegacyOutputDirs(repoRoot) {
  const { LEGACY_OUTPUTS_DIR } = getCliPaths(repoRoot);
  const dirs = listDirSafe(LEGACY_OUTPUTS_DIR);
  const out = [];

  for (const dir of dirs) {
    const full = path.join(LEGACY_OUTPUTS_DIR, dir);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
    } catch (_) {
      continue;
    }

    const runLog = path.join(full, "run-log.json");
    if (!fileExists(runLog)) continue;

    out.push({
      kind: "legacy",
      run_id: dir,
      indexPath: null,
      output_dir: full,
      project_root: "",
      created_at: safeIsoMtime(full),
      index_mtime_ms: safeMtimeMs(full),
    });
  }

  return out;
}

function safeIsoMtime(dir) {
  try {
    return fs.statSync(dir).mtime.toISOString();
  } catch (_) {
    return null;
  }
}

/**
 * Runs ordenadas: mais recente primeiro. Deduplica por `output_dir` (índice vence).
 */
function discoverRuns({ includeLegacy = true, repoRoot = null } = {}) {
  const indexed = loadIndexEntries(repoRoot);
  const byOut = new Map();

  for (const e of indexed) {
    if (!e.output_dir || !fileExists(e.output_dir)) continue;
    const key = path.resolve(e.output_dir);
    byOut.set(key, e);
  }

  if (includeLegacy) {
    for (const leg of discoverLegacyOutputDirs(repoRoot)) {
      const key = path.resolve(leg.output_dir);
      if (byOut.has(key)) continue;
      byOut.set(key, leg);
    }
  }

  const list = Array.from(byOut.values());
  list.sort((a, b) => {
    const ta = Date.parse(a.created_at || "") || a.index_mtime_ms || 0;
    const tb = Date.parse(b.created_at || "") || b.index_mtime_ms || 0;
    return tb - ta;
  });

  return list;
}

module.exports = {
  discoverRuns,
  loadIndexEntries,
  discoverLegacyOutputDirs,
};
