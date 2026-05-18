"use strict";

const test = require("node:test");
const assert = require("node:assert");
const os = require("os");
const path = require("path");

const {
  isOperationalProjectRow,
  filterOperationalProjects,
  looksLikeFixtureLabel,
  pathLooksLikeTempHarness,
} = require("./filter-operational-projects");

test("looksLikeFixtureLabel: prefixos DEMO-/SB-*", () => {
  assert.strictEqual(looksLikeFixtureLabel("DEMO-NO-PLAN"), true);
  assert.strictEqual(looksLikeFixtureLabel("SB-EXEC-TRIGGER-JXVIP6"), true);
  assert.strictEqual(looksLikeFixtureLabel("sb-exec-trigger-jXVip6"), true);
  assert.strictEqual(looksLikeFixtureLabel("wiser-bot-api"), false);
});

test("isOperationalProjectRow: demo-no-plan e sb-exec-trigger em temp", () => {
  const harness = path.join(os.tmpdir(), "sb-exec-trigger-jXVip6");
  assert.strictEqual(
    isOperationalProjectRow({
      projectId: "proj_x",
      projectRoot: harness,
      displayName: "sb-exec-trigger-jXVip6",
    }),
    false,
  );
  assert.strictEqual(
    isOperationalProjectRow({
      projectId: "proj_y",
      projectRoot: path.join(os.tmpdir(), "sb-clar-no-plan-xyz", "demo-no-plan"),
      displayName: "demo-no-plan",
    }),
    false,
  );
});

test("isOperationalProjectRow: projecto real fora de temp", () => {
  assert.strictEqual(
    isOperationalProjectRow({
      projectId: "proj_ok",
      projectRoot: "C:\\repos\\wiser-bot-api",
      displayName: "wiser-bot-api",
    }),
    true,
  );
});

test("filterOperationalProjects", () => {
  const rows = filterOperationalProjects([
    { projectRoot: path.join(os.tmpdir(), "sb-exec-trigger-x"), displayName: "x" },
    { projectRoot: "C:\\git\\wiser-bot-front", displayName: "wiser-bot-front" },
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].displayName, "wiser-bot-front");
});

test("pathLooksLikeTempHarness: pasta sb-exec-trigger na raiz do temp", () => {
  const p = path.join(os.tmpdir(), "sb-exec-trigger-abc");
  assert.strictEqual(pathLooksLikeTempHarness(p), true);
});
