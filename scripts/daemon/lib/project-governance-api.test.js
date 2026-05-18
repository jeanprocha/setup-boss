"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveGovernanceProject } = require("./project-governance-api");
const { deriveProjectId, canonicalProjectRoot } = require("./project-registry");

function withIsolatedDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-api-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  try {
    fn({ repo, dataDir });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

test("resolveGovernanceProject: projectId derivado com registry legado", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const projectRoot = path.join(repo, "demo-gov");
    fs.mkdirSync(projectRoot, { recursive: true });
    const derivedId = deriveProjectId(projectRoot);

    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            projectId: "proj_legacy_stale",
            projectRoot,
            displayName: "demo-gov",
            firstSeenAt: "2020-01-01T00:00:00.000Z",
            lastSeenAt: "2025-01-01T00:00:00.000Z",
            lastJobId: null,
            jobCounts: {},
            metadata: {},
          },
        ],
      }),
      "utf-8",
    );

    const r = resolveGovernanceProject(derivedId, { repoRoot: repo, jobs: [] });
    assert.strictEqual(r.ok, true);
    if (!r.ok) return;
    assert.strictEqual(r.projectId, derivedId);
    assert.strictEqual(r.projectRootCanonical, canonicalProjectRoot(projectRoot));
    assert.ok(r.match === "derived_id" || r.match === "exact_id");
  });
});

test("resolveGovernanceProject: projectId exato no registry", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const projectRoot = path.join(repo, "exact-gov");
    fs.mkdirSync(projectRoot, { recursive: true });
    const exactId = deriveProjectId(projectRoot);

    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            projectId: exactId,
            projectRoot,
            displayName: "exact-gov",
            firstSeenAt: "2020-01-01T00:00:00.000Z",
            lastSeenAt: "2025-01-01T00:00:00.000Z",
            lastJobId: null,
            jobCounts: {},
            metadata: {},
          },
        ],
      }),
      "utf-8",
    );

    const r = resolveGovernanceProject(exactId, { repoRoot: repo, jobs: [] });
    assert.strictEqual(r.ok, true);
    if (!r.ok) return;
    assert.strictEqual(r.projectId, exactId);
    assert.strictEqual(r.match, "exact_id");
  });
});

test("resolveGovernanceProject: projectId inexistente", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({ schemaVersion: 1, projects: [] }),
      "utf-8",
    );

    const missingId = "proj_deadbeef";
    const r = resolveGovernanceProject(missingId, {
      repoRoot: repo,
      jobs: [],
    });
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, "PROJECT_NOT_FOUND");
    assert.strictEqual(r.error.projectId, missingId);
    assert.ok(Array.isArray(r.error.suggestedActions));
    assert.ok(r.error.suggestedActions.length >= 2);
  });
});
