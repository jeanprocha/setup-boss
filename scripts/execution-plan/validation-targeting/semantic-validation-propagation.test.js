/**
 * Semantic Validation Propagation — Fase 4.8.4
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  MutationReasonCodes,
} = require("../../semantic-dependency-runtime/overlay/constants");
const {
  buildValidationPropagationManifest,
  classifyImpactedSemanticNode,
  saveValidationPropagationManifest,
  loadValidationPropagationManifest,
  SEMANTIC_CANDIDATE_CLASSIFICATION,
} = require("./semantic-validation-propagation");
const {
  runShadowValidationTargetingAfterReconciliation,
} = require("./index");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-vp-"));
}

function baseTargetsDoc() {
  return {
    schema_version: 1,
    plan_id: "p1",
    run_id: "r1",
    generated_at: "2026-05-13T12:00:00.000Z",
    targets: [
      {
        target_id: "vt-a",
        file: "src/a.ts",
        reason: "executor_change",
        validation_scope: "module",
        inferred_validators: ["eslint", "typescript"].sort(),
        dependency_hints: [],
        risk_hints: [],
        metadata: { all_reasons: ["executor_change"] },
      },
    ],
    summary: { total_targets: 1, unique_files: 1, validator_types: [] },
  };
}

test("propagation off — sem semantic_candidates nem shadow targets", () => {
  const d = baseTargetsDoc();
  const proj = {
    schema_version: "propagation-manifest/1",
    impacted_paths: ["src/b.ts"],
    impacted_modules: ["src"],
  };
  const graph = {
    impacted_nodes: [
      {
        node_id: "n1",
        path: "src/b.ts",
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
        distance_from_root: 1,
        discovered_from: "src/a.ts",
      },
    ],
  };
  const { manifest } = buildValidationPropagationManifest({
    mode: "off",
    targetsDoc: d,
    propagationManifestDoc: proj,
    semanticMutationGraphDoc: graph,
    projectRoot: null,
  });
  assert.equal(manifest.propagation_mode, "off");
  assert.equal(manifest.semantic_candidates.length, 0);
  assert.ok(manifest.expanded_targets.some((x) => x.expansion_source === "original_validation_targeting"));
  assert.ok(!manifest.expanded_targets.some((x) => x.expansion_source === "semantic_shadow_candidate"));
});

test("shadow — expande impacted_paths não presentes nos targets originais", () => {
  const proj = {
    impacted_paths: ["src/b.ts", "src/a.ts"],
    impacted_modules: ["src"],
    propagation_fingerprint_sha256: "upstream-fp",
  };
  const graph = {
    impacted_nodes: [
      {
        node_id: "nb",
        path: "src/b.ts",
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
        distance_from_root: 2,
        discovered_from: "src/a.ts",
      },
      {
        node_id: "na",
        path: "src/a.ts",
        reason_codes: [MutationReasonCodes.DIRECT_CHANGE],
        distance_from_root: 0,
        discovered_from: "src/a.ts",
      },
    ],
  };
  const { manifest } = buildValidationPropagationManifest({
    mode: "shadow",
    targetsDoc: baseTargetsDoc(),
    propagationManifestDoc: proj,
    semanticMutationGraphDoc: graph,
    projectRoot: null,
    candidateCap: 50,
  });
  assert.equal(manifest.semantic_candidates.length, 1);
  assert.equal(manifest.semantic_candidates[0].file, "src/b.ts");
  assert.equal(
    manifest.semantic_candidates[0].semantic_classification,
    SEMANTIC_CANDIDATE_CLASSIFICATION.TRANSITIVE_SEMANTIC_DEPENDENCY,
  );
  const skippedOrig = manifest.skipped_candidates.filter((x) => x.reason_code === "already_original_target");
  assert.equal(skippedOrig.length, 1);
  assert.equal(skippedOrig[0].path, "src/a.ts");
});

test("classificação — reconciliation_related e reverse_semantic_dependency", () => {
  assert.equal(
    classifyImpactedSemanticNode({
      path: "x.ts",
      reason_codes: [MutationReasonCodes.RECONCILIATION_UNMATCHED, MutationReasonCodes.IMPORT_REACH],
      distance_from_root: 1,
    }),
    SEMANTIC_CANDIDATE_CLASSIFICATION.RECONCILIATION_RELATED,
  );
  assert.equal(
    classifyImpactedSemanticNode({
      path: "dep.ts",
      reason_codes: [MutationReasonCodes.REVERSE_IMPORT_REACH],
      distance_from_root: 1,
    }),
    SEMANTIC_CANDIDATE_CLASSIFICATION.REVERSE_SEMANTIC_DEPENDENCY,
  );
});

test("dedupe e ordenação estável — fingerprint replay-safe (ignora created_at)", () => {
  const proj = { impacted_paths: ["z.ts", "m.ts"], impacted_modules: [] };
  const graph = {
    impacted_nodes: [
      {
        node_id: "z",
        path: "z.ts",
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
        distance_from_root: 1,
        discovered_from: "a",
      },
      {
        node_id: "m",
        path: "m.ts",
        reason_codes: [MutationReasonCodes.IMPORT_REACH],
        distance_from_root: 1,
        discovered_from: "a",
      },
    ],
  };
  const inputs = {
    mode: "shadow",
    targetsDoc: baseTargetsDoc(),
    propagationManifestDoc: proj,
    semanticMutationGraphDoc: graph,
    projectRoot: null,
  };
  const a = buildValidationPropagationManifest({ ...inputs, createdAt: "2026-01-01T00:00:00.000Z" });
  const b = buildValidationPropagationManifest({ ...inputs, createdAt: "2027-01-01T00:00:00.000Z" });
  assert.equal(a.manifest.propagation_fingerprint_sha256, b.manifest.propagation_fingerprint_sha256);
  const pathsA = a.manifest.semantic_candidates.map((c) => c.file).sort();
  const pathsB = b.manifest.semantic_candidates.map((c) => c.file).sort();
  assert.deepEqual(pathsA, pathsB);
});

test("cap semântico — skipped_candidates por cap", () => {
  const paths = ["src/p0.ts", "src/p1.ts", "src/p2.ts"];
  const proj = { impacted_paths: paths, impacted_modules: [] };
  const graph = {
    impacted_nodes: paths.map((p, i) => ({
      node_id: `n${i}`,
      path: p,
      reason_codes: [MutationReasonCodes.IMPORT_REACH],
      distance_from_root: 1,
      discovered_from: "src/a.ts",
    })),
  };
  const { manifest } = buildValidationPropagationManifest({
    mode: "shadow",
    targetsDoc: baseTargetsDoc(),
    propagationManifestDoc: proj,
    semanticMutationGraphDoc: graph,
    projectRoot: null,
    candidateCap: 2,
  });
  assert.equal(manifest.semantic_candidates.length, 2);
  assert.ok(
    manifest.skipped_candidates.some((s) => s.reason_code === "semantic_candidate_cap_exceeded"),
  );
});

test("persistência load/save validation-propagation-manifest.json", () => {
  const dir = tmpDir();
  const { manifest } = buildValidationPropagationManifest({
    mode: "shadow",
    targetsDoc: baseTargetsDoc(),
    propagationManifestDoc: { impacted_paths: ["new.ts"], impacted_modules: [] },
    semanticMutationGraphDoc: {
      impacted_nodes: [
        {
          node_id: "n",
          path: "new.ts",
          reason_codes: [MutationReasonCodes.IMPORT_REACH],
          distance_from_root: 1,
          discovered_from: "x",
        },
      ],
    },
    projectRoot: null,
  });
  saveValidationPropagationManifest(dir, manifest);
  const loaded = loadValidationPropagationManifest(dir);
  assert.ok(loaded);
  assert.equal(loaded.propagation_fingerprint_sha256, manifest.propagation_fingerprint_sha256);
});

test("integração runShadowValidationTargeting — shadow semântico gera manifest", () => {
  const prevPlan = process.env.SETUP_BOSS_PLAN_MODE;
  const prevSem = process.env.SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION;
  process.env.SETUP_BOSS_PLAN_MODE = "shadow";
  process.env.SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION = "shadow";
  try {
    const out = tmpDir();
    const proj = path.join(out, "proj");
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(
      path.join(out, "metadata.json"),
      JSON.stringify({ projectRoot: proj }),
      "utf8",
    );
    const plan = {
      plan_id: "p-int",
      run_id: "r-int",
      allowed_files: ["src/a.ts"],
      operations: [{ operation_id: "op-1", type: "FILE_SCOPE", file: "src/a.ts" }],
      fingerprints: { plan_content_sha256: "deadbeef" },
    };
    fs.writeFileSync(path.join(out, "execution-plan.json"), JSON.stringify(plan), "utf8");
    fs.writeFileSync(path.join(out, "executor-changes.json"), JSON.stringify([{ path: "src/a.ts" }]), "utf8");
    fs.writeFileSync(
      path.join(out, "execution-reconciliation.json"),
      JSON.stringify({
        schema_version: 1,
        plan_id: "p-int",
        run_id: "r-int",
        status: "full",
        matched_operations: [],
        unmatched_operations: [],
        unexpected_changes: [],
        coverage: { planned_operations: 1, matched: 1, unmatched: 0, unexpected: 0 },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(out, "propagation-manifest.json"),
      JSON.stringify({
        schema_version: "propagation-manifest/1",
        impacted_paths: ["src/b.ts"],
        impacted_modules: ["src"],
        propagation_fingerprint_sha256: "abc",
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(out, "semantic-mutation-graph.json"),
      JSON.stringify({
        impacted_nodes: [
          {
            node_id: "nb",
            path: "src/b.ts",
            reason_codes: [MutationReasonCodes.IMPORT_REACH],
            distance_from_root: 1,
            discovered_from: "src/a.ts",
          },
        ],
      }),
      "utf8",
    );

    const res = runShadowValidationTargetingAfterReconciliation({
      ctx: { telemetry: { emit() {} } },
      outputDir: out,
      runId: "r-int",
    });
    assert.equal(res.ok, true);
    const vpPath = path.join(out, "validation-propagation-manifest.json");
    assert.ok(fs.existsSync(vpPath));
    const vp = JSON.parse(fs.readFileSync(vpPath, "utf8"));
    assert.equal(vp.propagation_mode, "shadow");
    assert.ok(vp.semantic_candidates.some((c) => c.file === "src/b.ts"));
    const vtFile = JSON.parse(fs.readFileSync(path.join(out, "validation-targets.json"), "utf8"));
    assert.equal(vtFile.summary.total_targets, 1);
    assert.ok(!vtFile.targets.some((t) => t.file === "src/b.ts"));
    const vm = JSON.parse(fs.readFileSync(path.join(out, "validation-manifest.json"), "utf8"));
    assert.ok(vm.telemetry_events.some((e) => e.name === "semantic_validation_propagation_completed"));
    assert.equal(vm.refs.validation_propagation_manifest_ref, "validation-propagation-manifest.json");
  } finally {
    process.env.SETUP_BOSS_PLAN_MODE = prevPlan;
    process.env.SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION = prevSem;
  }
});
