"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  validateGovernanceStructure,
  validateBootstrapPromptOwnership,
  buildInvalidStructureFailure,
  buildBootstrapOwnershipFailure,
  REQUIRED_INDEX_FILES,
  REQUIRED_DIRECTORIES,
  ERROR_MESSAGE_INVALID_STRUCTURE,
  ERROR_MESSAGE_BOOTSTRAP_OWNERSHIP,
} = require("./validate-ia-governance-structure");
const { REQUIRED_SEED_FILES } = require("./validate-project-knowledge-base");

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

test("validateGovernanceStructure: estrutura core completa", () => {
  const root = tmpRoot("sb-gov-ok-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const tracked = execFileSync("git", ["ls-files", "--", "docs/.IA"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const r = validateGovernanceStructure(root, tracked);
  assert.strictEqual(r.structureValid, true);
  assert.strictEqual(r.missingDirectories.length, 0);
  assert.strictEqual(r.missingIndexFiles.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateGovernanceStructure: domínio architecture em falta", () => {
  const root = tmpRoot("sb-gov-noarch-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  fs.rmSync(path.join(root, "docs", ".IA", "architecture"), {
    recursive: true,
    force: true,
  });
  const tracked = execFileSync("git", ["ls-files", "--", "docs/.IA"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((p) => !p.startsWith("docs/.IA/architecture/"));
  const r = validateGovernanceStructure(root, tracked);
  assert.strictEqual(r.structureValid, false);
  assert.ok(r.missingDirectories.includes("docs/.IA/architecture"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateGovernanceStructure: index-prompts.md em falta", () => {
  const root = tmpRoot("sb-gov-noidx-");
  initGitRepo(root);
  for (const rel of [...REQUIRED_SEED_FILES, ...REQUIRED_INDEX_FILES]) {
    if (rel !== "docs/.IA/prompts/index-prompts.md") gitTrack(root, rel);
  }
  const tracked = execFileSync("git", ["ls-files", "--", "docs/.IA"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const r = validateGovernanceStructure(root, tracked);
  assert.strictEqual(r.structureValid, false);
  assert.ok(r.missingIndexFiles.includes("docs/.IA/prompts/index-prompts.md"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateGovernanceStructure: múltiplos indexes em falta", () => {
  const root = tmpRoot("sb-gov-multi-");
  initGitRepo(root);
  const skip = new Set([
    "docs/.IA/standards/index-standards.md",
    "docs/.IA/prompts/index-prompts.md",
  ]);
  for (const rel of [...REQUIRED_SEED_FILES, ...REQUIRED_INDEX_FILES]) {
    if (!skip.has(rel)) gitTrack(root, rel);
  }
  const tracked = execFileSync("git", ["ls-files", "--", "docs/.IA"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const r = validateGovernanceStructure(root, tracked);
  assert.strictEqual(r.missingIndexFiles.length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateBootstrapPromptOwnership: bootstrap em prompts/ é inválido", () => {
  const root = tmpRoot("sb-gov-boot-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/prompts/bootstrap-discovery.md");
  const tracked = execFileSync("git", ["ls-files", "--", "docs/.IA"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const r = validateBootstrapPromptOwnership(root, tracked);
  assert.strictEqual(r.ownershipValid, false);
  assert.ok(r.invalidBootstrapFiles.includes("docs/.IA/prompts/bootstrap-discovery.md"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("buildInvalidStructureFailure: erro estruturado", () => {
  const failure = buildInvalidStructureFailure(
    {
      valid: false,
      structureValid: false,
      missingDirectories: ["docs/.IA/architecture"],
      missingIndexFiles: ["docs/.IA/prompts/index-prompts.md"],
      requiredDirectories: [...REQUIRED_DIRECTORIES],
      requiredIndexFiles: [...REQUIRED_INDEX_FILES],
    },
    "/tmp/docs/.IA",
  );
  assert.strictEqual(failure.code, "KNOWLEDGE_BASE_INVALID_STRUCTURE");
  assert.strictEqual(failure.message, ERROR_MESSAGE_INVALID_STRUCTURE);
  assert.ok(failure.missingDirectories.length === 1);
});

test("buildBootstrapOwnershipFailure: erro estruturado", () => {
  const failure = buildBootstrapOwnershipFailure(
    {
      valid: false,
      ownershipValid: false,
      invalidBootstrapFiles: ["docs/.IA/prompts/bootstrap-create.md"],
      allowedBootstrapFiles: [
        "docs/.IA/system/bootstrap-discovery.md",
        "docs/.IA/system/bootstrap-create.md",
      ],
    },
    "/tmp/docs/.IA",
  );
  assert.strictEqual(failure.code, "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION");
  assert.strictEqual(failure.message, ERROR_MESSAGE_BOOTSTRAP_OWNERSHIP);
});
