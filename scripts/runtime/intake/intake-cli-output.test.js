"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { executeIntake, parseIntakeCliArgs } = require("./intake-runtime");
const { ensureDocsIaDir } = require("../../test-helpers/ensure-docs-ia-dir");
const { intakeResultToJson } = require("./intake-cli-output");

test("parseIntakeCliArgs reconhece --skip-llm e --json", () => {
  const a = parseIntakeCliArgs(["--project", "x", "--task", "y", "--skip-llm"]);
  assert.strictEqual(a.skipLlm, true);
  const b = parseIntakeCliArgs(["--skipLlm", "--project", "x", "--task", "y"]);
  assert.strictEqual(b.skipLlm, true);
  const c = parseIntakeCliArgs(["--json", "--project", "p", "--task", "t"]);
  assert.strictEqual(c.json, true);
  const d = parseIntakeCliArgs(["--project", "p", "--task", "t"]);
  assert.strictEqual(d.json, false);
});

test("executeIntake retorna classification, confidence, phase1Status e artifacts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-cli-rt-"));
  ensureDocsIaDir(root);
  let runId = null;
  try {
    const res = await executeIntake({
      projectArg: root,
      taskArg: "descrição longa o suficiente para evitar task_description_short no discovery.",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    assert.ok(typeof res.classification === "string");
    assert.ok(typeof res.confidence === "string");
    assert.strictEqual(res.phase1Status, "classified");
    assert.ok(Array.isArray(res.artifacts));
    assert.ok(res.artifacts.some((a) => a.name === "run-context.json"));
    assert.ok(res.artifacts.some((a) => a.name === "intake-manifest.json"));
    const j = intakeResultToJson(res);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.runId, runId);
    assert.ok(Array.isArray(j.artifacts));
    const { resolveRunIndexPath } = require("../../../core/run-resolver");
    assert.ok(fs.existsSync(resolveRunIndexPath(runId)), "run-index gravado para intake");
  } finally {
    if (runId) {
      const { resolveRunIndexPath } = require("../../../core/run-resolver");
      const p = resolveRunIndexPath(runId);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scripts/intake.js --json imprime só JSON parseável", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-cli-json-"));
  const { ensureIAMinimal } = require("../../ensure-ia");
  await ensureIAMinimal(root);
  const intakeScript = path.resolve(__dirname, "../../intake.js");
  try {
    const r = spawnSync(
      process.execPath,
      [
        intakeScript,
        "--project",
        root,
        "--task",
        "descrição longa o suficiente para evitar task_description_short no discovery.",
        "--skip-llm",
        "--json",
      ],
      { encoding: "utf-8", maxBuffer: 2_000_000 },
    );
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    const out = String(r.stdout || "").trim();
    assert.ok(out.length > 0);
    assert.match(out, /^\{/, "stdout deve ser só JSON (objeto na raiz)");
    const obj = JSON.parse(out);
    assert.strictEqual(obj.ok, true);
    assert.ok(obj.runId);
    assert.ok(obj.outputDir);
    assert.ok(obj.classification);
    assert.ok(obj.confidence);
    assert.strictEqual(obj.phase1Status, "classified");
    assert.ok(Array.isArray(obj.artifacts));
    const stderr = String(r.stderr || "");
    assert.ok(
      !stderr.includes("Run id:") && !stderr.includes("Classification:"),
      "--json: stderr não deve repetir formato humano",
    );
    const { resolveRunIndexPath } = require("../../../core/run-resolver");
    const idx = resolveRunIndexPath(obj.runId);
    if (fs.existsSync(idx)) fs.unlinkSync(idx);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scripts/intake.js modo humano inclui run id, classification e output dir", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-cli-human-"));
  const { ensureIAMinimal } = require("../../ensure-ia");
  await ensureIAMinimal(root);
  const intakeScript = path.resolve(__dirname, "../../intake.js");
  try {
    const r = spawnSync(
      process.execPath,
      [
        intakeScript,
        "--project",
        root,
        "--task",
        "descrição longa o suficiente para evitar task_description_short no discovery.",
        "--skip-llm",
      ],
      { encoding: "utf-8", maxBuffer: 2_000_000 },
    );
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    const out = String(r.stdout || "");
    assert.ok(out.includes("Run id:"));
    assert.ok(out.includes("Classification:"));
    assert.ok(out.includes("Output dir:"));
    assert.ok(out.includes("run-context.json"));
    assert.ok(out.includes("intake-manifest.json"));
    const m = out.match(/Run id:\s+(\S+)/);
    if (m) {
      const { resolveRunIndexPath } = require("../../../core/run-resolver");
      const idx = resolveRunIndexPath(m[1]);
      if (fs.existsSync(idx)) fs.unlinkSync(idx);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
