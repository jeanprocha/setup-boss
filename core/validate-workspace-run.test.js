"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  validateWorkspaceRunFields,
  resolveWorkspaceRunTitle,
  WORKSPACE_RUN_STATUSES,
} = require("./validate-workspace-run");

test("validateWorkspaceRunFields: workspace e title obrigatórios", () => {
  const r = validateWorkspaceRunFields({ title: "", status: "draft" });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "workspace_id_required"));
  assert.ok(r.errors.some((e) => e.code === "workspace_run_title_required"));
});

test("validateWorkspaceRunFields: workspace inexistente e status inválido", () => {
  const r = validateWorkspaceRunFields(
    { workspaceId: "ws_missing", title: "Feature X", status: "bogus" },
    { findWorkspace: () => null },
  );
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "workspace_not_found"));
  assert.ok(r.errors.some((e) => e.code === "workspace_run_status_invalid"));
});

test("validateWorkspaceRunFields: arrays inválidos", () => {
  const r = validateWorkspaceRunFields(
    {
      workspaceId: "ws_a",
      title: "Ok",
      miniActivities: {},
      childRunIds: "x",
    },
    { findWorkspace: () => ({}) },
  );
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "workspace_run_mini_activities_invalid"));
  assert.ok(r.errors.some((e) => e.code === "workspace_run_child_run_ids_invalid"));
});

test("validateWorkspaceRunFields: ok com defaults", () => {
  const r = validateWorkspaceRunFields(
    { workspaceId: "ws_a", title: "Atividade global" },
    { findWorkspace: () => ({}) },
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, "draft");
  assert.deepStrictEqual(r.miniActivities, []);
  assert.deepStrictEqual(r.childRunIds, []);
  assert.ok(WORKSPACE_RUN_STATUSES.includes("waiting_user_action"));
});

test("validateWorkspaceRunFields: isCreate ignora miniActivities sem id", () => {
  const r = validateWorkspaceRunFields(
    {
      workspaceId: "ws_a",
      title: "Criar tela de export PDF",
      miniActivities: [
        {
          order: 0,
          title: "Front",
          targetProjectId: "proj_a",
          status: "pending",
        },
      ],
      childRunIds: ["run_orphan"],
    },
    { findWorkspace: () => ({}), isCreate: true },
  );
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.miniActivities, []);
  assert.deepStrictEqual(r.childRunIds, []);
});

test("resolveWorkspaceRunTitle: aliases instruction/task/prompt", () => {
  assert.strictEqual(
    resolveWorkspaceRunTitle({ title: "Explícito", instruction: "Outro" }),
    "Explícito",
  );
  assert.strictEqual(
    resolveWorkspaceRunTitle({ instruction: "Criar tela de export PDF" }),
    "Criar tela de export PDF",
  );
  assert.strictEqual(resolveWorkspaceRunTitle({ task: "Via task" }), "Via task");
  assert.strictEqual(resolveWorkspaceRunTitle({ prompt: "Via prompt" }), "Via prompt");
});

test("validateWorkspaceRunFields: update exige miniActivityId quando há miniActivities", () => {
  const r = validateWorkspaceRunFields(
    {
      workspaceId: "ws_a",
      title: "Global",
      miniActivities: [{ order: 0, title: "API", targetProjectId: "proj_a" }],
    },
    { findWorkspace: () => ({ projectIds: ["proj_a"] }) },
  );
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "mini_activity_id_required"));
});
