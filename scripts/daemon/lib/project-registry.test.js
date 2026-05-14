"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  deriveProjectId,
  canonicalProjectRoot,
  resolveProjectSelector,
} = require("./project-registry");

test("deriveProjectId: mesmo root canónico => mesmo id (abs vs rel)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-proj-"));
  const base = path.join(dir, "myapp");
  fs.mkdirSync(base, { recursive: true });
  try {
    const abs = path.resolve(base);
    const rel = path.join(dir, "myapp", "..", "myapp");
    assert.strictEqual(canonicalProjectRoot(abs), canonicalProjectRoot(rel));
    assert.strictEqual(deriveProjectId(abs), deriveProjectId(rel));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectSelector: path relativo e absoluto convergem", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sel-"));
  const sub = path.join(dir, "w");
  fs.mkdirSync(sub, { recursive: true });
  try {
    const a = resolveProjectSelector(sub, dir);
    const b = resolveProjectSelector("w", dir);
    assert.ok(a.projectId);
    assert.strictEqual(a.projectId, b.projectId);
    assert.strictEqual(a.projectRootCanonical, b.projectRootCanonical);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
