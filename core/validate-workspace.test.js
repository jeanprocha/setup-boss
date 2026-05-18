"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { validateWorkspaceFields, normalizeProjectIds } = require("./validate-workspace");

test("normalizeProjectIds: dedup e trim", () => {
  assert.deepStrictEqual(normalizeProjectIds([" proj_a ", "proj_a", "proj_b", ""]), [
    "proj_a",
    "proj_b",
  ]);
});

test("validateWorkspaceFields: rejeita vazio e duplicados", () => {
  const empty = validateWorkspaceFields({ name: "  ", projectIds: [] });
  assert.strictEqual(empty.ok, false);
  assert.ok(empty.errors.some((e) => e.code === "workspace_name_required"));
  assert.ok(empty.errors.some((e) => e.code === "workspace_empty"));

  const dup = validateWorkspaceFields(
    { name: "W", projectIds: ["proj_a", "proj_a"] },
    { findProject: () => ({}) },
  );
  assert.strictEqual(dup.ok, false);
  assert.ok(dup.errors.some((e) => e.code === "workspace_duplicate_projects"));
});

test("validateWorkspaceFields: primary e project_not_found", () => {
  const r = validateWorkspaceFields(
    {
      name: "Stack",
      projectIds: ["proj_a", "proj_missing"],
      primaryProjectId: "proj_x",
    },
    { findProject: (id) => (id === "proj_a" ? {} : null) },
  );
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "primary_project_not_in_workspace"));
  assert.ok(r.errors.some((e) => e.code === "project_not_found"));
});

test("validateWorkspaceFields: ok mínimo", () => {
  const r = validateWorkspaceFields(
    { name: "Wiser", projectIds: ["proj_a"], primaryProjectId: "proj_a" },
    { findProject: () => ({}) },
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.name, "Wiser");
  assert.deepStrictEqual(r.projectIds, ["proj_a"]);
  assert.strictEqual(r.primaryProjectId, "proj_a");
});
