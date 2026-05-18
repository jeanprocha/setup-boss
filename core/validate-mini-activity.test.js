"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  validateMiniActivitiesList,
  hasMiniActivityDependencyCycle,
} = require("./validate-mini-activity");

const PROJECTS = ["proj_a", "proj_b"];

test("validateMiniActivitiesList: duplicados e target fora do workspace", () => {
  const dup = validateMiniActivitiesList(
    [
      {
        miniActivityId: "ma_1",
        order: 0,
        title: "A",
        targetProjectId: "proj_a",
        status: "pending",
      },
      {
        miniActivityId: "ma_1",
        order: 1,
        title: "B",
        targetProjectId: "proj_a",
        status: "pending",
      },
    ],
    { workspaceProjectIds: PROJECTS },
  );
  assert.strictEqual(dup.ok, false);
  assert.ok(dup.errors.some((e) => e.code === "mini_activity_id_duplicate"));

  const orderDup = validateMiniActivitiesList(
    [
      {
        miniActivityId: "ma_1",
        order: 1,
        title: "A",
        targetProjectId: "proj_a",
        status: "pending",
      },
      {
        miniActivityId: "ma_2",
        order: 1,
        title: "B",
        targetProjectId: "proj_b",
        status: "pending",
      },
    ],
    { workspaceProjectIds: PROJECTS },
  );
  assert.ok(orderDup.errors.some((e) => e.code === "mini_activity_order_duplicate"));

  const badTarget = validateMiniActivitiesList(
    [
      {
        miniActivityId: "ma_1",
        order: 0,
        title: "A",
        targetProjectId: "proj_x",
        status: "pending",
      },
    ],
    { workspaceProjectIds: PROJECTS },
  );
  assert.ok(
    badTarget.errors.some((e) => e.code === "mini_activity_target_project_not_in_workspace"),
  );
});

test("validateMiniActivitiesList: dependsOn e ciclo", () => {
  const missing = validateMiniActivitiesList(
    [
      {
        miniActivityId: "ma_1",
        order: 0,
        title: "A",
        targetProjectId: "proj_a",
        status: "pending",
        dependsOnMiniActivityIds: ["ma_missing"],
      },
    ],
    { workspaceProjectIds: PROJECTS },
  );
  assert.ok(missing.errors.some((e) => e.code === "mini_activity_dependency_not_found"));

  const cycle = validateMiniActivitiesList(
    [
      {
        miniActivityId: "ma_1",
        order: 0,
        title: "A",
        targetProjectId: "proj_a",
        status: "pending",
        dependsOnMiniActivityIds: ["ma_2"],
      },
      {
        miniActivityId: "ma_2",
        order: 1,
        title: "B",
        targetProjectId: "proj_b",
        status: "pending",
        dependsOnMiniActivityIds: ["ma_1"],
      },
    ],
    { workspaceProjectIds: PROJECTS },
  );
  assert.ok(cycle.errors.some((e) => e.code === "mini_activity_dependency_cycle"));
  assert.strictEqual(
    hasMiniActivityDependencyCycle([
      {
        miniActivityId: "ma_1",
        order: 0,
        title: "A",
        targetProjectId: "proj_a",
        status: "pending",
        dependsOnMiniActivityIds: ["ma_2"],
        description: null,
        runId: null,
        createdAt: "t",
        updatedAt: "t",
      },
      {
        miniActivityId: "ma_2",
        order: 1,
        title: "B",
        targetProjectId: "proj_b",
        status: "pending",
        dependsOnMiniActivityIds: ["ma_1"],
        description: null,
        runId: null,
        createdAt: "t",
        updatedAt: "t",
      },
    ]),
    true,
  );
});

test("validateMiniActivitiesList: status inválido", () => {
  const r = validateMiniActivitiesList(
    [
      {
        miniActivityId: "ma_1",
        order: 0,
        title: "A",
        targetProjectId: "proj_a",
        status: "bogus",
      },
    ],
    { workspaceProjectIds: PROJECTS },
  );
  assert.ok(r.errors.some((e) => e.code === "mini_activity_status_invalid"));
});
