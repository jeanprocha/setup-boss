"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { LifecycleState } = require("../../constants");
const { buildDependencyGraphDocument } = require("../../graph-manifest");
const { stableStringify } = require("../../lib/stable-stringify");
const { ANALYZER_ID, extractRelativeImportSpecifiers, stripCommentsJsLike } = require("./import-analyzer");
const {
  normalizeRootAbs,
  resolveRelativeSpecifier,
  stableNodeIdFromRelativePath,
  unresolvedStubNodeId,
  inferLanguageFromPath,
} = require("./relative-resolver");

const DEFAULT_LIMITS = Object.freeze({
  max_files: 5000,
  max_depth: 64,
  max_edges_per_node: 256,
});

function normalizePathPOSIXRel(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function normalizeEntryRelativePaths(projectRootAbs, entryPathsRaw) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  const arr = Array.isArray(entryPathsRaw) ? entryPathsRaw : [];
  for (let i = 0; i < arr.length; i += 1) {
    const p = arr[i];
    const relRaw = normalizePathPOSIXRel(String(p || "").trim());
    if (!relRaw) continue;
    const abs = path.resolve(projectRootAbs, relRaw.replace(/\//g, path.sep));
    try {
      if (!fs.existsSync(abs)) continue;
    } catch (_) {
      continue;
    }
    if (seen.has(relRaw)) continue;
    seen.add(relRaw);
    out.push(relRaw);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function countSkippedExternalImports(projectRootAbs, posixRel) {
  const absPath = path.resolve(projectRootAbs, posixRel.replace(/\//g, path.sep));
  let txt = "";
  try {
    txt = fs.readFileSync(absPath, "utf8");
  } catch (_) {
    return { count: 0 };
  }
  const body = stripCommentsJsLike(txt);
  let count = 0;
  const bump = (re) => {
    let m;
    while ((m = re.exec(body)) !== null) {
      const s = m[1];
      if (!(s.startsWith("./") || s.startsWith("../"))) count += 1;
    }
  };
  bump(/\bfrom\s+['"]([^'"]+)['"]/g);
  bump(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  bump(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  bump(/\bimport\s+['"]([^'"]+)['"]\s*;?/g);
  return { count };
}

function mergeEdgeDedupKey(fromId, toId, kind, reason, meta) {
  return stableStringify({
    from: fromId,
    to: toId,
    kind,
    reason,
    meta: meta && typeof meta === "object" ? meta : {},
  });
}

/**
 * @param {{
 *   projectRoot: string,
 *   entryPaths: string[],
 *   graphId: string,
 *   lifecycleState?: string,
 *   limits?: Partial<typeof DEFAULT_LIMITS>,
 *   policyExtras?: Record<string, unknown>,
 *   timestamps?: { createdAt?: string, updatedAt?: string },
 * }} opts
 */
function buildJsTsImportDependencyGraphDocument(opts) {
  const projectRootAbs = normalizeRootAbs(opts.projectRoot);
  const limits = { ...DEFAULT_LIMITS, ...(opts.limits || {}) };
  const lifecycleState = opts.lifecycleState != null ? opts.lifecycleState : LifecycleState.REQUESTED;

  /** @type {{from_relative:string, specifier:string }[]} */
  const unresolved_import_entries = [];

  /** @type {Map<string, { id:string, path:string, kind:string, language:string, metadata?:object}>} */
  const nodesMap = new Map();

  /** @type {{from:string,to:string,kind:string,reason:string,metadata?:object}[]} */
  const edgesList = [];
  /** @type {Set<string>} */
  const edgeSeen = new Set();

  const limits_applied = Object.assign(
    {},
    {
      max_files_hit: false,
      edges_truncated_by_node_count: 0,
      deferred_resolution_max_files_count: 0,
    },
  );

  /** @type {number} */
  let skipped_external_aggregate = 0;

  function edgeDedup(fromId, toId, kind, reason, meta) {
    const k = mergeEdgeDedupKey(fromId, toId, kind, reason, meta);
    if (edgeSeen.has(k)) return;
    edgeSeen.add(k);
    edgesList.push({ from: fromId, to: toId, kind, reason, metadata: meta });
  }

  function allocateNodeBudget() {
    if (nodesMap.size >= limits.max_files) {
      limits_applied.max_files_hit = true;
      return false;
    }
    return true;
  }

  function ensureFileNode(posixRel) {
    const pr = normalizePathPOSIXRel(posixRel);
    const id = stableNodeIdFromRelativePath(pr);
    if (nodesMap.has(id)) {
      const hit = nodesMap.get(id);
      if (hit) return hit;
    }
    if (!allocateNodeBudget()) return null;
    const node = {
      id,
      kind: "file",
      path: pr,
      language: inferLanguageFromPath(pr),
      metadata: { analyzer: ANALYZER_ID },
    };
    nodesMap.set(id, node);
    return node;
  }

  function ensureUnresolvedStub(spec, fromRelPathOnDisk, fromAbsForHash) {
    const stubId = unresolvedStubNodeId(spec, normalizePathPOSIXRel(fromRelPathOnDisk || fromAbsForHash));
    if (nodesMap.has(stubId)) return stubId;
    if (!allocateNodeBudget()) return null;
    nodesMap.set(stubId, {
      id: stubId,
      kind: "symbol_placeholder",
      path: spec,
      language: inferLanguageFromPath(spec),
      metadata: { analyzer: ANALYZER_ID, unresolved_stub: true, specifier: spec },
    });
    return stubId;
  }

  const enqueueList = [];
  const entryRelative = normalizeEntryRelativePaths(projectRootAbs, opts.entryPaths);
  for (const rel of entryRelative) {
    enqueueList.push({ posixRel: rel, depth: 0 });
    ensureFileNode(rel);
  }

  /** @type {Set<string>} */
  const queuedOrProcessed = new Set();
  let guard = 0;

  while (enqueueList.length > 0 && guard < limits.max_files * 128 + 16384) {
    guard += 1;
    enqueueList.sort((a, b) => {
      const c = a.posixRel.localeCompare(b.posixRel);
      if (c !== 0) return c;
      return a.depth - b.depth;
    });
    const next = enqueueList.shift();
    if (!next) break;
    const qkey = `${next.posixRel}\u001f${next.depth}`;
    if (queuedOrProcessed.has(qkey)) continue;
    queuedOrProcessed.add(qkey);

    const absPath = path.resolve(projectRootAbs, next.posixRel.replace(/\//g, path.sep));
    try {
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) continue;
    } catch (_) {
      continue;
    }

    skipped_external_aggregate += countSkippedExternalImports(projectRootAbs, next.posixRel).count;

    let source = "";
    try {
      source = fs.readFileSync(absPath, "utf8");
    } catch (_) {
      continue;
    }

    const fromNode = ensureFileNode(next.posixRel);
    if (!fromNode) continue;

    const extractions = extractRelativeImportSpecifiers(source).slice().sort((a, b) => {
      const k = a.kind.localeCompare(b.kind);
      if (k !== 0) return k;
      return a.specifier.localeCompare(b.specifier);
    });

    const maxEdges = Math.max(0, limits.max_edges_per_node);
    /** @type {number} */
    let emittedEdges = 0;

    const mayEnqueueResolved =
      limits.max_depth < 0 ? true : next.depth + 1 <= limits.max_depth;

    let truncatedThisNode = false;

    for (let i = 0; i < extractions.length; i += 1) {
      if (emittedEdges >= maxEdges) {
        truncatedThisNode = true;
        break;
      }

      const ex = extractions[i];
      const spec = ex.specifier.replace(/\\/g, "/");

      const res = resolveRelativeSpecifier({ projectRootAbs, fromAbsFile: absPath, specifier: spec });

      if (!res || res.unresolved) {
        unresolved_import_entries.push({ from_relative: fromNode.path, specifier: spec });
        const stubId = ensureUnresolvedStub(spec, fromNode.path, next.posixRel);
        if (!stubId) {
          limits_applied.deferred_resolution_max_files_count += 1;
          continue;
        }
        edgeDedup(fromNode.id, stubId, ex.kind, `js_ts:${ex.pattern}`, {
          analyzer: ANALYZER_ID,
          specifier: spec,
          unresolved: true,
        });
        emittedEdges += 1;
        continue;
      }

      const posixRelResolved = normalizePathPOSIXRel(res.posixRel);
      const toIdStable = stableNodeIdFromRelativePath(posixRelResolved);
      let targetNodeId = null;
      if (!nodesMap.has(toIdStable)) {
        const created = ensureFileNode(posixRelResolved);
        if (!created) {
          limits_applied.deferred_resolution_max_files_count += 1;
          continue;
        }
        targetNodeId = created.id;
      } else {
        targetNodeId = toIdStable;
      }

      edgeDedup(fromNode.id, targetNodeId, ex.kind, `js_ts:${ex.pattern}`, {
        analyzer: ANALYZER_ID,
        specifier: spec,
        resolved_to: posixRelResolved,
      });
      emittedEdges += 1;

      if (mayEnqueueResolved) {
        enqueueList.push({ posixRel: posixRelResolved, depth: next.depth + 1 });
      }
    }

    if (truncatedThisNode) {
      limits_applied.edges_truncated_by_node_count += 1;
    }
  }

  const nodes = [...nodesMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  const urMap = new Map();
  for (const r of unresolved_import_entries) {
    const k = `${r.from_relative}\u001f${r.specifier}`;
    if (!urMap.has(k)) urMap.set(k, r);
  }
  const unresolved_imports_sorted = [...urMap.values()].sort((a, b) => {
    const x = a.from_relative.localeCompare(b.from_relative);
    if (x !== 0) return x;
    return a.specifier.localeCompare(b.specifier);
  });

  const generation_policy = Object.assign(
    {
      version: "semantic-dep-policy/js-ts-imports/1",
      analyzer: ANALYZER_ID,
      limits: JSON.parse(JSON.stringify(limits)),
      limits_applied,
      unresolved_imports: unresolved_imports_sorted,
      skipped_external_imports: skipped_external_aggregate,
      entry_paths: [...entryRelative],
      snapshot_inputs_digest_sha256: crypto
        .createHash("sha256")
        .update(
          [...entryRelative].sort((a, b) => a.localeCompare(b)).join("\u0001") +
            `\u001e${projectRootAbs}`,
          "utf8",
        )
        .digest("hex"),
    },
    opts.policyExtras && typeof opts.policyExtras === "object" ? opts.policyExtras : {},
  );

  const edges_sorted = [...edgesList].sort((a, b) => {
    const f = a.from.localeCompare(b.from);
    if (f !== 0) return f;
    const t = a.to.localeCompare(b.to);
    if (t !== 0) return t;
    const k = a.kind.localeCompare(b.kind);
    if (k !== 0) return k;
    return a.reason.localeCompare(b.reason);
  });

  return buildDependencyGraphDocument({
    graphId: opts.graphId,
    lifecycleState,
    nodes,
    edges: edges_sorted,
    generationPolicy: generation_policy,
    createdAt: opts.timestamps && opts.timestamps.createdAt,
    updatedAt: opts.timestamps && opts.timestamps.updatedAt,
  });
}

module.exports = {
  DEFAULT_LIMITS,
  buildJsTsImportDependencyGraphDocument,
};
