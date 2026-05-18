"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const { ROOT_DIR } = require("./run-resolver");
const { resolveTargetProjectRoot } = require("./resolve-target-project-root");
const {
  validateProjectKnowledgeBase,
  bootstrapProjectKnowledgeBase,
  validateRequiredKnowledgeSeed,
  resolveDocsIaPath,
  REQUIRED_SEED_FILES,
  ERROR_WRONG_DOCS_IA_DESCRIPTION,
  ERROR_MESSAGE_MISSING,
  ERROR_MESSAGE_UNTRACKED,
  ERROR_MESSAGE_IGNORED,
  ERROR_MESSAGE_INVALID_SEED,
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

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "test"], { cwd: root, stdio: "pipe" });
}

function gitTrackRequiredSeed(root) {
  for (const rel of REQUIRED_SEED_FILES) {
    if (rel === "docs/.IA/index.md") {
      gitTrack(root, rel, INDEX_MD_WITH_VERSION);
    } else {
      gitTrack(root, rel);
    }
  }
}

const INDEX_MD_WITH_VERSION = "Version: 1.0\n# .IA\n";

function gitTrackCompliantIa(root) {
  for (const rel of REQUIRED_SEED_FILES) {
    if (rel === "docs/.IA/index.md") {
      gitTrack(root, rel, INDEX_MD_WITH_VERSION);
    } else {
      gitTrack(root, rel);
    }
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
}

test("resolveTargetProjectRoot: rejeita root igual ao Setup-Boss", () => {
  const r = resolveTargetProjectRoot(ROOT_DIR, { setupBossRoot: ROOT_DIR });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "PROJECT_ROOT_UNRESOLVED");
});

test("validateProjectKnowledgeBase: falha sem docs/.IA", () => {
  const root = tmpRoot("sb-kb-miss-");
  initGitRepo(root);
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_MISSING");
  assert.strictEqual(r.phase, "knowledge_bootstrap_missing");
  assert.strictEqual(r.message, ERROR_MESSAGE_MISSING);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: index sem Version => VERSION_MISSING", () => {
  const root = tmpRoot("sb-kb-ver-miss-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const indexPath = path.join(root, "docs", ".IA", "index.md");
  fs.writeFileSync(indexPath, "# sem versão\n", "utf-8");
  execFileSync("git", ["add", "--", "docs/.IA/index.md"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "drop version"], { cwd: root, stdio: "pipe" });
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_VERSION_MISSING");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: Version 2.0 => UNSUPPORTED_VERSION", () => {
  const root = tmpRoot("sb-kb-ver-20-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/index.md", "Version: 2.0\n");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_UNSUPPORTED_VERSION");
  assert.strictEqual(r.specVersion, "2.0");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: fake password bloqueia policy", () => {
  const root = tmpRoot("sb-kb-policy-pwd-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/environment/access.md", "password = FakeSecret123!\n");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_SENSITIVE_DATA");
  assert.strictEqual(r.phase, "validate_knowledge_content_policy");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: passa com seed e estrutura governada", () => {
  const root = tmpRoot("sb-kb-ok-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.phase, "knowledge_bootstrap_ready");
  assert.strictEqual(r.seedValid, true);
  assert.strictEqual(r.structureValid, true);
  assert.strictEqual(r.iaDir, resolveDocsIaPath(root));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: seed ok sem architecture => INVALID_STRUCTURE", () => {
  const root = tmpRoot("sb-kb-gov-miss-arch-");
  initGitRepo(root);
  gitTrackRequiredSeed(root);
  for (const rel of REQUIRED_INDEX_FILES) {
    if (!rel.includes("/architecture/")) gitTrack(root, rel);
  }
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_INVALID_STRUCTURE");
  assert.ok(r.missingDirectories.includes("docs/.IA/architecture"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: bootstrap duplicado em prompts/", () => {
  const root = tmpRoot("sb-kb-gov-boot-dup-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/prompts/bootstrap-create.md", "# dup\n");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_STRUCTURAL_DRIFT");
  assert.ok(
    r.duplicatedBootstrapPrompts.includes("docs/.IA/prompts/bootstrap-create.md"),
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: .IA legado na raiz com docs/.IA", () => {
  const root = tmpRoot("sb-kb-drift-legacy-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  fs.writeFileSync(path.join(root, ".IA", "legacy.md"), "# legacy\n", "utf-8");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_STRUCTURAL_DRIFT");
  assert.strictEqual(r.legacyIaPath, ".IA");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: folder desconhecido => ok com warnings", () => {
  const root = tmpRoot("sb-kb-drift-unknown-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/experimental/readme.md", "# x\n");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.driftValid, true);
  assert.ok(r.driftWarnings.length > 0);
  assert.ok(r.details?.driftValidation?.unknownFolders?.includes("docs/.IA/experimental"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: ficheiro solto na raiz => ok com warnings", () => {
  const root = tmpRoot("sb-kb-drift-rootfile-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/notes-temp.md", "# temp\n");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, true);
  assert.ok(r.details?.driftValidation?.unexpectedRootFiles?.includes("docs/.IA/notes-temp.md"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: só index.md tracked => INVALID_SEED", () => {
  const root = tmpRoot("sb-kb-seed-partial-");
  initGitRepo(root);
  gitTrack(root, "docs/.IA/index.md");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_INVALID_SEED");
  assert.strictEqual(r.message, ERROR_MESSAGE_INVALID_SEED);
  assert.ok(Array.isArray(r.missingFiles));
  assert.ok(r.missingFiles.includes("docs/.IA/system/seed-rules.md"));
  assert.ok(r.missingFiles.includes("docs/.IA/system/bootstrap-discovery.md"));
  assert.ok(r.missingFiles.includes("docs/.IA/system/bootstrap-create.md"));
  fs.rmSync(root, { recursive: true, force: true });
});

for (const missingRel of [
  "docs/.IA/index.md",
  "docs/.IA/system/seed-rules.md",
  "docs/.IA/system/bootstrap-discovery.md",
  "docs/.IA/system/bootstrap-create.md",
]) {
  test(`validateProjectKnowledgeBase: seed sem ${missingRel}`, () => {
    const root = tmpRoot("sb-kb-seed-miss-");
    initGitRepo(root);
    for (const rel of REQUIRED_SEED_FILES) {
      if (rel !== missingRel) gitTrack(root, rel);
    }
    const r = validateProjectKnowledgeBase(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "KNOWLEDGE_BASE_INVALID_SEED");
    assert.ok(r.missingFiles.includes(missingRel));
    fs.rmSync(root, { recursive: true, force: true });
  });
}

test("validateRequiredKnowledgeSeed: resultado estruturado", () => {
  const root = tmpRoot("sb-kb-seed-struct-");
  initGitRepo(root);
  gitTrack(root, "docs/.IA/index.md");
  const seed = validateRequiredKnowledgeSeed(root, ["docs/.IA/index.md"]);
  assert.strictEqual(seed.valid, false);
  assert.strictEqual(seed.seedValid, false);
  assert.deepStrictEqual(seed.requiredFiles, [...REQUIRED_SEED_FILES]);
  assert.ok(seed.missingFiles.length >= 3);
  assert.deepStrictEqual(seed.existingFiles, ["docs/.IA/index.md"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: docs/.IA local com ficheiros adicionáveis => UNTRACKED", () => {
  const root = tmpRoot("sb-kb-untracked-addable-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", ".IA", "index.md"), "# ok\n", "utf-8");
  fs.appendFileSync(path.join(root, ".gitignore"), "docs/.IA/\n", "utf-8");
  gitTrack(root, ".gitignore");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_UNTRACKED");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: rejeita docs/.IA só local (não tracked)", () => {
  const root = tmpRoot("sb-kb-untracked-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_UNTRACKED");
  assert.strictEqual(r.phase, "knowledge_bootstrap_untracked");
  assert.strictEqual(r.message, ERROR_MESSAGE_UNTRACKED);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: rejeita docs/.IA ignorada", () => {
  const root = tmpRoot("sb-kb-ignored-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", ".IA", "index.md"), "# x\n", "utf-8");
  fs.appendFileSync(
    path.join(root, ".git", "info", "exclude"),
    "docs/.IA/index.md\n",
    "utf-8",
  );
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_IGNORED");
  assert.strictEqual(r.phase, "knowledge_bootstrap_ignored");
  assert.strictEqual(r.message, ERROR_MESSAGE_IGNORED);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: rejeita .IA na raiz sem docs/.IA", () => {
  const root = tmpRoot("sb-kb-leg-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_MISSING");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: rejeita docs/IA com fase wrong_path", () => {
  const root = tmpRoot("sb-kb-wrong-ia-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs", "IA"), { recursive: true });
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_WRONG_PATH");
  assert.strictEqual(r.phase, "knowledge_bootstrap_wrong_path");
  assert.strictEqual(r.wrongFolder, "docs/IA");
  assert.ok(r.description.includes("docs/IA"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: rejeita docs/ia e docs/Ia", () => {
  for (const segment of ["ia", "Ia"]) {
    const root = tmpRoot(`sb-kb-wrong-${segment}-`);
    initGitRepo(root);
    fs.mkdirSync(path.join(root, "docs", segment), { recursive: true });
    const r = validateProjectKnowledgeBase(root);
    assert.strictEqual(r.ok, false, `segmento ${segment}`);
    assert.strictEqual(r.phase, "knowledge_bootstrap_wrong_path", `segmento ${segment}`);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateProjectKnowledgeBase: rejeita docs/.IA quando é ficheiro", () => {
  const root = tmpRoot("sb-kb-dotia-file-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", ".IA"), "not-a-dir", "utf-8");
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.ok(r.description.includes("ficheiro"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: docs/.IA tracked tem prioridade sobre docs/IA", () => {
  const root = tmpRoot("sb-kb-both-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs", "IA"), { recursive: true });
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: projeto sem Git com docs/.IA local falha", () => {
  const root = tmpRoot("sb-kb-nogit-");
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  const r = validateProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_NOT_GIT");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: setup-boss com docs/.IA não valida projecto-alvo vazio", () => {
  const setupBoss = tmpRoot("sb-kb-sb-");
  const target = tmpRoot("sb-kb-target-");
  initGitRepo(setupBoss);
  fs.mkdirSync(path.join(setupBoss, "docs", ".IA"), { recursive: true });
  gitTrackCompliantIa(setupBoss);

  const r = validateProjectKnowledgeBase(target, { setupBossRoot: setupBoss });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_MISSING");

  fs.rmSync(setupBoss, { recursive: true, force: true });
  fs.rmSync(target, { recursive: true, force: true });
});

test("validateProjectKnowledgeBase: bloqueia projectRoot igual ao Setup-Boss", () => {
  const root = tmpRoot("sb-kb-same-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root, {
    setupBossRoot: root,
    forbidSetupBossRoot: true,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "PROJECT_ROOT_UNRESOLVED");
  fs.rmSync(root, { recursive: true, force: true });
});

test("bootstrapProjectKnowledgeBase espelha validação tracked", () => {
  const root = tmpRoot("sb-kb-boot-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = bootstrapProjectKnowledgeBase(root);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.phase, "knowledge_bootstrap_ready");
  fs.rmSync(root, { recursive: true, force: true });
});
