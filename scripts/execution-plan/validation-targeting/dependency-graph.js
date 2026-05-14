/**
 * Dependency Graph Runtime (MVP) — Fase 4.10.6
 * Grafo arquivo↔arquivo a partir de dependency-hints + heurísticas locais.
 * Parcial / best-effort: imports não resolvidos são ignorados (não abortam o pipeline).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { normalizePath } = require("../normalization/operation-normalizer");
const { stableStringify, sha256HexUtf8 } = require("../fingerprint/plan-fingerprint");

const TRY_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".json",
];

const INDEX_TRY = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"];

function posixJoinSafe(a, b) {
  const x = path.posix.join(String(a || "."), String(b || ""));
  return normalizePath(x.replace(/\\/g, "/"));
}

/**
 * @param {string} relFile posix file path
 * @returns {boolean}
 */
function isTestFilePath(relFile) {
  const p = normalizePath(relFile || "").toLowerCase();
  if (!p) return false;
  const base = path.posix.basename(p);
  if (
    /\.(test|spec)\.(tsx|ts|jsx|js|mjs|cjs)$/.test(base) ||
    /\.(test|spec)\.vue$/i.test(base)
  ) {
    return true;
  }
  if (p.includes("/__tests__/") || p.includes("/test/") || p.includes("/tests/")) {
    return /\.(tsx|ts|jsx|js|mjs|cjs|vue)$/.test(base);
  }
  return false;
}

/**
 * Heurística: caminho de teste → possível fonte (sem garantir existência).
 * @param {string} relFile
 * @returns {string|null} posix
 */
function guessSourceForTest(relFile) {
  const raw = normalizePath(relFile || "");
  if (!raw) return null;
  const dir = path.posix.dirname(raw);
  const base = path.posix.basename(raw);
  const ext = path.posix.extname(base);
  let stem = base.slice(0, -ext.length);

  const m = stem.match(/^(.+?)\.(test|spec)$/i);
  if (m) stem = m[1];

  const candidate = posixJoinSafe(dir, stem + ext);
  return candidate || null;
}

/**
 * @param {string} projectRoot
 * @param {string} relPosix normalized relative path without leading ./
 * @returns {string|null} normalized path of first existing file
 */
function resolveImportToExistingFile(projectRoot, relPosix) {
  if (!projectRoot || !relPosix) return null;
  const variants = new Set();

  variants.add(normalizePath(relPosix));
  for (const suf of TRY_EXTENSIONS) {
    if (suf) variants.add(normalizePath(relPosix + suf));
  }
  const asDirKey = normalizePath(relPosix);
  for (const idx of INDEX_TRY) {
    variants.add(posixJoinSafe(asDirKey, idx));
  }

  const ordered = [...variants].filter(Boolean).sort((a, b) => a.localeCompare(b));

  for (const rel of ordered) {
    if (!rel || rel.includes("..")) continue;
    const abs = path.join(projectRoot, rel);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return rel;
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {string} fromFile posix normalized
 * @param {string} importSpec ex: ./foo ou ../bar/baz
 * @returns {string|null} posix normalized path relative to project (sem existência)
 */
function resolveRelativeImportSpec(fromFile, importSpec) {
  const spec = String(importSpec || "").trim();
  if (!spec.startsWith(".")) return null;
  const fromDir = path.posix.dirname(normalizePath(fromFile || ""));
  const joined = path.posix.normalize(path.posix.join(fromDir || ".", spec));
  if (joined.startsWith("..")) return null;
  return normalizePath(joined);
}

function nodeIdFor(type, p) {
  const key = normalizePath(p || "");
  return `${String(type)}:${key}`;
}

/**
 * @param {{ projectRoot: string|null, targetsDoc: object, plan?: object|null }} input
 * @returns {object}
 */
function buildDependencyGraphDoc(input) {
  const projectRoot = input.projectRoot != null ? String(input.projectRoot) : null;
  const targetsDoc = input.targetsDoc && typeof input.targetsDoc === "object" ? input.targetsDoc : {};
  const plan = input.plan && typeof input.plan === "object" ? input.plan : null;

  const planId = String(targetsDoc.plan_id || (plan && plan.plan_id) || "").trim();
  const runId = String(targetsDoc.run_id || (plan && plan.run_id) || "").trim();

  /** @type {Map<string, object>} */
  const nodes = new Map();
  /** @type {Set<string>} */
  const edgeKeys = new Set();
  /** @type {object[]} */
  const edges = [];

  let unresolvedImportsSkipped = 0;

  function addNode(type, relPath) {
    const np = normalizePath(relPath || "");
    if (!np) return null;
    const nid = nodeIdFor(type, np);
    if (!nodes.has(nid)) {
      nodes.set(nid, {
        node_id: nid,
        type,
        path: np,
      });
    }
    return nid;
  }

  function addEdge(from, to, relation) {
    const f = String(from || "");
    const t = String(to || "");
    const r = String(relation || "");
    if (!f || !t || !r) return;
    const ek = `${f}\u001f${t}\u001f${r}`;
    if (edgeKeys.has(ek)) return;
    edgeKeys.add(ek);
    edges.push({ from: f, to: t, relation: r });
  }

  const rawTargets =
    targetsDoc.targets && Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];

  const filePaths = new Set();
  for (const t of rawTargets) {
    const fp = normalizePath(t && t.file != null ? String(t.file) : "");
    if (fp) filePaths.add(fp);
  }

  if (plan && Array.isArray(plan.operations)) {
    for (const op of plan.operations) {
      if (!op || typeof op !== "object") continue;
      const fp = normalizePath(op.file != null ? String(op.file) : "");
      if (fp) filePaths.add(fp);
    }
  }

  const sortedFiles = [...filePaths].sort((a, b) => a.localeCompare(b));

  for (const fp of sortedFiles) {
    const isTest = isTestFilePath(fp);
    const nType = isTest ? "test" : "file";
    addNode(nType, fp);

    const dir = path.posix.dirname(fp);
    if (dir && dir !== ".") {
      const mid = addNode("module", dir);
      addEdge(nodeIdFor(nType, fp), mid, "exports");
    }

    if (isTest) {
      const guess = guessSourceForTest(fp);
      if (guess) {
        const tgt = projectRoot ? resolveImportToExistingFile(projectRoot, guess) : guess;
        if (tgt) {
          addNode("file", tgt);
          addEdge(nodeIdFor("test", fp), nodeIdFor("file", tgt), "tests");
        }
      }
    }
  }

  for (const t of rawTargets) {
    if (!t || typeof t !== "object") continue;
    const fromFile = normalizePath(t.file != null ? String(t.file) : "");
    if (!fromFile) continue;
    const fromType = isTestFilePath(fromFile) ? "test" : "file";
    const hints = Array.isArray(t.dependency_hints) ? t.dependency_hints : [];

    for (const h of hints) {
      if (!h || typeof h !== "object") continue;
      if (String(h.kind) !== "relative_import") continue;
      const spec = String(h.detail || "").trim();
      const rough = resolveRelativeImportSpec(fromFile, spec);
      if (!rough) {
        unresolvedImportsSkipped += 1;
        continue;
      }
      const resolved =
        projectRoot != null ? resolveImportToExistingFile(projectRoot, rough) : rough;
      if (!resolved) {
        unresolvedImportsSkipped += 1;
        continue;
      }
      if (normalizePath(resolved) === fromFile) continue;

      const toType = isTestFilePath(resolved) ? "test" : "file";
      addNode(toType, resolved);
      addEdge(nodeIdFor(fromType, fromFile), nodeIdFor(toType, resolved), "imports");
    }
  }

  const nodeList = [...nodes.values()].sort((a, b) =>
    String(a.node_id).localeCompare(String(b.node_id)),
  );
  const edgeList = edges.sort((a, b) => {
    const c1 = String(a.from).localeCompare(String(b.from));
    if (c1 !== 0) return c1;
    const c2 = String(a.relation).localeCompare(String(b.relation));
    if (c2 !== 0) return c2;
    return String(a.to).localeCompare(String(b.to));
  });

  const canonicalForHash = {
    version: 1,
    nodes: nodeList.map((n) => ({ node_id: n.node_id, type: n.type, path: n.path })),
    edges: edgeList.map((e) => ({ from: e.from, to: e.to, relation: e.relation })),
  };

  const graph_content_sha256 = sha256HexUtf8(stableStringify(canonicalForHash));

  return {
    version: 1,
    nodes: nodeList,
    edges: edgeList,
    fingerprints: {
      graph_content_sha256,
    },
    metadata: {
      plan_id: planId || null,
      run_id: runId || null,
      source: "validation-targeting/dependency-graph-mvp",
      stats: {
        nodes_total: nodeList.length,
        edges_total: edgeList.length,
        unresolved_imports_skipped: unresolvedImportsSkipped,
      },
    },
  };
}

/**
 * Índices para expansão de impacto.
 * @param {object} graphDoc
 */
function buildGraphIndexes(graphDoc) {
  const forwardImports = new Map();
  const reverseImports = new Map();
  const testsByTarget = new Map();
  const testToSources = new Map();

  const edges = graphDoc && Array.isArray(graphDoc.edges) ? graphDoc.edges : [];
  for (const e of edges) {
    if (!e || typeof e !== "object") continue;
    const from = String(e.from || "");
    const to = String(e.to || "");
    const rel = String(e.relation || "");
    if (rel === "imports") {
      if (!forwardImports.has(from)) forwardImports.set(from, []);
      forwardImports.get(from).push(to);
      if (!reverseImports.has(to)) reverseImports.set(to, []);
      reverseImports.get(to).push(from);
    } else if (rel === "tests") {
      if (!testsByTarget.has(to)) testsByTarget.set(to, []);
      testsByTarget.get(to).push(from);
      if (!testToSources.has(from)) testToSources.set(from, []);
      testToSources.get(from).push(to);
    }
  }

  for (const m of [forwardImports, reverseImports, testsByTarget, testToSources]) {
    for (const list of m.values()) {
      list.sort((a, b) => a.localeCompare(b));
    }
  }

  return { forwardImports, reverseImports, testsByTarget, testToSources };
}

function pathFromNodeId(nodeId) {
  const s = String(nodeId || "");
  const i = s.indexOf(":");
  if (i <= 0) return "";
  return normalizePath(s.slice(i + 1));
}

/**
 * BFS reverso em arestas `imports` (quem importa o seed).
 * @param {object} graphDoc
 * @param {string[]} seedNodeIds
 * @param {{ maxDepth?: number, maxNodes?: number }} opts
 * @returns {{ node_ids: string[], paths: string[], truncated: boolean }}
 */
function expandImpactReverseImports(graphDoc, seedNodeIds, opts) {
  const maxDepth =
    opts && opts.maxDepth != null && Number.isFinite(Number(opts.maxDepth))
      ? Math.max(0, Math.min(32, Math.floor(Number(opts.maxDepth))))
      : 3;
  const maxNodes =
    opts && opts.maxNodes != null && Number.isFinite(Number(opts.maxNodes))
      ? Math.max(1, Math.min(4096, Math.floor(Number(opts.maxNodes))))
      : 128;

  const { reverseImports } = buildGraphIndexes(graphDoc);
  const seeds = [...new Set(seedNodeIds.map(String).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  const visited = new Set(seeds);
  let frontier = [...seeds];
  let depth = 0;
  let truncated = false;

  while (frontier.length && depth < maxDepth && visited.size < maxNodes) {
    const next = [];
    for (const nid of frontier) {
      const im = reverseImports.get(nid) || [];
      for (const pred of im) {
        if (visited.size >= maxNodes) {
          truncated = true;
          break;
        }
        if (!visited.has(pred)) {
          visited.add(pred);
          next.push(pred);
        }
      }
      if (truncated) break;
    }
    frontier = next.sort((a, b) => a.localeCompare(b));
    depth += 1;
    if (truncated) break;
  }

  if (visited.size >= maxNodes) truncated = true;

  const node_ids = [...visited].filter((x) => !seeds.includes(x)).sort((a, b) => a.localeCompare(b));
  const paths = [
    ...new Set(node_ids.filter((id) => id.startsWith("file:") || id.startsWith("test:")).map(pathFromNodeId)),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return { node_ids, paths, truncated };
}

/**
 * Dependências diretas e fechamento leve (forward) só por imports.
 * @param {object} graphDoc
 * @param {string} seedNodeId
 * @param {{ maxDepth?: number, maxNodes?: number }} opts
 */
function expandForwardImports(graphDoc, seedNodeId, opts) {
  const maxDepth =
    opts && opts.maxDepth != null && Number.isFinite(Number(opts.maxDepth))
      ? Math.max(0, Math.min(32, Math.floor(Number(opts.maxDepth))))
      : 2;
  const maxNodes =
    opts && opts.maxNodes != null && Number.isFinite(Number(opts.maxNodes))
      ? Math.max(1, Math.min(4096, Math.floor(Number(opts.maxNodes))))
      : 64;

  const { forwardImports } = buildGraphIndexes(graphDoc);
  const start = String(seedNodeId || "");
  const visited = new Set(start ? [start] : []);
  let frontier = start ? [start] : [];
  let depth = 0;
  let truncated = false;

  while (frontier.length && depth < maxDepth && visited.size < maxNodes) {
    const next = [];
    for (const nid of frontier) {
      const outs = forwardImports.get(nid) || [];
      for (const t of outs) {
        if (!t.startsWith("file:") && !t.startsWith("test:")) continue;
        if (visited.size >= maxNodes) {
          truncated = true;
          break;
        }
        if (!visited.has(t)) {
          visited.add(t);
          next.push(t);
        }
      }
      if (truncated) break;
    }
    frontier = next.sort((a, b) => a.localeCompare(b));
    depth += 1;
  }

  if (visited.size >= maxNodes) truncated = true;
  const node_ids = [...visited].filter((x) => x !== start).sort((a, b) => a.localeCompare(b));
  const paths = [
    ...new Set(node_ids.map(pathFromNodeId)),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return { node_ids, paths, truncated };
}

/**
 * Testes ligados a arquivos-fonte (via arestas `tests`).
 * @param {object} graphDoc
 * @param {string[]} sourceFilePaths posix normalized
 */
function linkedTestsForFiles(graphDoc, sourceFilePaths) {
  const { testsByTarget } = buildGraphIndexes(graphDoc);
  const out = new Set();
  for (const fp of sourceFilePaths) {
    const nid = nodeIdFor("file", fp);
    const list = testsByTarget.get(nid) || [];
    for (const t of list) out.add(pathFromNodeId(t));
  }
  return [...out].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Enriquece targets com `impact_expansion` (metadados; não altera validators).
 * @param {object} targetsDoc
 * @param {object} graphDoc
 * @param {{ reverseDepth?: number, reverseMax?: number, forwardDepth?: number, forwardMax?: number }} opts
 */
function enrichValidationTargetsWithGraphImpact(targetsDoc, graphDoc, opts) {
  if (!targetsDoc || typeof targetsDoc !== "object" || !graphDoc || typeof graphDoc !== "object") {
    return targetsDoc;
  }
  const targets = targetsDoc.targets && Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];
  const o = opts && typeof opts === "object" ? opts : {};

  const nextTargets = targets.map((t) => {
    if (!t || typeof t !== "object") return t;
    const fp = normalizePath(t.file != null ? String(t.file) : "");
    if (!fp) return t;

    const nType = isTestFilePath(fp) ? "test" : "file";
    const seedId = nodeIdFor(nType, fp);

    const rev = expandImpactReverseImports(graphDoc, [seedId], {
      maxDepth: o.reverseDepth != null ? o.reverseDepth : 3,
      maxNodes: o.reverseMax != null ? o.reverseMax : 128,
    });

    const fwd = expandForwardImports(graphDoc, seedId, {
      maxDepth: o.forwardDepth != null ? o.forwardDepth : 2,
      maxNodes: o.forwardMax != null ? o.forwardMax : 64,
    });

    const linked = linkedTestsForFiles(graphDoc, [fp]);

    const idx = buildGraphIndexes(graphDoc);
    const directIds = idx.reverseImports.get(seedId) || [];
    const direct_importer_files = [
      ...new Set(
        directIds
          .filter((id) => id.startsWith("file:") || id.startsWith("test:"))
          .map(pathFromNodeId)
          .filter((p) => p && p !== fp),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return {
      ...t,
      impact_expansion: {
        graph_fingerprint_sha256: String(
          graphDoc.fingerprints && graphDoc.fingerprints.graph_content_sha256
            ? graphDoc.fingerprints.graph_content_sha256
            : "",
        ),
        direct_importer_files,
        importer_files: rev.paths.filter((p) => p !== fp),
        transitive_importers_truncated: rev.truncated,
        dependency_files: fwd.paths.filter((p) => p !== fp),
        dependencies_truncated: fwd.truncated,
        linked_test_files: linked.filter((x) => x !== fp),
      },
    };
  });

  targetsDoc.targets = nextTargets;
  targetsDoc.extensions =
    targetsDoc.extensions && typeof targetsDoc.extensions === "object" ? targetsDoc.extensions : {};
  targetsDoc.extensions.dependency_graph = {
    artifact: "dependency-graph.json",
    graph_fingerprint_sha256:
      graphDoc.fingerprints && graphDoc.fingerprints.graph_content_sha256 != null
        ? String(graphDoc.fingerprints.graph_content_sha256)
        : null,
    stats: graphDoc.metadata && graphDoc.metadata.stats ? graphDoc.metadata.stats : null,
  };

  return targetsDoc;
}

function dependencyGraphPath(outputDir) {
  return path.join(String(outputDir || ""), "dependency-graph.json");
}

function saveDependencyGraph(outputDir, doc) {
  const dir = String(outputDir || "");
  if (!dir || !doc || typeof doc !== "object") return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dependencyGraphPath(dir), JSON.stringify(doc, null, 2), "utf8");
}

function loadDependencyGraph(outputDir) {
  const fp = dependencyGraphPath(String(outputDir || ""));
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (_) {
    return null;
  }
}

function exportGraphDocCanonicalJson(graphDoc) {
  if (!graphDoc || typeof graphDoc !== "object") return stableStringify({ version: 1, nodes: [], edges: [] });
  const nodes = Array.isArray(graphDoc.nodes) ? graphDoc.nodes : [];
  const edges = Array.isArray(graphDoc.edges) ? graphDoc.edges : [];
  const nodeRows = nodes
    .filter((n) => n && typeof n === "object")
    .map((n) => ({
      node_id: String(n.node_id || ""),
      type: String(n.type || ""),
      path: normalizePath(n.path != null ? String(n.path) : ""),
    }))
    .sort((a, b) => a.node_id.localeCompare(b.node_id));
  const edgeRows = edges
    .filter((e) => e && typeof e === "object")
    .map((e) => ({
      from: String(e.from || ""),
      to: String(e.to || ""),
      relation: String(e.relation || ""),
    }))
    .sort((a, b) => {
      const c1 = a.from.localeCompare(b.from);
      if (c1 !== 0) return c1;
      const c2 = a.relation.localeCompare(b.relation);
      if (c2 !== 0) return c2;
      return a.to.localeCompare(b.to);
    });
  return stableStringify({ version: 1, nodes: nodeRows, edges: edgeRows });
}

module.exports = {
  buildDependencyGraphDoc,
  enrichValidationTargetsWithGraphImpact,
  expandImpactReverseImports,
  expandForwardImports,
  linkedTestsForFiles,
  buildGraphIndexes,
  dependencyGraphPath,
  saveDependencyGraph,
  loadDependencyGraph,
  exportGraphDocCanonicalJson,
  isTestFilePath,
  resolveImportToExistingFile,
  resolveRelativeImportSpec,
};
