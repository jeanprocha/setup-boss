"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  buildOperationalExecutableStrategy,
  writeOperationalExecutableStrategy,
  computeStrategySha256,
  stableStringify,
  buildMiniTaskId,
  OPERATIONAL_EXECUTABLE_STRATEGY_REL,
} = require("./build-operational-executable-strategy");

const FIXTURES = path.join(
  __dirname,
  "fixtures",
  "operational-executable-strategy",
);

function fixtureDir(name) {
  return path.join(FIXTURES, name);
}

function copyFixtureToTmp(name) {
  const src = fixtureDir(name);
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), `oes-${name}-`));
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

test("buildOperationalExecutableStrategy: estratégia rica completa", () => {
  const out = copyFixtureToTmp("rich-complete");
  const r = buildOperationalExecutableStrategy({
    outputDirAbs: out,
    planVersion: 1,
    runId: "test-rich",
    write: true,
  });

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.degraded, false);
  assert.ok(r.artifact);
  assert.strictEqual(r.artifact.version, 1);
  assert.strictEqual(r.artifact.planVersion, "v1");
  assert.strictEqual(r.artifact.orderingMode, "linear");
  assert.strictEqual(r.artifact.executionPattern, "sequential_by_step");
  assert.strictEqual(r.artifact.miniTasks.length, 3);
  assert.strictEqual(r.artifact.macroOrder.length, 3);

  const first = r.artifact.miniTasks[0];
  assert.match(String(first.id), /^mini-001-/);
  assert.ok(String(first.objective).includes("Mapear"));
  assert.ok(Array.isArray(first.acceptanceCriteria));
  assert.ok(first.acceptanceCriteria.length >= 1);
  assert.strictEqual(first.complexity, "low");
  assert.ok(first.scope && typeof first.scope === "object");
  assert.ok(first.affectedFiles.length >= 1);

  const second = r.artifact.miniTasks[1];
  assert.ok(second.dependsOnIds.includes(first.id));
  assert.ok(r.artifact.dependencies.length >= 1);

  assert.ok(r.artifact.expectedImpact.affectedComponents.length >= 1);
  assert.ok(
    r.artifact.expectedImpact.affectedComponents.some((c) =>
      /ChatPanel|integrations|frontend/i.test(String(c)),
    ),
  );

  const hash = r.artifact.approvalState.strategySha256;
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.strictEqual(computeStrategySha256(r.artifact), hash);

  const written = path.join(out, OPERATIONAL_EXECUTABLE_STRATEGY_REL);
  assert.ok(fs.existsSync(written));
  const disk = JSON.parse(fs.readFileSync(written, "utf-8"));
  assert.strictEqual(disk.approvalState.strategySha256, hash);
});

test("buildOperationalExecutableStrategy: estratégia parcial com fallbacks", () => {
  const out = copyFixtureToTmp("partial");
  const r = buildOperationalExecutableStrategy({
    outputDirAbs: out,
    planVersion: 2,
    sourcePlanVersion: 2,
  });

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.artifact.planVersion, "v2");
  assert.strictEqual(r.artifact.miniTasks.length, 1);

  const mt = r.artifact.miniTasks[0];
  assert.ok(String(mt.objective).length > 0);
  assert.strictEqual(mt.complexity, "medium");
  assert.strictEqual(mt.risk, "medium");
  assert.ok(mt.acceptanceCriteria.length >= 1);
  assert.ok(mt.completionCriteria.length >= 1);
  assert.ok(mt.affectedFiles.includes("core/utils.js"));
});

test("buildOperationalExecutableStrategy: run legado não quebra", () => {
  const out = copyFixtureToTmp("legacy");
  const r = buildOperationalExecutableStrategy({ outputDirAbs: out });

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.degraded, true);
  assert.ok(Array.isArray(r.warnings));
  assert.ok(r.warnings.some((w) => /legado|degradad/i.test(w)));
  assert.ok(r.artifact.miniTasks.length >= 1);
  assert.strictEqual(r.artifact.orderingMode, "linear");
  assert.ok(r.artifact.approvalState.strategySha256.length === 64);
});

test("computeStrategySha256: determinístico e sensível a mudanças", () => {
  const out = copyFixtureToTmp("rich-complete");
  const a = buildOperationalExecutableStrategy({ outputDirAbs: out }).artifact;
  const b = buildOperationalExecutableStrategy({ outputDirAbs: out }).artifact;
  assert.strictEqual(
    a.approvalState.strategySha256,
    b.approvalState.strategySha256,
  );
  assert.strictEqual(stableStringify(a.miniTasks), stableStringify(b.miniTasks));

  const c = structuredClone(a);
  c.miniTasks[0].title = "Título alterado";
  assert.notStrictEqual(computeStrategySha256(c), a.approvalState.strategySha256);

  const d = structuredClone(a);
  d.generatedAt = "2099-01-01T00:00:00.000Z";
  assert.strictEqual(computeStrategySha256(d), a.approvalState.strategySha256);
});

test("buildMiniTaskId: formato mini-{order}-{slug}", () => {
  assert.strictEqual(
    buildMiniTaskId(1, "Criar componente base"),
    "mini-001-criar-componente-base",
  );
});

test("writeOperationalExecutableStrategy: persiste no path canónico", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "oes-write-"));
  const built = buildOperationalExecutableStrategy({
    outputDirAbs: fixtureDir("rich-complete"),
  });
  const w = writeOperationalExecutableStrategy(out, { artifact: built.artifact });
  assert.strictEqual(w.relPath, OPERATIONAL_EXECUTABLE_STRATEGY_REL);
  assert.ok(fs.existsSync(w.path));
});
