#!/usr/bin/env node
/**
 * Testes de continuidade temporal (drift, manifest, resume heurística).
 * Executar: node --test scripts/runtime/replay/continuity.test.js
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const os = require("os");
const { test } = require("node:test");

const { buildPatchManifest, writePatchManifestToOutput } = require("./patch-manifest");
const {
  validateFilesystemAgainstManifest,
  validateExecutorChangesIntegrity,
} = require("./drift-detector");
const { assessResume } = require("./resume-engine");
const { runDeterministicApply } = require("./apply-later");
const { RUNTIME_LIFECYCLE } = require("./lifecycle");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "setup-boss-cont-"));
}

function writeJson(dir, name, obj) {
  fs.writeFileSync(
    path.join(dir, name),
    JSON.stringify(obj, null, 2),
    "utf-8",
  );
}

test("patch manifest + drift clean vs drift detected", () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });

  const rel = "sample.txt";
  fs.writeFileSync(path.join(proj, rel), "hello world\n", "utf-8");

  const applied = [
    {
      operation: "patch",
      path: rel,
      search: "world",
      replace: "moon",
      reason: "test",
    },
  ];

  writeJson(out, "executor-changes.json", applied);

  const man = buildPatchManifest({
    outputDir: out,
    projectRoot: proj,
    run_id: "rid-test",
    appliedChanges: applied,
  });
  writePatchManifestToOutput(out, man);

  const ok = validateFilesystemAgainstManifest(proj, man);
  assert.ok(ok.ok);

  fs.writeFileSync(path.join(proj, rel), "CHANGED\n", "utf-8");
  const bad = validateFilesystemAgainstManifest(proj, man);
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some((e) => /drift/i.test(e)));
});

test("executor-changes integrity vs manifest", () => {
  const tmp = mkTmp();
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });

  const applied = [
    {
      operation: "patch",
      path: "x",
      search: "a",
      replace: "b",
      reason: "t",
    },
  ];
  fs.writeFileSync(path.join(proj, "x"), "a\n", "utf-8");
  writeJson(out, "executor-changes.json", applied);

  const man = buildPatchManifest({
    outputDir: out,
    projectRoot: proj,
    run_id: "r",
    appliedChanges: applied,
  });
  writePatchManifestToOutput(out, man);

  assert.ok(validateExecutorChangesIntegrity(out, man).ok);

  writeJson(out, "executor-changes.json", [{ path: "y" }]);
  assert.ok(!validateExecutorChangesIntegrity(out, man).ok);
});

test("assessResume sugere review quando executor OK e sem review", () => {
  const tmp = mkTmp();
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });

  writeJson(out, "metadata.json", {
    taskArg: "tasks/t.md",
    projectArg: "../p",
    projectRoot: path.join(tmp, "proj"),
    execution: { mode: "dry_run" },
  });

  writeJson(out, "run-log.json", {
    status: "running",
    steps: [],
    correction_iterations: 0,
    generated_files: [],
    errors: [],
    warnings: [],
    cache: {},
    cost_latency: {},
    limits: {},
  });

  writeJson(out, "executor-result.json", { status: "success" });

  const a = assessResume(out);
  assert.ok(a.ok);
  assert.strictEqual(a.next_phase, "review");
});

test("apply duplo bloqueado por marcador físico", () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });

  const rel = "f.txt";
  fs.writeFileSync(path.join(proj, rel), "ABC\n", "utf-8");

  const applied = [
    {
      operation: "patch",
      path: rel,
      search: "ABC",
      replace: "XYZ",
      reason: "t",
    },
  ];

  writeJson(out, "executor-changes.json", applied);
  writeJson(out, "review-output.json", {
    status: "approved",
    requires_correction: false,
  });

  writeJson(out, "run-context.json", {
    execution_context: { allowed_files: [rel] },
  });

  writeJson(out, "metadata.json", {
    projectRoot: proj,
    taskArg: "tasks/x.md",
    projectArg: "../x",
    execution: {
      mode: "dry_run",
      pending_apply: true,
      lifecycle_state: RUNTIME_LIFECYCLE.AWAITING_APPLY,
    },
  });

  const man = buildPatchManifest({
    outputDir: out,
    projectRoot: proj,
    run_id: "r",
    appliedChanges: applied,
  });
  writePatchManifestToOutput(out, man);

  runDeterministicApply({ outputDir: out, confirm: true });
  assert.throws(
    () => runDeterministicApply({ outputDir: out, confirm: true }),
    /DUPLICATE_APPLY_BLOCKED/,
  );
});
