"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildValidationGraph } = require("./validation-runtime/graph/validation-graph");
const { stagesForProfile } = require("./validation-runtime/policies/validation-policies");
const {
  runValidationOrchestration,
  mapPool,
} = require("./validation-runtime/orchestrator/validation-orchestrator");
const { compareReplayRefs } = require("./validation-runtime/replay/validation-replay");

test("validation graph fingerprint é determinístico", () => {
  const targetsDoc = {
    targets: [
      {
        target_id: "t1",
        file: "pkg/foo.json",
        validation_scope: "file",
        inferred_validators: ["json_parse"],
      },
    ],
  };
  const plan = { plan_id: "p1", operations: [] };
  const g1 = buildValidationGraph({
    targetsDoc,
    plan,
    reconciliation: null,
    enabledStages: stagesForProfile("minimal"),
  });
  const g2 = buildValidationGraph({
    targetsDoc,
    plan,
    reconciliation: null,
    enabledStages: stagesForProfile("minimal"),
  });
  assert.strictEqual(g1.graph_fingerprint_sha256, g2.graph_fingerprint_sha256);
});

test("json validator marca falha em JSON inválido", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-vr-"));
  const pr = path.join(tmp, "proj");
  fs.mkdirSync(pr, { recursive: true });
  fs.writeFileSync(path.join(pr, "bad.json"), "{ not json", "utf8");
  fs.writeFileSync(path.join(tmp, "metadata.json"), JSON.stringify({ projectRoot: pr }), "utf8");

  const targetsDoc = {
    targets: [
      {
        target_id: "t1",
        file: "bad.json",
        validation_scope: "file",
        inferred_validators: ["json_parse"],
      },
    ],
  };
  const graph = buildValidationGraph({
    targetsDoc,
    plan: { plan_id: "p" },
    reconciliation: null,
    enabledStages: stagesForProfile("minimal"),
  });
  const { results } = await runValidationOrchestration({
    ctx: { telemetry: { emit() {} } },
    outputDir: tmp,
    projectRoot: pr,
    graph,
    plan_id: "p",
    run_id: "r1",
    validation_run_id: "vr-test",
    validation_mode: "report",
    policy_profile: "minimal",
    signal: null,
  });
  assert.ok(results.summary.failed_validators >= 1);
});

test("segunda execução reutiliza cache do validator json", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-vr-"));
  const pr = path.join(tmp, "proj");
  fs.mkdirSync(pr, { recursive: true });
  fs.writeFileSync(path.join(pr, "ok.json"), '{"a":1}', "utf8");
  fs.writeFileSync(path.join(tmp, "metadata.json"), JSON.stringify({ projectRoot: pr }), "utf8");
  const targetsDoc = {
    targets: [
      {
        target_id: "t1",
        file: "ok.json",
        validation_scope: "file",
        inferred_validators: ["json_parse"],
      },
    ],
  };
  const graph = buildValidationGraph({
    targetsDoc,
    plan: { plan_id: "p" },
    reconciliation: null,
    enabledStages: stagesForProfile("minimal"),
  });
  const tel = { emit() {} };
  await runValidationOrchestration({
    ctx: { telemetry: tel },
    outputDir: tmp,
    projectRoot: pr,
    graph,
    plan_id: "p",
    run_id: "r1",
    validation_run_id: "vr-a",
    validation_mode: "report",
    policy_profile: "minimal",
    signal: null,
  });
  const r2 = await runValidationOrchestration({
    ctx: { telemetry: tel },
    outputDir: tmp,
    projectRoot: pr,
    graph,
    plan_id: "p",
    run_id: "r1",
    validation_run_id: "vr-b",
    validation_mode: "report",
    policy_profile: "minimal",
    signal: null,
  });
  const hits = r2.results.validators.filter((v) => v.cache_hit);
  assert.ok(hits.length >= 1);
});

test("mapPool processa todos os itens", async () => {
  const order = [];
  await mapPool([1, 2, 3, 4], 2, async (n) => {
    order.push(n);
    return n * 2;
  });
  assert.strictEqual(order.length, 4);
});

test("compareReplayRefs aceita manifest ausente", () => {
  const r = compareReplayRefs(null, { summary: {} });
  assert.strictEqual(r.ok, true);
});
