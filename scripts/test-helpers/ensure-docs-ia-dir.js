"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

/**
 * @param {string} root
 */
function initGitRepo(root) {
  const abs = path.resolve(root);
  if (!fs.existsSync(path.join(abs, ".git"))) {
    execFileSync("git", ["init"], { cwd: abs, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "test@setup-boss.local"], {
      cwd: abs,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Setup Boss Test"], {
      cwd: abs,
      stdio: "pipe",
    });
  }
}

/**
 * @param {string} root
 * @param {string} relPath
 * @param {string} [content]
 */
function gitTrackFile(root, relPath, content = "# Project IA\n") {
  const abs = path.resolve(root);
  const full = path.join(abs, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, content, "utf-8");
  }
  initGitRepo(abs);
  execFileSync("git", ["add", "--", relPath], { cwd: abs, stdio: "pipe" });
  try {
    execFileSync("git", ["commit", "-m", "test: track docs/.IA"], {
      cwd: abs,
      stdio: "pipe",
    });
  } catch {
    /* working tree clean */
  }
}

/** SPEC v1.0 — seed mínimo obrigatório. */
const REQUIRED_SEED_REL_PATHS = [
  "docs/.IA/index.md",
  "docs/.IA/system/seed-rules.md",
  "docs/.IA/system/bootstrap-discovery.md",
  "docs/.IA/system/bootstrap-create.md",
];

/** SPEC v1.0 — indexes obrigatórios por domínio core. */
const GOVERNANCE_INDEX_REL_PATHS = [
  "docs/.IA/system/index-system.md",
  "docs/.IA/architecture/index-architecture.md",
  "docs/.IA/environment/index-environment.md",
  "docs/.IA/standards/index-standards.md",
  "docs/.IA/prompts/index-prompts.md",
];

/**
 * Cria e versiona o seed mínimo obrigatório da `.IA`.
 * @param {string} projectRoot
 * @param {{ gitTrack?: boolean }} [options]
 */
function ensureRequiredKnowledgeSeed(projectRoot, options = {}) {
  const gitTrack = options.gitTrack !== false;
  const root = path.resolve(projectRoot);
  for (const rel of REQUIRED_SEED_REL_PATHS) {
    const full = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!fs.existsSync(full)) {
      const content =
        rel === "docs/.IA/index.md"
          ? "Version: 1.0\n# .IA\n"
          : `# ${path.basename(rel)}\n`;
      fs.writeFileSync(full, content, "utf-8");
    }
    if (gitTrack) {
      gitTrackFile(projectRoot, rel);
    }
  }
}

/**
 * Cria domínios core e indexes governados (SPEC v1.0).
 * @param {string} projectRoot
 * @param {{ gitTrack?: boolean }} [options]
 */
function ensureGovernanceStructure(projectRoot, options = {}) {
  const gitTrack = options.gitTrack !== false;
  const root = path.resolve(projectRoot);
  for (const rel of GOVERNANCE_INDEX_REL_PATHS) {
    const full = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, `# ${path.basename(rel)}\n`, "utf-8");
    }
    if (gitTrack) {
      gitTrackFile(projectRoot, rel);
    }
  }
}

/**
 * Cria `docs/.IA` com seed + estrutura governada versionados no Git.
 * @param {string} projectRoot
 * @param {{ gitTrack?: boolean }} [options]
 * @returns {string} caminho absoluto de docs/.IA
 */
function ensureDocsIaDir(projectRoot, options = {}) {
  const p = path.join(path.resolve(projectRoot), "docs", ".IA");
  fs.mkdirSync(p, { recursive: true });
  ensureRequiredKnowledgeSeed(projectRoot, options);
  ensureGovernanceStructure(projectRoot, options);
  return p;
}

module.exports = {
  ensureDocsIaDir,
  ensureRequiredKnowledgeSeed,
  ensureGovernanceStructure,
  REQUIRED_SEED_REL_PATHS,
  GOVERNANCE_INDEX_REL_PATHS,
  initGitRepo,
  gitTrackFile,
};
