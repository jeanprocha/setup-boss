"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildValidationCriticalDecision,
  applyPostValidationGovernanceEnforcement,
} = require("./governance-validation-enforcement");
const {
  createGovernanceRuntimeManifest,
  loadGovernanceRuntimeManifest,
} = require("./governance-runtime-manifest");
const { runGovernanceRuntimeHook, GOVERNANCE_HOOK_PHASE } = require("./governance-runtime-hook");
const { GovernanceEnforcementError } = require("./governance-enforcement-error");
const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const { GOVERNANCE_RUNTIME_MANIFEST_FILENAME } = require("./governance-runtime-constants");

test("buildValidationCriticalDecision — error de validator é crítico", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-enf-"));
  try {
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        schema_version: 1,
        validators: [
          {
            validator_id: "n1",
            status: "error",
            output: {},
            errors: ["crash"],
          },
        ],
      }),
      "utf8",
    );
    const d = buildValidationCriticalDecision(dir);
    assert.equal(d.hasCritical, true);
    assert.ok(d.blocker_codes.some((c) => c.startsWith("VALIDATION_VALIDATOR_ERROR")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildValidationCriticalDecision — failed + governance_severity CRITICAL", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-enf-"));
  try {
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        validators: [
          {
            validator_id: "n2",
            status: "failed",
            output: { governance_severity: "CRITICAL" },
            errors: [],
          },
        ],
      }),
      "utf8",
    );
    const d = buildValidationCriticalDecision(dir);
    assert.equal(d.hasCritical, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildValidationCriticalDecision — failed sem severity não é crítico para enforcement", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-enf-"));
  try {
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        validators: [
          {
            validator_id: "n3",
            status: "failed",
            output: {},
            errors: ["x"],
          },
        ],
      }),
      "utf8",
    );
    const d = buildValidationCriticalDecision(dir);
    assert.equal(d.hasCritical, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyPostValidationGovernanceEnforcement — report_only não lança", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-enf-"));
  try {
    process.env.SETUP_BOSS_DISABLE_GOVERNANCE = "0";
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        validators: [{ validator_id: "e1", status: "error", output: {} }],
      }),
      "utf8",
    );
    const manifest = createGovernanceRuntimeManifest("r1", "report");
    applyPostValidationGovernanceEnforcement({
      outputDir: dir,
      runId: "r1",
      manifest,
      telemetry: { emit() {} },
      sink: { appendNdjson() {} },
      allow_hard_enforcement: false,
    });
    const again = loadGovernanceRuntimeManifest(dir);
    assert.ok(again);
    assert.ok(again.evaluations.some((e) => e.code === "VALIDATION_VALIDATOR_ERROR"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyPostValidationGovernanceEnforcement — enforce lança após persistir manifest", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-enf-"));
  try {
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        validators: [{ validator_id: "e1", status: "error", output: {} }],
      }),
      "utf8",
    );
    const manifest = createGovernanceRuntimeManifest("r1", "enforce");
    assert.throws(
      () =>
        applyPostValidationGovernanceEnforcement({
          outputDir: dir,
          runId: "r1",
          manifest,
          telemetry: { emit() {} },
          sink: {
            appendNdjson(rec) {
              const p = path.join(dir, "governance-runtime-telemetry.ndjson");
              fs.appendFileSync(p, `${JSON.stringify(rec)}\n`, "utf8");
            },
          },
          allow_hard_enforcement: true,
        }),
      GovernanceEnforcementError,
    );
    const persisted = JSON.parse(
      fs.readFileSync(path.join(dir, GOVERNANCE_RUNTIME_MANIFEST_FILENAME), "utf8"),
    );
    assert.equal(persisted.lifecycle_state, "BLOCKED");
    assert.ok(
      persisted.evaluations.some((e) => e.severity === "BLOCK" && e.code === "VALIDATION_VALIDATOR_ERROR"),
    );
    const tel = fs.readFileSync(path.join(dir, "governance-runtime-telemetry.ndjson"), "utf8");
    assert.ok(tel.includes("governance.enforcement.hard"));
    assert.ok(tel.includes("governance.pipeline.blocked"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runGovernanceRuntimeHook POST_VALIDATION — enforce via env", () => {
  const prev = process.env.SETUP_BOSS_GOVERNANCE_MODE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-enf-"));
  try {
    process.env.SETUP_BOSS_GOVERNANCE_MODE = "enforce";
    fs.mkdirSync(path.join(dir, ".setup-boss"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".setup-boss", "policy.json"),
      JSON.stringify({ profile: "NORMAL" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        validators: [{ validator_id: "e2", status: "error", output: {} }],
      }),
      "utf8",
    );
    assert.throws(
      () =>
        runGovernanceRuntimeHook({
          ctx: {
            projectRoot: dir,
            telemetry: { emit() {} },
          },
          outputDir: dir,
          runId: "runz",
          hookPhase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
          flowOptions: {},
        }),
      GovernanceEnforcementError,
    );
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_GOVERNANCE_MODE;
    else process.env.SETUP_BOSS_GOVERNANCE_MODE = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
