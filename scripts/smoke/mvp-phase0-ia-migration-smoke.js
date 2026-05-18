#!/usr/bin/env node
/**
 * Smoke manual da migração docs/.IA (Fase 0.6): resolver, ensureIAMinimal,
 * writeRunIndex, validateRunArtifacts, appendProblemHistoryEntry.
 * Uso: node scripts/smoke/mvp-phase0-ia-migration-smoke.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ensureIAMinimal } = require("../ensure-ia");
const {
  resolveProjectIaDir,
  resolveProjectIaOutputsDir,
} = require("../shared/ia-path-resolver");
const { writeRunIndex, resolveRunIndexPath } = require("../../core/run-resolver");
const { validateRunArtifacts } = require("../runtime/validation/run-artifacts-validator");
const { appendProblemHistoryEntry } = require("../../core/problem-history");

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function assertEndsWith(p, suffix) {
  const n = path.normalize(p);
  assert.ok(
    n.replace(/\\/g, "/").endsWith(suffix.replace(/\\/g, "/")),
    `esperado path a terminar em ${suffix}, obtido ${n}`,
  );
}

async function scenarioCleanSlate() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ia-smoke-a-"));
  try {
    const r = resolveProjectIaDir(root);
    assert.strictEqual(r.source, "preferred-missing");
    assert.strictEqual(r.warnings.length, 0);

    const out = await ensureIAMinimal(root);
    assert.ok(fs.existsSync(path.join(root, "docs", ".IA")));
    assert.strictEqual(path.normalize(out.iaDir), path.normalize(r.iaDir));

    const outs = resolveProjectIaOutputsDir(root);
    assertEndsWith(outs, path.join("docs", ".IA", "outputs"));
  } finally {
    rmrf(root);
  }
}

async function scenarioLegacyRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ia-smoke-b-"));
  try {
    fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
    const r = resolveProjectIaDir(root);
    assert.strictEqual(r.source, "legacy");
    assert.strictEqual(r.isLegacy, true);
    assert.strictEqual(r.warnings.length, 1);
    assert.strictEqual(r.warnings[0].code, "IA_LEGACY_FALLBACK");

    const out = await ensureIAMinimal(root);
    assertEndsWith(out.iaDir, ".IA");
    assert.ok(!out.iaDir.includes(`${path.sep}docs${path.sep}.IA`));

    const outs = resolveProjectIaOutputsDir(root);
    assertEndsWith(outs, path.join(".IA", "outputs"));
  } finally {
    rmrf(root);
  }
}

async function scenarioHybrid() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ia-smoke-c-"));
  try {
    fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
    fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
    const r = resolveProjectIaDir(root);
    assert.strictEqual(r.source, "preferred");
    assert.strictEqual(r.isLegacy, false);
    assert.strictEqual(r.warnings.length, 1);
    assert.strictEqual(r.warnings[0].code, "IA_LEGACY_COEXIST");
  } finally {
    rmrf(root);
  }
}

function scenarioWriteRunIndexAndValidate() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ia-smoke-d-"));
  const runId = `smoke-run-${Date.now()}-${process.pid}`;
  try {
    const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, "metadata.json"),
      JSON.stringify(
        {
          runId,
          projectRoot: root,
          execution: {},
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(outputDir, "run-log.json"),
      JSON.stringify({ status: "completed", steps: [] }, null, 2),
      "utf-8",
    );

    writeRunIndex({ runId, projectRoot: root, outputDir });

    const v = validateRunArtifacts(outputDir, { strictProjectRoot: false });
    assert.ok(v.ok, v.errors.join("; "));
  } finally {
    try {
      const idx = resolveRunIndexPath(runId);
      if (fs.existsSync(idx)) fs.unlinkSync(idx);
    } catch (_) {
      /* ignore */
    }
    rmrf(root);
  }
}

function scenarioProblemHistoryLegacy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ia-smoke-e-"));
  try {
    fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
    const outputDir = path.join(root, ".IA", "outputs", "smoke-ph");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, "metadata.json"),
      JSON.stringify({ runId: "smoke-ph", projectRoot: root }, null, 2),
      "utf-8",
    );

    appendProblemHistoryEntry({
      projectRoot: root,
      outputDir,
      runId: "smoke-ph",
      step: "smoke_phase06",
      status: "error",
      severity: "low",
      type: "smoke_test",
      title: `Smoke Fase 0.6 legacy ${Date.now()}`,
      summary: "entrada de teste",
      cause: "smoke",
      evidence: ["ok"],
      files: [],
    });

    const hp = path.join(root, ".IA", "09-problem-history.jsonl");
    assert.ok(fs.existsSync(hp), "09-problem-history.jsonl deve existir sob .IA legado");
  } finally {
    rmrf(root);
  }
}

async function main() {
  await scenarioCleanSlate();
  await scenarioLegacyRoot();
  await scenarioHybrid();
  scenarioWriteRunIndexAndValidate();
  scenarioProblemHistoryLegacy();
  console.log("OK: mvp-phase0-ia-migration-smoke (resolver, ensureIAMinimal, run index, validate, problem-history)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
