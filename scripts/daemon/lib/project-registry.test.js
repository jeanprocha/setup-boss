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
  isDemoProjectRow,
  isUnderOsTempDir,
  buildProjectsOverview,
  demoProjectsEnabled,
  computePublicProjectsList,
  projectRootDedupKey,
  resolveProjectRecord,
  findProjectRecord,
  reconcileProjectsRegistry,
  loadProjectsUnsafe,
} = require("./project-registry");

function withIsolatedDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-prj-"));
  const dataDir = path.join(repo, "sb-data");
  const managedDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-managed-"));
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  const prevManaged = process.env.SETUP_BOSS_PROJECTS_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  process.env.SETUP_BOSS_PROJECTS_DIR = managedDir;
  try {
    fn({ repo, dataDir, managedDir });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    if (prevManaged === undefined) delete process.env.SETUP_BOSS_PROJECTS_DIR;
    else process.env.SETUP_BOSS_PROJECTS_DIR = prevManaged;
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(managedDir, { recursive: true, force: true });
  }
}

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

test("isDemoProjectRow: demo-no-plan e pastas sb-* em temp", () => {
  const prev = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  try {
    const tmpHarness = path.join(os.tmpdir(), "sb-exec-trigger-abc123");
    assert.strictEqual(
      isDemoProjectRow({
        projectId: "proj_x",
        projectRoot: tmpHarness,
        displayName: "sb-exec-trigger-abc123",
      }),
      true,
    );
    assert.strictEqual(
      isDemoProjectRow({
        projectId: "proj_y",
        projectRoot: path.join(os.tmpdir(), "sb-clar-no-plan-xyz", "demo-no-plan"),
        displayName: "demo-no-plan",
      }),
      true,
    );
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prev;
  }
});

test("isDemoProjectRow: demo, demo-project, demo-block (basename/displayName)", () => {
  const prev = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  try {
    assert.strictEqual(
      isDemoProjectRow({
        projectId: "proj_x",
        projectRoot: "/tmp/demo-project",
        displayName: "Other",
      }),
      true,
    );
    assert.strictEqual(
      isDemoProjectRow({
        projectId: "proj_y",
        projectRoot: "/repos/wiser-bot-api",
        displayName: "wiser-bot-api",
      }),
      false,
    );
    assert.strictEqual(
      isDemoProjectRow({
        projectId: "proj_z",
        projectRoot: "",
        displayName: "demo-project",
      }),
      true,
    );
    assert.strictEqual(
      isDemoProjectRow({
        projectId: "m",
        projectRoot: "/x/app",
        displayName: "normal",
        metadata: { source: { mode: "test-fixture" } },
      }),
      true,
    );
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prev;
  }
});

test("computePublicProjectsList: dedup por projectRoot + id derivado", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const wiser = path.join(repo, "wiser-bot-api");
    fs.mkdirSync(wiser, { recursive: true });
    const projectsPath = path.join(dataDir, "projects.json");
    fs.writeFileSync(
      projectsPath,
      JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            projectId: "wrong-id-1",
            projectRoot: wiser,
            displayName: "wiser-bot-api",
            firstSeenAt: "2020-01-01T00:00:00.000Z",
            lastSeenAt: "2025-01-01T00:00:00.000Z",
            lastJobId: null,
            jobCounts: {},
            metadata: {},
          },
          {
            projectId: "wrong-id-2",
            projectRoot: path.join(wiser, "..", "wiser-bot-api"),
            displayName: "wiser-alias",
            firstSeenAt: "2010-01-01T00:00:00.000Z",
            lastSeenAt: "2015-01-01T00:00:00.000Z",
            lastJobId: null,
            jobCounts: {},
            metadata: {},
          },
        ],
      }),
      "utf-8",
    );

    const expectId = deriveProjectId(wiser);
    const { projects, diagnostics } = computePublicProjectsList([]);
    assert.strictEqual(projects.length, 1);
    assert.strictEqual(projects[0].projectId, expectId);
    assert.strictEqual(projects[0].projectRoot, canonicalProjectRoot(wiser));
    assert.ok(
      diagnostics.registryDuplicatesMerged >= 1 ||
        projects.length === 1,
    );
  });
});

test("computePublicProjectsList: fila só entra com path existente; demo-project fora", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const wiser = path.join(repo, "wiser-bot-api");
    const demoP = path.join(repo, "demo-project");
    const ghost = path.join(repo, "ghost-missing");
    fs.mkdirSync(wiser, { recursive: true });
    fs.mkdirSync(demoP, { recursive: true });

    const projectsPath = path.join(dataDir, "projects.json");
    fs.writeFileSync(
      projectsPath,
      JSON.stringify({ schemaVersion: 1, projects: [] }),
      "utf-8",
    );

    const prevDemo = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    try {
      const jobs = [
        { projectRoot: demoP, status: "completed" },
        { projectRoot: ghost, status: "completed" },
        { projectRoot: wiser, status: "pending" },
      ];
      const { projects, diagnostics } = computePublicProjectsList(jobs);
      assert.strictEqual(projects.length, 1);
      assert.strictEqual(projects[0].displayName, "wiser-bot-api");
      assert.ok(diagnostics.removedStaleQueuePath >= 1);
      assert.ok(diagnostics.removedQueueOnlyAsDemo >= 1);
    } finally {
      if (prevDemo === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
      else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prevDemo;
    }
  });
});

test("computePublicProjectsList: com SETUP_BOSS_ENABLE_DEMO_PROJECTS=1 inclui demo-project na fila", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const demoP = path.join(repo, "demo-project");
    fs.mkdirSync(demoP, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({ schemaVersion: 1, projects: [] }),
      "utf-8",
    );
    const prev = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = "1";
    try {
      const { projects } = computePublicProjectsList([
        { projectRoot: demoP, status: "completed" },
      ]);
      assert.ok(projects.some((r) => path.basename(r.projectRoot) === "demo-project"));
    } finally {
      if (prev === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
      else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prev;
    }
  });
});

test("projectRootDedupKey: Windows usa comparação case-insensitive", () => {
  if (process.platform !== "win32") {
    assert.strictEqual(projectRootDedupKey("C:\\a\\b"), "C:\\a\\b");
    return;
  }
  const a = canonicalProjectRoot("C:\\Proj\\App");
  const b = canonicalProjectRoot("c:\\proj\\app");
  assert.strictEqual(projectRootDedupKey(a), projectRootDedupKey(b));
});

test("buildProjectsOverview: filtra demo salvo env não activa (paths reais)", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const prev = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    try {
      fs.writeFileSync(
        path.join(dataDir, "projects.json"),
        JSON.stringify({ schemaVersion: 1, projects: [] }),
        "utf-8",
      );
      const wiser = path.join(repo, "wiser-bot-api");
      const demoB = path.join(repo, "demo-block");
      fs.mkdirSync(wiser, { recursive: true });
      fs.mkdirSync(demoB, { recursive: true });
      const jobs = [
        { projectRoot: demoB, status: "completed" },
        { projectRoot: wiser, status: "pending" },
      ];
      const rows = buildProjectsOverview(jobs);
      assert.ok(rows.every((r) => !isDemoProjectRow(r)));
      assert.ok(rows.some((r) => r.displayName === "wiser-bot-api"));
    } finally {
      if (prev === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
      else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prev;
    }
  });
});

test("buildProjectsOverview: inclui demo com SETUP_BOSS_ENABLE_DEMO_PROJECTS=1", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const prev = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = "1";
    try {
      fs.writeFileSync(
        path.join(dataDir, "projects.json"),
        JSON.stringify({ schemaVersion: 1, projects: [] }),
        "utf-8",
      );
      const demoB = path.join(repo, "demo-block");
      fs.mkdirSync(demoB, { recursive: true });
      const jobs = [{ projectRoot: demoB, status: "completed" }];
      const rows = buildProjectsOverview(jobs);
      assert.ok(rows.some((r) => path.basename(r.projectRoot) === "demo-block"));
    } finally {
      if (prev === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
      else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prev;
    }
  });
});

test("computePublicProjectsList: inclui projectos em SETUP_BOSS_PROJECTS_DIR", () => {
  const prevDemo = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  withIsolatedDataDir(({ dataDir, managedDir }) => {
    const wiser = path.join(managedDir, "wiser-bot-api");
    fs.mkdirSync(wiser, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({ schemaVersion: 1, projects: [] }),
      "utf-8",
    );
    const { projects } = computePublicProjectsList([]);
    assert.ok(projects.some((p) => p.displayName === "wiser-bot-api"));
    assert.ok(projects.every((p) => !isDemoProjectRow(p)));
  });
  if (prevDemo === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prevDemo;
});

test("computePublicProjectsList: registo em temp/demo-no-plan não entra na lista", () => {
  const prevDemo = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  withIsolatedDataDir(({ dataDir }) => {
    const harness = fs.mkdtempSync(path.join(os.tmpdir(), "sb-clar-no-plan-"));
    const demoDir = path.join(harness, "demo-no-plan");
    fs.mkdirSync(demoDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            projectId: "proj_stale",
            projectRoot: demoDir,
            displayName: "demo-no-plan",
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
    const { projects, diagnostics } = computePublicProjectsList([]);
    assert.strictEqual(projects.length, 0);
    assert.ok(diagnostics.registryRowsSkippedDemo >= 1);
    assert.ok(isUnderOsTempDir(demoDir));
    fs.rmSync(harness, { recursive: true, force: true });
  });
  if (prevDemo === undefined) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prevDemo;
});

test("resolveProjectRecord: registry legado resolve pelo id derivado (GET /projects)", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const wiser = path.join(repo, "wiser-bot-front");
    fs.mkdirSync(wiser, { recursive: true });
    const legacyId = "proj_legacy_stale";
    const derivedId = deriveProjectId(wiser);

    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            projectId: legacyId,
            projectRoot: wiser,
            displayName: "wiser-bot-front",
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

    const { projects } = computePublicProjectsList([]);
    assert.strictEqual(projects.length, 1);
    assert.strictEqual(projects[0].projectId, derivedId);

    const byDerived = resolveProjectRecord(derivedId, { repoRoot: repo });
    assert.ok(byDerived.match === "derived_id" || byDerived.match === "exact_id");
    assert.strictEqual(byDerived.projectRoot, canonicalProjectRoot(wiser));

    const found = findProjectRecord(derivedId, { repoRoot: repo });
    assert.ok(found);
    assert.strictEqual(found.projectId, derivedId);
  });
});

test("reconcileProjectsRegistry: persiste projectId alinhado ao path", () => {
  withIsolatedDataDir(({ repo, dataDir }) => {
    const root = path.join(repo, "app-one");
    fs.mkdirSync(root, { recursive: true });
    const legacyId = "proj_legacy_stale";
    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            projectId: legacyId,
            projectRoot: root,
            displayName: "app-one",
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

    const { dirty } = reconcileProjectsRegistry({ persist: true });
    assert.strictEqual(dirty, true);
    const saved = loadProjectsUnsafe();
    assert.strictEqual(saved.projects.length, 1);
    assert.strictEqual(saved.projects[0].projectId, deriveProjectId(root));
  });
});

test("resolveProjectRecord: projecto inexistente retorna null", () => {
  withIsolatedDataDir(({ repo }) => {
    const r = resolveProjectRecord("proj_deadbeef", { repoRoot: repo, jobs: [] });
    assert.strictEqual(r.record, null);
    assert.strictEqual(r.projectRoot, null);
    assert.strictEqual(r.match, null);
  });
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
