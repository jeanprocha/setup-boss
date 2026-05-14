"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { stableStringify } = require("../fingerprint/plan-fingerprint");
const {
  enrichValidationPlanWithGraphImpact,
  DEFAULT_GRAPH_CANDIDATES_MAX,
} = require("./graph-aware-plan-enrichment");
const { computeValidationPlanIdentityPayload } = require("./validator-resolver");

test("enrichValidationPlanWithGraphImpact — candidatos reverse_import / fingerprint", () => {
  const planDoc = {
    version: 1,
    schema_contract: "validation-plan/1",
    targets: [
      {
        target_id: "t1",
        consolidation_key: "file:src/a.ts",
        file: "src/a.ts",
        inferred_validators: ["eslint"],
      },
    ],
    validators: [],
    scope: { histogram: { file: 0, module: 1, project: 0 } },
    sources: {
      validation_targets: "validation-targets.json",
      validation_manifest: "validation-manifest.json",
      validation_propagation_manifest: "validation-propagation-manifest.json",
      executor_changes: "executor-changes.json",
      execution_plan: "execution-plan.json",
    },
    metadata: { plan_id: "p", run_id: "r" },
    fingerprints: { validation_plan_identity_sha256: "preset" },
    resolved_validators: [],
    commands: [],
    resolver: null,
  };

  const targetsDoc = {
    targets: [
      {
        file: "src/a.ts",
        risk_hints: ["outside_architect_allowed_files"],
        impact_expansion: {
          graph_fingerprint_sha256: "gf1",
          direct_importer_files: ["src/b.ts"],
          importer_files: ["src/b.ts", "src/c.ts"],
          transitive_importers_truncated: false,
          dependency_files: ["src/util.ts"],
          dependencies_truncated: false,
          linked_test_files: ["src/a.test.ts"],
        },
      },
    ],
  };

  const graphDoc = {
    fingerprints: { graph_content_sha256: "abc" },
    metadata: { stats: { nodes_total: 3, edges_total: 2, unresolved_imports_skipped: 0 } },
  };

  enrichValidationPlanWithGraphImpact(planDoc, {
    outputDir: "",
    targetsDoc,
    graphDoc,
  });

  assert.ok(planDoc.graph_candidates.length >= 4);
  const rev = planDoc.graph_candidates.filter((c) => c.type === "reverse_import");
  assert.ok(rev.some((c) => c.source === "src/a.ts" && c.candidate === "src/b.ts" && c.hop === "direct"));
  assert.ok(rev.some((c) => c.candidate === "src/c.ts" && c.hop === "transitive"));
  assert.ok(planDoc.graph_impact.summary.reverse_imports_total >= 2);
  assert.ok(planDoc.graph_impact.summary.linked_tests_total >= 1);
  assert.ok(planDoc.graph_impact.summary.forward_imports_total >= 1);
  assert.ok(planDoc.risk_hints.includes("outside_architect_allowed_files"));
  assert.ok(planDoc.fingerprints.graph_aware_payload_sha256);
  assert.ok(planDoc.sources.dependency_graph);
  assert.ok(planDoc.scope_expansion.read_only);
  assert.equal(planDoc.scope_expansion.caps.graph_candidates_max, DEFAULT_GRAPH_CANDIDATES_MAX);
});

test("fontes extra em sources não entram na identidade do plano", () => {
  const base = {
    schema_contract: "validation-plan/1",
    version: 1,
    metadata: { plan_id: "p", run_id: "r", generation_phase: "post_reconciliation" },
    targets: [{ consolidation_key: "file:x", file: "x.ts", inferred_validators: [] }],
    validators: [],
    resolved_validators: [],
    commands: [],
    resolver: null,
    scope: { histogram: { file: 0, module: 0, project: 0 } },
    fingerprints: {},
    sources: {
      validation_targets: "validation-targets.json",
      validation_manifest: "validation-manifest.json",
      validation_propagation_manifest: "validation-propagation-manifest.json",
      executor_changes: "executor-changes.json",
      execution_plan: "execution-plan.json",
      dependency_graph: "dependency-graph.json",
    },
  };
  const a = computeValidationPlanIdentityPayload(base);
  const b = computeValidationPlanIdentityPayload({ ...base, sources: { ...base.sources, extra: "x" } });
  assert.equal(stableStringify(a), stableStringify(b));
});
