const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Ficheiros .IA considerados na impressão digital (alinhado a ensure-ia.js).
 */
const IA_MARKERS = [
  "00-project-profile.md",
  "01-architecture.md",
  "02-stack.md",
  "03-coding-standards.md",
  "04-domain-context.md",
  "05-folder-map.md",
  "06-runbook.md",
  "07-decisions.md",
  "08-activity-history.md",
  "09-known-issues.md",
  "10-ai-rules.md",
];

function hashUtf8(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function statSig(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    const st = fs.lstatSync(absPath);
    if (!st.isFile()) return null;
    return `${st.mtimeMs}:${st.size}`;
  } catch (_) {
    return null;
  }
}

function digestMarkdownDir(absDir) {
  if (!fs.existsSync(absDir)) return "(missing_dir)";
  const names = fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
  const parts = [];
  for (const name of names) {
    const sig = statSig(path.join(absDir, name));
    parts.push(`${name}:${sig ?? "?"}`);
  }
  return hashUtf8(parts.join("|"));
}

function digestProjectIA(projectRoot) {
  const iaDir = path.join(projectRoot, ".IA");
  const parts = IA_MARKERS.map((f) => {
    const sig = statSig(path.join(iaDir, f));
    return `${f}:${sig ?? "-"}`;
  });
  return hashUtf8(parts.join("|"));
}

const TREE_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".venv",
  "vendor",
  "target",
  "__pycache__",
]);

function listFilesLite(projectRoot, dir, depth, maxDepth) {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];

  let out = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (TREE_IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(projectRoot, full).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        out.push(rel + "/");
        out = out.concat(
          listFilesLite(projectRoot, full, depth + 1, maxDepth),
        );
      } else {
        out.push(rel);
      }
    }
  } catch (_) {
    return out;
  }

  return out;
}

function digestFileTree(projectRoot, maxDepth = 3) {
  const rels = listFilesLite(projectRoot, projectRoot, 0, maxDepth);
  rels.sort();
  return hashUtf8(rels.join("\n"));
}

/**
 * Fingerprint conservadora para invalidação de scan em cache.
 * Não percorre conteúdo completo — usa metadados + árvore limitada.
 */
function computeScanCacheFingerprint(projectRoot, setupBossRepoRoot) {
  const rootAbs = path.resolve(projectRoot);
  const setupAbs = path.resolve(setupBossRepoRoot);

  const ia = digestProjectIA(rootAbs);
  const pkg = statSig(path.join(rootAbs, "package.json")) ?? "-";
  const tree = digestFileTree(rootAbs, 3);
  const ctxGlob = digestMarkdownDir(path.join(setupAbs, "context"));
  const docsGlob = digestMarkdownDir(path.join(setupAbs, "docs"));
  const localScan = statSig(path.join(rootAbs, ".setup-boss", "project-scan.md"));

  const fingerprint = hashUtf8(
    [ia, pkg, tree, ctxGlob, docsGlob, localScan ?? "-"].join("\n"),
  );

  return {
    fingerprint,
    components: {
      ia_digest: ia,
      package_json_sig: pkg,
      file_tree_digest: tree,
      setup_boss_context_md: ctxGlob,
      setup_boss_docs_md: docsGlob,
      project_local_scan_sig: localScan,
    },
  };
}

function resolveScanCacheFilePath(cacheDir, projectRootAbs, fingerprintHex) {
  const projKey = crypto
    .createHash("md5")
    .update(path.resolve(projectRootAbs), "utf8")
    .digest("hex");
  const fp16 = String(fingerprintHex || "").slice(0, 16);
  return path.join(cacheDir, `scan-${projKey}-${fp16}.md`);
}

module.exports = {
  computeScanCacheFingerprint,
  resolveScanCacheFilePath,
  IA_MARKERS,
};
