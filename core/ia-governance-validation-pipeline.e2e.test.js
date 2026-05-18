"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  validateProjectKnowledgeBase,
  REQUIRED_SEED_FILES,
} = require("./validate-project-knowledge-base");
const { REQUIRED_INDEX_FILES } = require("./validate-ia-governance-structure");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "Setup Boss Test"], {
    cwd: root,
    stdio: "pipe",
  });
}

const INDEX_MD = "Version: 1.0\n# .IA\n";

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "test"], { cwd: root, stdio: "pipe" });
}

function gitTrackCompliantIa(root) {
  for (const rel of REQUIRED_SEED_FILES) {
    if (rel === "docs/.IA/index.md") {
      gitTrack(root, rel, INDEX_MD);
    } else {
      gitTrack(root, rel);
    }
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
}

function assertSnapshot(r, expectOk) {
  assert.ok(r.validationSnapshot, "validationSnapshot ausente");
  assert.strictEqual(r.validationSnapshot.ok, expectOk);
  assert.ok(Array.isArray(r.validationSnapshot.stages));
  assert.ok(r.validationSnapshot.stages.length >= 1);
  assert.ok(typeof r.validationSnapshot.validationDurationMs === "number");
}

test("E2E pipeline: .IA válida completa", () => {
  const root = tmpRoot("sb-e2e-ok-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, true);
  assertSnapshot(r, true);
  assert.strictEqual(r.validationSnapshot.failedStage, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test("E2E pipeline: invalid seed", () => {
  const root = tmpRoot("sb-e2e-seed-");
  initGitRepo(root);
  gitTrack(root, "docs/.IA/index.md", INDEX_MD);
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_INVALID_SEED");
  assertSnapshot(r, false);
  assert.strictEqual(r.validationSnapshot.failedStage, "seed");
  fs.rmSync(root, { recursive: true, force: true });
});

test("E2E pipeline: unsupported version", () => {
  const root = tmpRoot("sb-e2e-ver-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/index.md", "Version: 2.0\n");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_UNSUPPORTED_VERSION");
  assert.strictEqual(r.validationSnapshot.failedStage, "version");
  fs.rmSync(root, { recursive: true, force: true });
});

test("E2E pipeline: structural drift", () => {
  const root = tmpRoot("sb-e2e-drift-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const legacy = path.join(root, ".IA");
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "index.md"), "# legacy\n", "utf-8");
  execFileSync("git", ["add", "--", ".IA/index.md"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "legacy"], { cwd: root, stdio: "pipe" });
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_STRUCTURAL_DRIFT");
  assert.strictEqual(r.validationSnapshot.failedStage, "drift");
  fs.rmSync(root, { recursive: true, force: true });
});

test("E2E pipeline: secret bloqueia", () => {
  const root = tmpRoot("sb-e2e-secret-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/environment/access.md", "password = FakeSecret123!\n");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_SENSITIVE_DATA");
  assert.strictEqual(r.validationSnapshot.failedStage, "policy");
  fs.rmSync(root, { recursive: true, force: true });
});
