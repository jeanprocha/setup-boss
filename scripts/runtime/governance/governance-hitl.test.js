"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildGovernanceApprovalManifest,
  saveGovernanceApprovalManifest,
  loadGovernanceApprovalManifest,
} = require("./governance-approval-manifest");
const {
  requestGovernanceApproval,
  getGovernanceApprovalPending,
  resolveGovernanceApproval,
} = require("./governance-approval-runtime");
const { assessResume } = require("../replay/resume-engine");
const { createGovernanceRuntimeManifest, saveGovernanceRuntimeManifest, setAwaitingHumanApproval } = require("./governance-runtime-manifest");
const { GOVERNANCE_RUNTIME_LIFECYCLE } = require("./governance-runtime-constants");
const { runGovernanceRuntimeHook, GOVERNANCE_HOOK_PHASE } = require("./governance-runtime-hook");
const { GovernanceAwaitingApprovalError } = require("./governance-awaiting-approval-error");
const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");

test("approval manifest — criar e round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hitl-"));
  try {
    const doc = buildGovernanceApprovalManifest({
      run_id: "r1",
      approval_id: "ga-test",
      governance_phase: "post_validation",
      blocker_codes: ["X"],
      requested_by_runtime: "governance-runtime",
      scope_fingerprint: "sha256:abc",
    });
    saveGovernanceApprovalManifest(dir, doc);
    const again = loadGovernanceApprovalManifest(dir);
    assert.equal(again.status, "PENDING");
    assert.equal(again.approval_id, "ga-test");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("requestGovernanceApproval + governance-runtime — lifecycle AWAITING_APPROVAL", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hitl-"));
  const prevGov = process.env.SETUP_BOSS_GOVERNANCE_MODE;
  const prevRes = process.env.SETUP_BOSS_VALIDATION_CRITICAL_RESOLUTION;
  try {
    delete process.env.SETUP_BOSS_GOVERNANCE_MODE;
    delete process.env.SETUP_BOSS_VALIDATION_CRITICAL_RESOLUTION;
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ taskArg: "t", projectArg: "p", projectRoot: dir }), "utf8");
    const gm = createGovernanceRuntimeManifest("r1", "enforce");
    saveGovernanceRuntimeManifest(dir, gm);
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({ validators: [{ validator_id: "v", status: "error", output: {} }] }),
      "utf8",
    );

    fs.mkdirSync(path.join(dir, ".setup-boss"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".setup-boss", "policy.json"),
      JSON.stringify({
        profile: "NORMAL",
        governance_runtime_mode: "enforce",
        validation_critical_resolution: "approval",
      }),
      "utf8",
    );

    assert.throws(
      () =>
        runGovernanceRuntimeHook({
          ctx: { projectRoot: dir, telemetry: { emit() {} } },
          outputDir: dir,
          runId: "r1",
          hookPhase: GOVERNANCE_HOOK_PHASE.POST_VALIDATION,
          flowOptions: {},
        }),
      GovernanceAwaitingApprovalError,
    );

    const ap = loadGovernanceApprovalManifest(dir);
    assert.ok(ap);
    assert.equal(ap.status, "PENDING");

    const gr = JSON.parse(fs.readFileSync(path.join(dir, "governance-runtime.json"), "utf8"));
    assert.equal(gr.lifecycle_state, GOVERNANCE_RUNTIME_LIFECYCLE.AWAITING_APPROVAL);

    const tel = fs.readFileSync(path.join(dir, "governance-runtime-telemetry.ndjson"), "utf8");
    assert.ok(tel.includes("governance.hitl.required"));

    const ar = assessResume(dir);
    assert.equal(ar.ok, false);
    assert.equal(ar.governance_approval_pending, true);
    assert.ok(
      String(ar.reason || "").includes("GOVERNANCE_AWAITING_APPROVAL") ||
        String(ar.reason || "").includes("GOVERNANCE_RESUME_BLOCKED"),
    );
  } finally {
    if (prevGov === undefined) delete process.env.SETUP_BOSS_GOVERNANCE_MODE;
    else process.env.SETUP_BOSS_GOVERNANCE_MODE = prevGov;
    if (prevRes === undefined) delete process.env.SETUP_BOSS_VALIDATION_CRITICAL_RESOLUTION;
    else process.env.SETUP_BOSS_VALIDATION_CRITICAL_RESOLUTION = prevRes;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveGovernanceApproval — APPROVED emite telemetry e limpa pending", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hitl-"));
  try {
    const doc = buildGovernanceApprovalManifest({
      run_id: "r2",
      approval_id: "ga-x",
      governance_phase: "post_validation",
      blocker_codes: ["A"],
      requested_by_runtime: "governance-runtime",
      scope_fingerprint: "sha256:x",
    });
    saveGovernanceApprovalManifest(dir, doc);
    const gm = createGovernanceRuntimeManifest("r2", "enforce");
    setAwaitingHumanApproval(gm, "ga-x");
    saveGovernanceRuntimeManifest(dir, gm);

    const telPath = path.join(dir, "governance-runtime-telemetry.ndjson");
    const sink = {
      appendNdjson(rec) {
        fs.appendFileSync(telPath, `${JSON.stringify(rec)}\n`, "utf8");
      },
    };

    const out = resolveGovernanceApproval({
      outputDir: dir,
      status: "APPROVED",
      actor: "tester",
      channel: "filesystem",
      note: "ok",
      telemetry: { emit() {} },
      sink,
    });
    assert.equal(out.ok, true);

    const ap2 = loadGovernanceApprovalManifest(dir);
    assert.equal(ap2.status, "APPROVED");
    assert.ok(ap2.resolved_at);

    const tel = fs.readFileSync(telPath, "utf8");
    assert.ok(tel.includes("governance.hitl.approved"));

    assert.equal(getGovernanceApprovalPending(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
