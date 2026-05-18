"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  buildIntakeManifest,
  validateIntakeArtifacts,
  INTAKE_MANIFEST_ARTIFACT_SPECS,
} = require("./intake-manifest");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-mf-"));
}

test("buildIntakeManifest lista artefactos e flags required/exists", () => {
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, "metadata.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "run-context.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-context-summary.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-discovery-analysis.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-classification.json"), "{}", "utf-8");

    const m = buildIntakeManifest({
      runId: "rid",
      runType: "intake",
      generatedAt: "2026-01-01T00:00:00.000Z",
      classification: "needs_context",
      llmStatus: "skipped",
      outputDir: dir,
    });

    assert.strictEqual(m.schema_version, "1.0.0");
    assert.strictEqual(m.run_id, "rid");
    assert.strictEqual(m.status, "classified");
    assert.strictEqual(m.classification, "needs_context");
    assert.strictEqual(m.artifacts.length, INTAKE_MANIFEST_ARTIFACT_SPECS.length);

    const names = m.artifacts.map((a) => a.name).sort();
    const expected = INTAKE_MANIFEST_ARTIFACT_SPECS.map((s) => s.name).sort();
    assert.deepStrictEqual(names, expected);

    const td = m.artifacts.find((a) => a.name === "task-discovery.md");
    assert.strictEqual(td.required, false);
    assert.strictEqual(td.exists, false);

    const meta = m.artifacts.find((a) => a.name === "metadata.json");
    assert.strictEqual(meta.required, true);
    assert.strictEqual(meta.exists, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildIntakeManifest com LLM completed exige markdowns", () => {
  const dir = tmp();
  try {
    for (const n of [
      "metadata.json",
      "run-context.json",
      "intake-context-summary.json",
      "intake-discovery-analysis.json",
      "intake-classification.json",
      "task-discovery.md",
      "task-plan-initial.md",
    ]) {
      fs.writeFileSync(path.join(dir, n), "x", "utf-8");
    }

    const m = buildIntakeManifest({
      runId: "r",
      runType: "intake",
      generatedAt: "2026-01-01T00:00:00.000Z",
      classification: "ready_for_clarification",
      llmStatus: "completed",
      outputDir: dir,
    });

    const td = m.artifacts.find((a) => a.name === "task-discovery.md");
    const tp = m.artifacts.find((a) => a.name === "task-plan-initial.md");
    assert.strictEqual(td.required, true);
    assert.strictEqual(tp.required, true);
    assert.strictEqual(td.exists, true);
    assert.strictEqual(tp.exists, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validateIntakeArtifacts passa com conjunto mínimo válido (LLM skipped)", () => {
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, "metadata.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-context-summary.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-discovery-analysis.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-classification.json"), "{}", "utf-8");
    fs.writeFileSync(
      path.join(dir, "run-context.json"),
      JSON.stringify({
        phase1: { llm: { status: "skipped" } },
      }),
      "utf-8",
    );
    fs.writeFileSync(path.join(dir, "intake-manifest.json"), "{}", "utf-8");

    const v = validateIntakeArtifacts(dir);
    assert.strictEqual(v.ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validateIntakeArtifacts falha sem metadata.json", () => {
  const dir = tmp();
  try {
    fs.writeFileSync(
      path.join(dir, "run-context.json"),
      JSON.stringify({ phase1: { llm: { status: "skipped" } } }),
      "utf-8",
    );
    fs.writeFileSync(path.join(dir, "intake-manifest.json"), "{}", "utf-8");

    const v = validateIntakeArtifacts(dir);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors && v.errors.some((e) => e.includes("metadata.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validateIntakeArtifacts falha sem markdowns quando LLM completed", () => {
  const dir = tmp();
  try {
    for (const n of [
      "metadata.json",
      "intake-context-summary.json",
      "intake-discovery-analysis.json",
      "intake-classification.json",
    ]) {
      fs.writeFileSync(path.join(dir, n), "{}", "utf-8");
    }
    fs.writeFileSync(
      path.join(dir, "run-context.json"),
      JSON.stringify({ phase1: { llm: { status: "completed" } } }),
      "utf-8",
    );
    fs.writeFileSync(path.join(dir, "intake-manifest.json"), "{}", "utf-8");

    const v = validateIntakeArtifacts(dir);
    assert.strictEqual(v.ok, false);
    assert.ok(
      v.errors &&
        (v.errors.some((e) => e.includes("task-discovery.md")) ||
          v.errors.some((e) => e.includes("task-plan-initial.md"))),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validateIntakeArtifacts exige intake-manifest.json", () => {
  const dir = tmp();
  try {
    for (const n of [
      "metadata.json",
      "run-context.json",
      "intake-context-summary.json",
      "intake-discovery-analysis.json",
      "intake-classification.json",
    ]) {
      fs.writeFileSync(path.join(dir, n), "{}", "utf-8");
    }
    const v = validateIntakeArtifacts(dir);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors && v.errors.some((e) => e.includes("intake-manifest.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("manifest JSON não incorpora corpo de ficheiros grandes", () => {
  const dir = tmp();
  const blob = "X".repeat(50000);
  try {
    fs.writeFileSync(path.join(dir, "metadata.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "run-context.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-context-summary.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-discovery-analysis.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-classification.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir, "task-discovery.md"), blob, "utf-8");
    fs.writeFileSync(path.join(dir, "task-plan-initial.md"), blob, "utf-8");

    const m = buildIntakeManifest({
      runId: "r",
      runType: "intake",
      generatedAt: "2026-01-01T00:00:00.000Z",
      classification: "ready_for_clarification",
      llmStatus: "completed",
      outputDir: dir,
    });
    const s = JSON.stringify(m);
    assert.ok(s.length < 8000, "manifest deve ser só metadados");
    assert.ok(!s.includes(blob.slice(0, 100)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
