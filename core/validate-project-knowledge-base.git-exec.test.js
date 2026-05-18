"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");
const { execFileSync } = cp;

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

function loadKbModule() {
  const resolved = require.resolve("./validate-project-knowledge-base");
  delete require.cache[resolved];
  return require("./validate-project-knowledge-base");
}

test("gitExecFileSync: todas as chamadas Git usam windowsHide: true", (t) => {
  const root = tmpRoot("sb-kb-git-opts-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", ".IA", "a.md"), "# a\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", ".IA", "b.md"), "# b\n", "utf-8");

  /** @type {Array<{ file: string, args: string[], opts: Record<string, unknown> }>} */
  const gitCalls = [];
  const mock = t.mock.method(cp, "execFileSync", (file, args, opts) => {
    const f = String(file);
    const a = /** @type {string[]} */ (args);
    const o = /** @type {Record<string, unknown>} */ (opts || {});
    if (f === "git") {
      gitCalls.push({ file: f, args: a, opts: o });
      if (a.includes("rev-parse")) return Buffer.from(".git\n");
      if (a.includes("ls-files")) return Buffer.from("");
      if (a.includes("check-ignore")) {
        assert.ok(a.includes("--"));
        const paths = a.slice(a.indexOf("--") + 1);
        assert.ok(paths.length >= 2, "check-ignore deve ser em lote");
        return Buffer.from(`${paths[0]}\n`);
      }
    }
    return execFileSync(file, args, opts);
  });

  try {
    const { validateProjectKnowledgeBase } = loadKbModule();
    const r = validateProjectKnowledgeBase(root);
    assert.strictEqual(r.code, "KNOWLEDGE_BASE_UNTRACKED");
    assert.ok(gitCalls.length >= 3, "rev-parse + ls-files + check-ignore");
    const checkIgnore = gitCalls.filter((c) => c.args.includes("check-ignore"));
    assert.strictEqual(checkIgnore.length, 1, "um único check-ignore em lote");
    for (const c of gitCalls) {
      assert.strictEqual(c.opts.windowsHide, true, JSON.stringify(c.args));
    }
  } finally {
    mock.mock.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("gitCheckIgnoredPathsSet: classificação em lote alinhada com Git real", () => {
  const { gitCheckIgnoredPathsSet } = loadKbModule();
  const root = tmpRoot("sb-kb-batch-ignore-set-");
  initGitRepo(root);
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", ".IA", "index.md"), "# x\n", "utf-8");
  fs.appendFileSync(
    path.join(root, ".git", "info", "exclude"),
    "docs/.IA/index.md\n",
    "utf-8",
  );

  const ignored = gitCheckIgnoredPathsSet(root, [
    "docs/.IA/index.md",
    "docs/.IA/other.md",
  ]);
  assert.ok(ignored.has("docs/.IA/index.md"));
  assert.ok(!ignored.has("docs/.IA/other.md"));
  fs.rmSync(root, { recursive: true, force: true });
});
