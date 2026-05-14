"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { LifecycleState } = require("../constants");
const { validateDependencyGraph } = require("../validation/graph-validation");
const {
  buildJsTsImportDependencyGraphDocument,
  DEFAULT_LIMITS,
} = require("./js-ts/import-graph-builder");
const { extractRelativeImportSpecifiers } = require("./js-ts/import-analyzer");

/** @param {string} root @param {[string,string][]} pairs */
function writeTree(root, pairs) {
  for (let i = 0; i < pairs.length; i += 1) {
    const [relPath, contents] = pairs[i];
    const full = path.join(root, ...relPath.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents, "utf8");
  }
}

test("import estático relativamente resolvido", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jsimp-"));
  try {
    writeTree(tmp, [
      ["src/util.ts", "export const z = 1;\n"],
      ["src/root.ts", "import { z } from \"./util\";\n"],
    ]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["src/root.ts"],
      graphId: "g-static",
      lifecycleState: LifecycleState.BUILDING,
    });

    assert.strictEqual(validateDependencyGraph(doc).ok, true);
    const root = doc.nodes.find((/** @type {any} */ n) => n.path.endsWith("src/root.ts"));
    const util = doc.nodes.find((/** @type {any} */ n) => n.path.endsWith("src/util.ts"));
    assert.ok(root && util);
    assert.ok(
      doc.edges.some(
        (/** @type {any} */ e) => e.from === root.id && e.to === util.id && e.kind === "static_relative_import",
      ),
    );
    assert.strictEqual(doc.generation_policy.analyzer, "js_ts_imports");
    assert.strictEqual(Array.isArray(doc.generation_policy.unresolved_imports), true);
    assert.strictEqual(doc.generation_policy.skipped_external_imports >= 0, true);
    assert.strictEqual(doc.generation_policy.limits.max_files, DEFAULT_LIMITS.max_files);
    assert.strictEqual(Array.isArray(doc.generation_policy.entry_paths), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("export ... from relativamente resolvido", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jsexp-"));
  try {
    writeTree(tmp, [
      ["lib/b.ts", "export const bee = true;\n"],
      ["lib/a.ts", "export { bee } from \"./b.ts\";\n"],
    ]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["lib/a.ts"],
      graphId: "g-exp",
      lifecycleState: LifecycleState.BUILDING,
    });
    assert.strictEqual(validateDependencyGraph(doc).ok, true);

    assert.ok(
      doc.edges.some(
        (/** @type {any} */ e) => e.kind === "export_relative_reexport" && e.metadata && /^\.\/?b/i.test(String(e.metadata.specifier || "").replace(/\\/g, "/")),
      ),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("require e dynamic import literals resolvíveis", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reqdyn-"));
  try {
    writeTree(tmp, [
      ["cjs/dyn.js", 'module.exports = { v: () => Promise.resolve(import("./side.js")) };\n'],
      ["cjs/side.js", "module.exports = { x: 1 };\n"],
      ["cjs/r.js", "module.exports = require(\"./dyn\");\n"],
    ]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["cjs/r.js"],
      graphId: "g-req-dyn",
      lifecycleState: LifecycleState.BUILDING,
    });

    assert.strictEqual(validateDependencyGraph(doc).ok, true);
    assert.ok(doc.edges.some((/** @type {any} */ e) => e.kind === "require_relative"));
    assert.ok(doc.edges.some((/** @type {any} */ e) => e.kind === "dynamic_relative_import"));
    assert.strictEqual(doc.generation_policy.analyzer, "js_ts_imports");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("imports externos incrementam skipped_external_imports sem edge para especificadores não relativos", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jsext-"));
  try {
    writeTree(tmp, [
      [`src/x.tsx`, `import lodash from "lodash"; import { ok } from "./ok";` + "\n"],
      ["src/ok.ts", "export const ok = 1;\n"],
    ]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["src/x.tsx"],
      graphId: "g-ext",
      lifecycleState: LifecycleState.BUILDING,
    });

    assert.ok(doc.generation_policy.skipped_external_imports >= 1);
    assert.ok(
      !doc.edges.some(
        (/** @type {any} */ e) => e.metadata && String(e.metadata.specifier || "").includes("lodash"),
      ),
    );
    assert.strictEqual(validateDependencyGraph(doc).ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("relativo inexistente marca edge metadata.unresolved e entra unresolved_imports", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ghost-"));
  try {
    writeTree(tmp, [["p/a.ts", "import gh from './does-not-resolve';"]]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["p/a.ts"],
      graphId: "g-ghost",
      lifecycleState: LifecycleState.BUILDING,
    });

    assert.strictEqual(validateDependencyGraph(doc).ok, true);
    assert.ok(
      doc.generation_policy.unresolved_imports.some((/** @type {any} */ u) => u.specifier === "./does-not-resolve"),
    );
    const edge = doc.edges.find((/** @type {any} */ e) => e.metadata && e.metadata.unresolved === true);
    assert.ok(edge);
    const stubNode = doc.nodes.find((/** @type {any} */ n) => n.id === edge.to);
    assert.strictEqual(stubNode && stubNode.kind, "symbol_placeholder");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("directory pkg/sub/index.tsx resolvível via ./sub", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "idxm-"));
  try {
    writeTree(tmp, [
      ["pkg/sub/index.tsx", "export default function Idx() {}\n"],
      ["pkg/other.ts", 'import Idx from "./sub"\n'],
    ]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["pkg/other.ts"],
      graphId: "g-idx",
      lifecycleState: LifecycleState.BUILDING,
    });
    assert.strictEqual(validateDependencyGraph(doc).ok, true);
    assert.ok(
      doc.edges.some(
        (/** @type {any} */ e) =>
          typeof e.metadata === "object" &&
          typeof e.metadata.resolved_to === "string" &&
          e.metadata.resolved_to.replace(/\\/g, "/").includes("pkg/sub/index.tsx"),
      ),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("limits max_depth impedem apenas expansão (análise textual além da profundidade)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdepth-"));
  try {
    writeTree(tmp, [
      ["c/one.ts", 'import "./two";\n'],
      ["c/two.ts", 'import "./three";\n'],
      ["c/three.ts", "export const done = true;\n"],
    ]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["c/one.ts"],
      graphId: "g-depth",
      limits: { ...DEFAULT_LIMITS, max_depth: 1, max_edges_per_node: 16, max_files: 50 },
    });

    assert.strictEqual(validateDependencyGraph(doc).ok, true);
    assert.ok(doc.nodes.some((/** @type {any} */ n) => String(n.path || "").replace(/\\/g, "/").endsWith("c/three.ts")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("max_files aplica capacidade finita de nós novos", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mfiles-"));
  try {
    writeTree(tmp, [
      ["e/a.ts", 'import "./b";\n'],
      ["e/b.ts", 'import "./c";\n'],
      ["e/c.ts", "export const tail = true;\n"],
    ]);

    const doc = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      entryPaths: ["e/a.ts"],
      graphId: "g-files-cap",
      limits: { ...DEFAULT_LIMITS, max_files: 2, max_edges_per_node: 8, max_depth: 6 },
    });
    assert.strictEqual(doc.nodes.length, 2);
    assert.strictEqual(doc.generation_policy.limits_applied.max_files_hit, true);
    assert.strictEqual(validateDependencyGraph(doc).ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("fingerprint do grafo estável com entryPaths reordenados", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fp-stable-"));
  try {
    writeTree(tmp, [
      ["k/b.ts", 'import "./mid";\n'],
      ["k/a.ts", 'import "./mid";\n'],
      ["k/mid.ts", "export const m = 1;\n"],
    ]);

    const g1 = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      graphId: "same",
      entryPaths: ["k/b.ts", "k/a.ts"],
      lifecycleState: LifecycleState.BUILDING,
    });

    const g2 = buildJsTsImportDependencyGraphDocument({
      projectRoot: tmp,
      graphId: "same",
      entryPaths: ["k/a.ts", "k/b.ts"],
      lifecycleState: LifecycleState.BUILDING,
      timestamps: { createdAt: g1.created_at, updatedAt: g1.updated_at },
    });

    assert.strictEqual(g1.graph_fingerprint_sha256, g2.graph_fingerprint_sha256);
    assert.strictEqual(validateDependencyGraph(g1).ok && validateDependencyGraph(g2).ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("extractRelativeImportSpecifiers dedupe e ordenação determinística do kind+specifier", () => {
  const specs = extractRelativeImportSpecifiers(`
    import("./b")
    require('./c')
    import './a'
    import x from "../x"
    import x from "../x"
  `);
  const strings = specs.map((s) => `${s.kind}\u001f${s.specifier}`);
  assert.strictEqual(new Set(strings).size, strings.length);
  assert.deepStrictEqual(strings, [...strings].sort((a, b) => a.localeCompare(b)));
});
