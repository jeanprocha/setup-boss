/**
 * Testes — Dependency Graph MVP (Fase 4.10.6).
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildDependencyGraphDoc,
  enrichValidationTargetsWithGraphImpact,
  expandImpactReverseImports,
  expandForwardImports,
  exportGraphDocCanonicalJson,
  loadDependencyGraph,
  saveDependencyGraph,
  dependencyGraphPath,
} = require("./dependency-graph");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-dg-"));
}

test("buildDependencyGraphDoc — imports resolvidos e reverse impact", () => {
  const root = tmpDir();
  const util = path.join(root, "src", "util.ts");
  const consumer = path.join(root, "src", "consumer.ts");
  fs.mkdirSync(path.dirname(util), { recursive: true });
  fs.writeFileSync(util, "export const x = 1;\n", "utf8");
  fs.writeFileSync(consumer, "import { x } from './util';\n", "utf8");

  const targetsDoc = {
    plan_id: "p1",
    run_id: "r1",
    targets: [
      {
        target_id: "t1",
        file: "src/consumer.ts",
        dependency_hints: [{ kind: "relative_import", detail: "./util" }],
      },
    ],
  };

  const g = buildDependencyGraphDoc({
    projectRoot: root,
    targetsDoc,
    plan: null,
  });

  assert.equal(g.version, 1);
  assert.ok(g.fingerprints && g.fingerprints.graph_content_sha256);
  const types = new Set(g.nodes.map((n) => n.type));
  assert.ok(types.has("file"));
  const imports = g.edges.filter((e) => e.relation === "imports");
  assert.equal(imports.length, 1);
  assert.ok(imports[0].from.includes("consumer"));
  assert.ok(imports[0].to.includes("util"));

  const utilId = g.nodes.find((n) => n.path === "src/util.ts").node_id;
  const exp = expandImpactReverseImports(g, [utilId], { maxDepth: 4, maxNodes: 32 });
  assert.ok(exp.paths.some((p) => p.endsWith("consumer.ts")));

  const consId = g.nodes.find((n) => n.path === "src/consumer.ts").node_id;
  const fwd = expandForwardImports(g, consId, { maxDepth: 2, maxNodes: 32 });
  assert.ok(fwd.paths.includes("src/util.ts"));
});

test("fingerprints determinísticos (sem timestamps)", () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, "a.ts"), "import './b'\n", "utf8");
  fs.writeFileSync(path.join(root, "b.ts"), "export {}\n", "utf8");

  const td = {
    plan_id: "p",
    run_id: "r",
    targets: [
      { target_id: "x", file: "a.ts", dependency_hints: [{ kind: "relative_import", detail: "./b" }] },
    ],
  };

  const g1 = buildDependencyGraphDoc({ projectRoot: root, targetsDoc: td, plan: null });
  const g2 = buildDependencyGraphDoc({ projectRoot: root, targetsDoc: td, plan: null });
  assert.equal(g1.fingerprints.graph_content_sha256, g2.fingerprints.graph_content_sha256);
  assert.equal(exportGraphDocCanonicalJson(g1), exportGraphDocCanonicalJson(g2));
});

test("import não resolvido não aborta", () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, "only.ts"), "import './nope'\n", "utf8");

  const g = buildDependencyGraphDoc({
    projectRoot: root,
    targetsDoc: {
      targets: [
        { file: "only.ts", dependency_hints: [{ kind: "relative_import", detail: "./nope" }] },
      ],
    },
    plan: null,
  });
  assert.ok(g.metadata.stats.unresolved_imports_skipped >= 1);
  assert.equal(g.edges.filter((e) => e.relation === "imports").length, 0);
});

test("saveDependencyGraph / loadDependencyGraph roundtrip", () => {
  const out = tmpDir();
  const root = tmpDir();
  fs.writeFileSync(path.join(root, "z.ts"), "", "utf8");
  const doc = buildDependencyGraphDoc({
    projectRoot: root,
    targetsDoc: { targets: [{ file: "z.ts", dependency_hints: [] }] },
    plan: null,
  });
  saveDependencyGraph(out, doc);
  assert.ok(fs.existsSync(dependencyGraphPath(out)));
  const back = loadDependencyGraph(out);
  assert.equal(back.fingerprints.graph_content_sha256, doc.fingerprints.graph_content_sha256);
});

test("enrichValidationTargetsWithGraphImpact adiciona impact_expansion", () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "util.ts"), "export const u = 1\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "app.ts"), "import './util'\n", "utf8");

  const graph = buildDependencyGraphDoc({
    projectRoot: root,
    targetsDoc: {
      targets: [
        {
          target_id: "a",
          file: "src/util.ts",
          dependency_hints: [],
        },
        {
          target_id: "b",
          file: "src/app.ts",
          dependency_hints: [{ kind: "relative_import", detail: "./util" }],
        },
      ],
    },
  });

  const td = {
    schema_version: 1,
    targets: [
      { target_id: "a", file: "src/util.ts", dependency_hints: [] },
      {
        target_id: "b",
        file: "src/app.ts",
        dependency_hints: [{ kind: "relative_import", detail: "./util" }],
      },
    ],
  };

  enrichValidationTargetsWithGraphImpact(td, graph);
  const utilRow = td.targets.find((t) => t.file === "src/util.ts");
  assert.ok(utilRow.impact_expansion);
  assert.ok(utilRow.impact_expansion.direct_importer_files.includes("src/app.ts"));
  assert.ok(td.extensions.dependency_graph.graph_fingerprint_sha256);
});
