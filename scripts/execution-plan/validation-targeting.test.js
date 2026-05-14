/**
 * Testes — Validation Targeting (Fase 4.1.2).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { inferValidationScope } = require("./validation-targeting/scope-inference");
const { inferValidators } = require("./validation-targeting/validator-inference");
const { collectDependencyHints } = require("./validation-targeting/dependency-hints");
const {
  generateValidationTargets,
  stableTargetId,
  accumulateCandidates,
} = require("./validation-targeting/validation-target-generator");
const {
  runShadowValidationTargetingAfterReconciliation,
} = require("./validation-targeting/index");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-vt-"));
}

test("inferValidationScope — package.json é project", () => {
  assert.equal(inferValidationScope("package.json"), "project");
});

test("inferValidationScope — markdown é file", () => {
  assert.equal(inferValidationScope("docs/readme.md"), "file");
});

test("inferValidationScope — TS é module", () => {
  assert.equal(inferValidationScope("src/app.tsx"), "module");
});

test("inferValidators — TS inclui eslint e typescript", () => {
  const v = inferValidators("src/x.ts", { projectRoot: null });
  assert.ok(v.includes("eslint"));
  assert.ok(v.includes("typescript"));
});

test("stableTargetId não depende da ordem dos operation_ids", () => {
  const a = stableTargetId("p", "r", "f.ts", "operation_match", ["op-2", "op-1"]);
  const b = stableTargetId("p", "r", "f.ts", "operation_match", ["op-1", "op-2"]);
  assert.equal(a, b);
});

test("generateValidationTargets é determinístico para mesmos inputs", () => {
  const plan = {
    plan_id: "plan-a",
    run_id: "run-a",
    allowed_files: ["src/a.ts", "extra.md"],
    operations: [
      { operation_id: "op-0002", type: "FILE_SCOPE", file: "src/a.ts" },
      { operation_id: "op-0001", type: "FILE_SCOPE", file: "README.md" },
    ],
    fingerprints: { plan_content_sha256: "abc" },
  };
  const recon = {
    status: "divergent",
    unmatched_operations: [{ operation_id: "op-0002", path: "src/a.ts", reason: "x" }],
    unexpected_changes: [{ path: "rogue.go", reason: "no_plan_operation_for_path" }],
  };
  const exec = [{ path: "src/a.ts", search: "", replace: "" }];
  const fixedAt = "2026-05-13T12:00:00.000Z";
  const d1 = generateValidationTargets({
    plan,
    reconciliation: recon,
    executorChanges: exec,
    projectRoot: null,
    runId: "run-a",
    generatedAt: fixedAt,
  });
  const d2 = generateValidationTargets({
    plan,
    reconciliation: recon,
    executorChanges: exec,
    projectRoot: null,
    runId: "run-a",
    generatedAt: fixedAt,
  });
  assert.deepEqual(d1, d2);
  assert.ok(d1.targets.every((t) => Array.isArray(t.inferred_validators)));
});

test("generateValidationTargets ignora operações malformadas sem path", () => {
  const plan = {
    plan_id: "p",
    run_id: "r",
    allowed_files: [],
    operations: [null, {}, { operation_id: "x", file: null }],
  };
  const doc = generateValidationTargets({
    plan,
    reconciliation: null,
    executorChanges: [],
    runId: "r",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(doc.summary.total_targets, 0);
});

test("accumulateCandidates dedupe por ficheiro e prioriza reconciliation_unexpected", () => {
  const plan = {
    operations: [
      { operation_id: "op-1", file: "src/x.ts" },
    ],
    allowed_files: ["src/x.ts"],
  };
  const recon = {
    unexpected_changes: [{ path: "src/x.ts", reason: "no_plan_operation_for_path" }],
    unmatched_operations: [],
  };
  const map = accumulateCandidates(plan, recon, [{ path: "src/x.ts" }]);
  const slot = map.get("src/x.ts");
  assert.ok(slot);
  const reasons = [...slot.reasons].sort();
  assert.ok(reasons.includes("reconciliation_unexpected"));
});

test("dependency_hints captura imports relativos", () => {
  const dir = tmpDir();
  const rel = "src/use.js";
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'import x from "./peer.js"\n', "utf8");
  const hints = collectDependencyHints(abs, rel);
  assert.ok(hints.some((h) => h.kind === "relative_import" && h.detail === "./peer.js"));
});

test("runShadowValidationTargeting persiste artefactos em modo shadow", () => {
  const prev = process.env.SETUP_BOSS_PLAN_MODE;
  process.env.SETUP_BOSS_PLAN_MODE = "shadow";
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
      allowed_files: ["a.ts"],
      operations: [{ operation_id: "op-1", type: "FILE_SCOPE", file: "a.ts" }],
      fingerprints: { plan_content_sha256: "deadbeef" },
    };
    fs.writeFileSync(path.join(out, "execution-plan.json"), JSON.stringify(plan), "utf8");
    fs.writeFileSync(path.join(out, "executor-changes.json"), JSON.stringify([{ path: "a.ts" }]), "utf8");
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

    const res = runShadowValidationTargetingAfterReconciliation({
      ctx: { telemetry: { emit() {} } },
      outputDir: out,
      runId: "r-int",
    });
    assert.equal(res.ok, true);
    assert.ok(fs.existsSync(path.join(out, "validation-targets.json")));
    assert.ok(fs.existsSync(path.join(out, "dependency-graph.json")));
    assert.ok(fs.existsSync(path.join(out, "validation-manifest.json")));
    assert.ok(fs.existsSync(path.join(out, "validation-propagation-manifest.json")));
    assert.ok(fs.existsSync(path.join(out, "validation-plan.json")));
    assert.ok(fs.existsSync(path.join(out, "validation-results.json")));
    assert.ok(fs.existsSync(path.join(out, "validation-runtime-summary.json")));
    const vp = JSON.parse(fs.readFileSync(path.join(out, "validation-plan.json"), "utf8"));
    assert.ok(Array.isArray(vp.targets));
    assert.ok(Array.isArray(vp.validators));
    assert.ok(Array.isArray(vp.resolved_validators));
    assert.ok(Array.isArray(vp.commands));
    assert.ok(vp.resolver && typeof vp.resolver === "object");
    assert.ok(vp.graph_impact && vp.graph_impact.summary);
    assert.ok(Array.isArray(vp.graph_candidates));
    assert.ok(Array.isArray(vp.risk_hints));
    assert.ok(vp.scope_expansion && vp.scope_expansion.caps);
    assert.ok(vp.fingerprints && vp.fingerprints.graph_aware_payload_sha256);
    assert.ok(vp.sources && vp.sources.dependency_graph);
    const man = JSON.parse(fs.readFileSync(path.join(out, "validation-manifest.json"), "utf8"));
    assert.ok(Array.isArray(man.telemetry_events));
    assert.ok(man.telemetry_events.some((e) => e.name === "validation_targets_generated"));
    assert.ok(man.telemetry_events.some((e) => e.name === "dependency_graph_built"));
    assert.ok(man.extensions && man.extensions.dependency_graph && man.extensions.dependency_graph.graph_fingerprint_sha256);
  } finally {
    process.env.SETUP_BOSS_PLAN_MODE = prev;
  }
});

test("validation-executor — resolved serial, fingerprints e summary", () => {
  const {
    runValidationExecutorSync,
    saveValidationResults,
    validationResultsPath,
  } = require("./validation-targeting/validation-executor");
  const out = tmpDir();
  const planDoc = {
    version: 1,
    metadata: { plan_id: "p-exec", run_id: "r-exec" },
    fingerprints: { validation_plan_identity_sha256: "planfp-test" },
    commands: [
      {
        command_id: "vc-a",
        target_id: "t-a",
        validator_id: "node",
        status: "resolved",
        argv: [process.execPath, "-e", "process.exit(0)"],
      },
      {
        command_id: "vc-b",
        target_id: "t-b",
        validator_id: "node",
        status: "resolved",
        argv: [process.execPath, "-e", "process.exit(2)"],
      },
      {
        command_id: "vc-skip",
        target_id: "t-skip",
        validator_id: "x",
        status: "resolved",
        argv: null,
      },
      {
        command_id: "vc-c",
        target_id: "t-c",
        validator_id: null,
        status: "unresolved",
        argv: null,
      },
    ],
  };
  const { doc } = runValidationExecutorSync({ outputDir: out, planDoc });
  saveValidationResults(out, doc);

  assert.equal(doc.summary.total, 4);
  assert.equal(doc.summary.unresolved, 1);
  assert.equal(doc.summary.passed, 1);
  assert.equal(doc.summary.failed, 1);
  assert.equal(doc.summary.skipped, 1);
  assert.ok(Number(doc.summary.total_duration_ms) >= 0);
  assert.equal(doc.fingerprints.validation_plan_identity_sha256, "planfp-test");
  assert.ok(doc.fingerprints.validation_results_identity_sha256.length === 64);

  const ra = doc.results.find((r) => r.command_id === "vc-a");
  const rb = doc.results.find((r) => r.command_id === "vc-b");
  const rs = doc.results.find((r) => r.command_id === "vc-skip");
  assert.equal(ra.status, "passed");
  assert.equal(ra.cache_status, "write");
  assert.equal(ra.reused_from_cache, false);
  assert.equal(rb.status, "failed");
  assert.equal(rb.cache_status, "miss");
  assert.equal(rb.exit_code, 2);
  assert.equal(rs.status, "skipped");
  assert.equal(rs.cache_status, "miss");
  assert.equal(doc.summary.cache_hits, 0);
  assert.equal(doc.summary.cache_misses, 2);
  assert.equal(doc.summary.cache_reused, 0);

  assert.ok(fs.existsSync(validationResultsPath(out)));
  const vr = JSON.parse(fs.readFileSync(validationResultsPath(out), "utf8"));
  assert.equal(vr.version, 1);
  assert.ok(Array.isArray(vr.results));
  const { validationRuntimeSummaryPath } = require("./validation-targeting/validation-runtime-summary");
  assert.ok(fs.existsSync(validationRuntimeSummaryPath(out)));
});

test("validation-cache — hit no segundo run local (reuse apenas passed)", () => {
  const prevCache = process.env.SETUP_BOSS_VALIDATION_CACHE;
  delete process.env.SETUP_BOSS_VALIDATION_CACHE;
  try {
    const { runValidationExecutorSync } = require("./validation-targeting/validation-executor");
    const { validationCachePath } = require("./validation-targeting/validation-cache");
    const out = tmpDir();
    const planDoc = {
      version: 1,
      metadata: { plan_id: "p-cache", run_id: "r-cache" },
      fingerprints: { validation_plan_identity_sha256: "planfp-cache" },
      commands: [
        {
          command_id: "vc-pass",
          target_id: "t-p",
          validator_id: "node",
          status: "resolved",
          argv: [process.execPath, "-e", "process.exit(0)"],
        },
        {
          command_id: "vc-fail",
          target_id: "t-f",
          validator_id: "node",
          status: "resolved",
          argv: [process.execPath, "-e", "process.exit(2)"],
        },
      ],
    };

    const r1 = runValidationExecutorSync({ outputDir: out, planDoc });
    assert.equal(r1.doc.summary.cache_hits, 0);
    assert.equal(r1.doc.summary.cache_misses, 2);
    const cache1 = JSON.parse(fs.readFileSync(validationCachePath(out), "utf8"));
    assert.equal(cache1.entries.length, 1);

    const r2 = runValidationExecutorSync({ outputDir: out, planDoc });
    assert.equal(r2.doc.summary.cache_hits, 1);
    assert.equal(r2.doc.summary.cache_reused, 1);
    assert.equal(r2.doc.summary.cache_misses, 1);
    const rp = r2.doc.results.find((x) => x.command_id === "vc-pass");
    assert.equal(rp.cache_status, "hit");
    assert.equal(rp.reused_from_cache, true);
    const rf = r2.doc.results.find((x) => x.command_id === "vc-fail");
    assert.equal(rf.cache_status, "miss");
    assert.equal(rf.reused_from_cache, false);
    assert.equal(
      r1.doc.fingerprints.validation_results_identity_sha256,
      r2.doc.fingerprints.validation_results_identity_sha256,
    );
  } finally {
    if (prevCache === undefined) delete process.env.SETUP_BOSS_VALIDATION_CACHE;
    else process.env.SETUP_BOSS_VALIDATION_CACHE = prevCache;
  }
});

test("validation-cache — disabled via env não escreve artefacto", () => {
  const prevCache = process.env.SETUP_BOSS_VALIDATION_CACHE;
  process.env.SETUP_BOSS_VALIDATION_CACHE = "off";
  try {
    const {
      runValidationExecutorSync,
      saveValidationResults,
      validationResultsPath,
    } = require("./validation-targeting/validation-executor");
    const { validationCachePath } = require("./validation-targeting/validation-cache");
    const out = tmpDir();
    const planDoc = {
      version: 1,
      metadata: { plan_id: "p-off", run_id: "r-off" },
      fingerprints: { validation_plan_identity_sha256: "planfp-off" },
      commands: [
        {
          command_id: "vc-only",
          target_id: "t1",
          validator_id: "node",
          status: "resolved",
          argv: [process.execPath, "-e", "process.exit(0)"],
        },
      ],
    };
    const { doc } = runValidationExecutorSync({ outputDir: out, planDoc });
    saveValidationResults(out, doc);
    assert.equal(doc.summary.cache_hits, 0);
    assert.equal(doc.summary.cache_misses, 0);
    assert.equal(doc.results[0].cache_status, "disabled");
    assert.ok(fs.existsSync(validationResultsPath(out)));
    assert.ok(!fs.existsSync(validationCachePath(out)));
  } finally {
    if (prevCache === undefined) delete process.env.SETUP_BOSS_VALIDATION_CACHE;
    else process.env.SETUP_BOSS_VALIDATION_CACHE = prevCache;
  }
});

test("runShadowValidationTargeting skipped quando plan_mode off", () => {
  const prev = process.env.SETUP_BOSS_PLAN_MODE;
  process.env.SETUP_BOSS_PLAN_MODE = "off";
  try {
    const r = runShadowValidationTargetingAfterReconciliation({
      ctx: {},
      outputDir: "/nonexistent/path",
      runId: "x",
    });
    assert.equal(r.skipped, true);
    assert.equal(r.reason, "plan_mode_off");
  } finally {
    process.env.SETUP_BOSS_PLAN_MODE = prev;
  }
});
