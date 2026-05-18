"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { buildIaGovernanceValidationContext } = require("./ia-governance-validation-context");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("buildIaGovernanceValidationContext: preload único por ficheiro", () => {
  const root = tmpRoot("sb-ctx-");
  const rel = "docs/.IA/system/seed-rules.md";
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "# Seed\n\nEnglish documentation.\n", "utf-8");

  const ctx = buildIaGovernanceValidationContext(root, [rel]);
  assert.strictEqual(ctx.trackedFiles.length, 1);
  assert.strictEqual(ctx.fileContents[rel]?.includes("English"), true);
  assert.strictEqual(ctx.getFileContent(rel), ctx.fileContents[rel]);
  assert.ok(ctx.metrics.contentLoadMs >= 0);
  fs.rmSync(root, { recursive: true, force: true });
});
