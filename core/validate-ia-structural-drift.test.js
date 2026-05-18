"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  detectStructuralDrift,
  buildStructuralDriftFailure,
  ERROR_MESSAGE_STRUCTURAL_DRIFT,
} = require("./validate-ia-structural-drift");
const { REQUIRED_SEED_FILES } = require("./validate-project-knowledge-base");
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
      gitTrack(root, rel, "Version: 1.0\n# .IA\n");
    } else {
      gitTrack(root, rel);
    }
  }
  for (const rel of REQUIRED_INDEX_FILES) gitTrack(root, rel);
}

function gitLsFiles(root) {
  const out = execFileSync("git", ["-C", root, "ls-files", "--", "docs/.IA"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

test("detectStructuralDrift: sem drift", () => {
  const root = tmpRoot("sb-drift-ok-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const tracked = gitLsFiles(root);
  const d = detectStructuralDrift(root, tracked);
  assert.strictEqual(d.driftValid, true);
  assert.strictEqual(d.criticalDrift.length, 0);
  assert.strictEqual(d.legacyIaPath, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test("detectStructuralDrift: .IA legado coexistindo", () => {
  const root = tmpRoot("sb-drift-legacy-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  const d = detectStructuralDrift(root, gitLsFiles(root));
  assert.strictEqual(d.driftValid, false);
  assert.strictEqual(d.legacyIaPath, ".IA");
  assert.ok(d.criticalDrift.some((m) => m.includes("legada")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("detectStructuralDrift: bootstrap duplicado em prompts/", () => {
  const root = tmpRoot("sb-drift-boot-dup-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/prompts/bootstrap-discovery.md", "# dup\n");
  const d = detectStructuralDrift(root, gitLsFiles(root));
  assert.strictEqual(d.driftValid, false);
  assert.ok(
    d.duplicatedBootstrapPrompts.includes("docs/.IA/prompts/bootstrap-discovery.md"),
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test("detectStructuralDrift: bootstrap em pasta inválida", () => {
  const root = tmpRoot("sb-drift-boot-arch-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/architecture/bootstrap-extra.md", "# x\n");
  const d = detectStructuralDrift(root, gitLsFiles(root));
  assert.strictEqual(d.driftValid, false);
  assert.ok(
    d.duplicatedBootstrapPrompts.includes("docs/.IA/architecture/bootstrap-extra.md"),
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test("detectStructuralDrift: folder desconhecido warning", () => {
  const root = tmpRoot("sb-drift-unknown-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  fs.mkdirSync(path.join(root, "docs", ".IA", "sandbox"), { recursive: true });
  const d = detectStructuralDrift(root, gitLsFiles(root));
  assert.strictEqual(d.driftValid, true);
  assert.ok(d.unknownFolders.includes("docs/.IA/sandbox"));
  assert.ok(d.warnings.length > 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("detectStructuralDrift: root file inesperado warning", () => {
  const root = tmpRoot("sb-drift-root-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  fs.writeFileSync(path.join(root, "docs", ".IA", "scratch.md"), "# s\n", "utf-8");
  const d = detectStructuralDrift(root, gitLsFiles(root));
  assert.strictEqual(d.driftValid, true);
  assert.ok(d.unexpectedRootFiles.includes("docs/.IA/scratch.md"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("detectStructuralDrift: domínio opcional sem index warning", () => {
  const root = tmpRoot("sb-drift-opt-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  fs.mkdirSync(path.join(root, "docs", ".IA", "decisions"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", ".IA", "decisions", "adr-1.md"),
    "# adr\n",
    "utf-8",
  );
  const d = detectStructuralDrift(root, gitLsFiles(root));
  assert.strictEqual(d.driftValid, true);
  assert.ok(d.warnings.some((w) => w.includes("index-decisions.md")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("buildStructuralDriftFailure: erro STRUCTURAL_DRIFT", () => {
  const drift = {
    driftValid: false,
    criticalDrift: ["teste crítico"],
    warnings: [],
    unknownFolders: [],
    unexpectedRootFiles: [],
    legacyIaPath: ".IA",
    duplicatedBootstrapPrompts: ["docs/.IA/prompts/bootstrap-create.md"],
  };
  const err = buildStructuralDriftFailure(drift, "/tmp/docs/.IA");
  assert.strictEqual(err.code, "KNOWLEDGE_BASE_STRUCTURAL_DRIFT");
  assert.strictEqual(err.message, ERROR_MESSAGE_STRUCTURAL_DRIFT);
  assert.strictEqual(err.driftValid, false);
  assert.ok(err.details?.driftValidation);
});
