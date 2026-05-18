"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const { URL } = require("url");
const {
  normalizeGitRemoteUrl,
  safeDirectorySlugFromUrl,
  resolveUnderManagedRoot,
  assertSafeRelativeDirSegment,
} = require("./project-git-register");

test("normalizeGitRemoteUrl: GitHub HTTPS", () => {
  const r = normalizeGitRemoteUrl("https://github.com/org/repo.git");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.strictEqual(r.remote.kind, "https");
  assert.strictEqual(r.remote.provider, "github");
});

test("normalizeGitRemoteUrl: Bitbucket HTTPS com utilizador", () => {
  const r = normalizeGitRemoteUrl(
    "https://jean.pierre@bitbucket.org/systemwiser/wiser-bot-front.git",
  );
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.strictEqual(r.remote.kind, "https");
  assert.strictEqual(r.remote.provider, "bitbucket");
});

test("normalizeGitRemoteUrl: SSH estilo scp Bitbucket", () => {
  const r = normalizeGitRemoteUrl("git@bitbucket.org:systemwiser/wiser-bot-front.git");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.strictEqual(r.remote.kind, "ssh");
  assert.strictEqual(r.remote.pathSegments.join("/"), "systemwiser/wiser-bot-front");
});

test("normalizeGitRemoteUrl: SSH GitHub", () => {
  const r = normalizeGitRemoteUrl("git@github.com:org/repo.git");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.strictEqual(r.remote.kind, "ssh");
});

test("normalizeGitRemoteUrl: vazio", () => {
  const r = normalizeGitRemoteUrl("  ");
  assert.strictEqual(r.ok, false);
  if (r.ok) return;
  assert.strictEqual(r.error, "repo_url_vazio");
});

test("normalizeGitRemoteUrl: host não permitido", () => {
  const r = normalizeGitRemoteUrl("https://evil.com/a/b.git");
  assert.strictEqual(r.ok, false);
  if (r.ok) return;
  assert.strictEqual(r.error, "host_git_nao_permitido");
});

test("safeDirectorySlugFromUrl: estável e sem separadores de caminho", () => {
  const u = new URL("https://github.com/foo/bar.git");
  const slug = safeDirectorySlugFromUrl(u);
  assert.match(slug, /^[a-z0-9._-]+$/i);
  assert.ok(!slug.includes("/"));
  assert.ok(!slug.includes("\\"));
});

test("resolveUnderManagedRoot: bloqueia fuga com ..", () => {
  const root = path.join(os.tmpdir(), "sb-managed-root-test");
  assert.throws(
    () => resolveUnderManagedRoot(root, ".."),
    (e) => Boolean(e && typeof e === "object" && "code" in e && e.code === "path_traversal"),
  );
});

test("assertSafeRelativeDirSegment: rejeita separadores", () => {
  assert.throws(
    () => assertSafeRelativeDirSegment("a/b"),
    (e) => Boolean(e && typeof e === "object" && "code" in e && e.code === "nome_pasta_invalido"),
  );
});
