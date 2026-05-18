#!/usr/bin/env node
/**
 * Smoke operacional consolidado — MVP Fase 4 (execution runtime + recovery + rollback + observability + validação).
 *
 * Uso: node scripts/smoke/mvp-phase4-execution-smoke.js
 *      npm run smoke:mvp-phase4-execution
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { seedOutputWithStrategy } = require("./fixtures/seed-execution-mvp-strategy-output");
const { runExecutionRuntimeBase } = require("../runtime/execution-runtime/run-execution-runtime");
const { validateExecutionRuntimeResult } = require("../runtime/execution-runtime/validate-execution-runtime");
const { buildExecutionObservability } = require("../runtime/execution-runtime/build-execution-observability");

const REPO_ROOT = path.resolve(__dirname, "../..");
const EXECUTE_JS = path.join(REPO_ROOT, "scripts", "execute.js");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  const root = tmp("sb-smoke-p4-");
  const runId = "smoke-phase4-exec";
  const out = path.join(root, "docs", ".IA", "outputs", runId);
  try {
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });

    const r1 = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r1.ok, true, JSON.stringify(r1));

    const intPath = path.join(out, "execution", "runtime-integrity-report.json");
    assert.ok(fs.existsSync(intPath), "runtime-integrity-report.json em falta");
    const integ = JSON.parse(fs.readFileSync(intPath, "utf-8"));
    assert.strictEqual(integ.valid, true);
    assert.ok(Array.isArray(integ.warnings));
    assert.ok(Array.isArray(integ.errors));

    const v1 = validateExecutionRuntimeResult(out);
    assert.strictEqual(v1.ok, true, v1.errors.join("; "));

    const bo = buildExecutionObservability({
      outputDirAbs: out,
      force: true,
      recordDiagnosticEvents: true,
    });
    assert.strictEqual(bo.ok, true);
    const v2 = validateExecutionRuntimeResult(out);
    assert.strictEqual(v2.ok, true, v2.errors.join("; "));

    const r2 = runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.skipped, true);

    const badCli = spawnSync(process.execPath, [EXECUTE_JS, "--run", out, "--observability", "--rollback"], {
      encoding: "utf-8",
    });
    assert.notStrictEqual(badCli.status, 0, "CLI devia falhar com flags incompatíveis");

    const obsCli = spawnSync(process.execPath, [EXECUTE_JS, "--run", out, "--observability", "--json"], {
      encoding: "utf-8",
    });
    assert.strictEqual(obsCli.status, 0, obsCli.stderr || obsCli.stdout);
    const obsJson = JSON.parse(obsCli.stdout);
    assert.strictEqual(obsJson.ok, true);

    console.log("smoke:mvp-phase4-execution OK");
  } finally {
    rmrf(root);
  }
}

main();
