"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const test = require("node:test");

const { decomposeTaskMultiProject } = require("./decompose-task-multi-project");
const { inferProjectForTask } = require("./infer-mini-task-project");
const {
  oesMiniTasksToWorkspaceMiniActivities,
} = require("./materialize-workspace-mini-activities-from-oes");
const { patchRunContextWorkspaceLink } = require("./patch-run-context-workspace-link");
const { buildOperationalExecutableStrategy } = require("./build-operational-executable-strategy");
const { PLAN_REFINED } = require("../scripts/runtime/strategy-runtime/analyze-complexity");

const FIXTURE = path.join(
  __dirname,
  "fixtures",
  "operational-executable-strategy",
  "rich-complete",
);

test("inferProjectForTask atribui api vs front por texto", () => {
  const catalog = [
    {
      projectId: "proj_api",
      displayName: "wiser-bot-api",
      repositoryName: "wiser-bot-api",
      repositorySlug: "wiser-bot-api",
      projectRoot: "/tmp/wiser-bot-api",
    },
    {
      projectId: "proj_front",
      displayName: "wiser-bot-front",
      repositoryName: "wiser-bot-front",
      repositorySlug: "wiser-bot-front",
      projectRoot: "/tmp/wiser-bot-front",
    },
  ];
  const api = inferProjectForTask(
    { title: "Criar endpoint export PDF no backend", goal: "", body: "", files: [] },
    catalog,
    "proj_front",
  );
  const ui = inferProjectForTask(
    { title: "Criar modal de exportação no frontend", goal: "", body: "", files: [] },
    catalog,
    "proj_front",
  );
  assert.strictEqual(api.projectId, "proj_api");
  assert.strictEqual(ui.projectId, "proj_front");
});

test("decomposeTaskMultiProject gera subtasks com projectId e dependências", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-deco-"));
  const plan = [
    "## Entregas",
    "- Criar endpoint export PDF na API",
    "- Criar modal de exportação no dashboard",
    "- Integrar frontend com endpoint de export",
  ].join("\n");
  fs.writeFileSync(path.join(dir, PLAN_REFINED), plan, "utf-8");

  const wsCtx = {
    ok: true,
    workspaceRunId: "wsrun_test",
    workspaceId: "ws_test",
    task: "Export PDF dashboard",
    projectIds: ["proj_api", "proj_front"],
    planningProjectId: "proj_front",
    catalog: [
      {
        projectId: "proj_api",
        displayName: "wiser-bot-api",
        repositoryName: "wiser-bot-api",
        repositorySlug: "wiser-bot-api",
        projectRoot: null,
      },
      {
        projectId: "proj_front",
        displayName: "wiser-bot-front",
        repositoryName: "wiser-bot-front",
        repositorySlug: "wiser-bot-front",
        projectRoot: null,
      },
    ],
    multiRepo: true,
  };

  const deco = decomposeTaskMultiProject({
    outputDirAbs: dir,
    complexityDoc: {},
    aiDoc: {},
    workspaceContext: wsCtx,
  });
  assert.strictEqual(deco.ok, true);
  assert.ok(deco.subtaskFiles.length >= 2);
  for (const sf of deco.subtaskFiles) {
    assert.ok(sf.doc.projectId, "subtask deve ter projectId");
    assert.ok(sf.doc.repositorySlug);
  }
  const integration = deco.subtaskFiles.find((s) =>
    /integrar/i.test(String(s.doc.title)),
  );
  if (integration) {
    assert.ok(
      Array.isArray(integration.doc.dependencies) && integration.doc.dependencies.length > 0,
      "passo de integração deve depender do backend",
    );
  }
});

test("OES multi-repo inclui projectId e integrationFlow", () => {
  const built = buildOperationalExecutableStrategy({
    outputDirAbs: FIXTURE,
    runId: "test-multi",
    write: false,
    workspaceContext: {
      workspaceRunId: "wsrun_x",
      workspaceId: "ws_x",
      projectIds: ["p1", "p2"],
      multiRepo: true,
      catalog: [
        {
          projectId: "p1",
          repositoryName: "api",
          repositorySlug: "api",
        },
        {
          projectId: "p2",
          repositoryName: "front",
          repositorySlug: "front",
        },
      ],
    },
  });
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.artifact.multiRepo, true);
  assert.ok(built.artifact.integrationFlow);
  assert.ok(built.artifact.miniTasks.length > 0);
});

test("oesMiniTasksToWorkspaceMiniActivities mapeia dependências", () => {
  const minis = oesMiniTasksToWorkspaceMiniActivities({
    oesArtifact: {
      miniTasks: [
        {
          id: "mt_001",
          order: 1,
          title: "API",
          objective: "Endpoint",
          projectId: "p_api",
          dependsOnIds: [],
        },
        {
          id: "mt_002",
          order: 2,
          title: "Integração",
          objective: "Ligar UI",
          projectId: "p_front",
          dependsOnIds: ["mt_001"],
        },
      ],
    },
    workspaceProjectIds: ["p_api", "p_front"],
  });
  assert.strictEqual(minis.length, 2);
  assert.strictEqual(minis[1].dependsOnMiniActivityIds.length, 1);
  assert.strictEqual(minis[1].dependsOnMiniActivityIds[0], minis[0].miniActivityId);
});

test("patchRunContextWorkspaceLink grava bloco workspace", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-ctx-"));
  fs.writeFileSync(
    path.join(dir, "run-context.json"),
    JSON.stringify({ version: "1.1.0", run_type: "intake" }),
    "utf-8",
  );
  const r = patchRunContextWorkspaceLink(dir, {
    workspaceRunId: "wsrun_abc",
    workspaceId: "ws_1",
    planningProjectId: "proj_a",
    projectIds: ["proj_a", "proj_b"],
  });
  assert.strictEqual(r.ok, true);
  const ctx = JSON.parse(fs.readFileSync(path.join(dir, "run-context.json"), "utf-8"));
  assert.strictEqual(ctx.workspace.workspaceRunId, "wsrun_abc");
  assert.strictEqual(ctx.workspace.planningProjectId, "proj_a");
  assert.deepStrictEqual(ctx.workspace.projectIds, ["proj_a", "proj_b"]);
});
