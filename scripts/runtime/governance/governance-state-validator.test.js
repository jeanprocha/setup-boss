"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const {
  validateGovernanceApprovalState,
  validateGovernanceRuntimeState,
  evaluateGovernanceResumeReplayGate,
  enforceGovernanceReplayGate,
} = require("./governance-state-validator");
const {
  createGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
} = require("./governance-runtime-manifest");
const {
  buildGovernanceApprovalManifest,
  saveGovernanceApprovalManifest,
} = require("./governance-approval-manifest");
const { GOVERNANCE_APPROVAL_STATUS, GOVERNANCE_RUNTIME_LIFECYCLE } = require("./governance-runtime-constants");
const { GovernanceEnforcementError } = require("./governance-enforcement-error");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-val-"));
}

function writeMeta(dir) {
  fs.writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({ taskArg: "t", projectArg: "p", projectRoot: dir }, null, 2),
    "utf8",
  );
}

test("validateGovernanceApprovalState — STALE", () => {
  const ap = { status: GOVERNANCE_APPROVAL_STATUS.STALE, approval_id: "x" };
  const r = validateGovernanceApprovalState(ap);
  assert.equal(r.ok, false);
  assert.equal(r.subReason, "stale_approval");
});

test("validateGovernanceRuntimeState — BLOCKED", () => {
  const gr = { lifecycle_state: GOVERNANCE_RUNTIME_LIFECYCLE.BLOCKED };
  const r = validateGovernanceRuntimeState(gr, null);
  assert.equal(r.ok, false);
  assert.equal(r.subReason, "lifecycle_blocked");
});

test("evaluateGovernanceResumeReplayGate resume — awaiting approval + telemetry", () => {
  const dir = tmpDir();
  try {
    writeMeta(dir);
    const doc = buildGovernanceApprovalManifest({
      run_id: "r",
      approval_id: "p1",
      governance_phase: "post_validation",
      blocker_codes: ["X"],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:p",
    });
    saveGovernanceApprovalManifest(dir, doc);

    const gm = createGovernanceRuntimeManifest("r", "report");
    gm.extensions.v1.awaiting_approval = true;
    saveGovernanceRuntimeManifest(dir, gm);

    const sink = { lines: [], appendNdjson(rec) { this.lines.push(rec); } };
    const g = evaluateGovernanceResumeReplayGate(dir, "resume", { sink });
    assert.equal(g.ok, false);
    assert.ok(sink.lines.some((x) => x.kind === "governance.resume.blocked"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("evaluateGovernanceResumeReplayGate — lifecycle cross-manifest invalid", () => {
  const dir = tmpDir();
  try {
    writeMeta(dir);
    const doc = buildGovernanceApprovalManifest({
      run_id: "r",
      approval_id: "p1",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:p",
    });
    doc.status = GOVERNANCE_APPROVAL_STATUS.APPROVED;
    saveGovernanceApprovalManifest(dir, doc);

    const gm = createGovernanceRuntimeManifest("r", "report");
    gm.extensions.v1.awaiting_approval = true;
    gm.extensions.v1.awaiting_approval_id = "p1";
    gm.lifecycle_state = GOVERNANCE_RUNTIME_LIFECYCLE.PASSED;
    fs.writeFileSync(path.join(dir, "governance-runtime.json"), JSON.stringify(gm, null, 2), "utf8");

    const sink = { lines: [], appendNdjson(rec) { this.lines.push(rec); } };
    const g = evaluateGovernanceResumeReplayGate(dir, "resume", { sink });
    assert.equal(g.ok, false);
    assert.ok(sink.lines.some((x) => x.kind === "governance.lifecycle.invalid"));
    assert.ok(sink.lines.some((x) => x.kind === "governance.resume.blocked"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("evaluateGovernanceResumeReplayGate replay — continuity mismatch telemetry", () => {
  const dir = tmpDir();
  try {
    writeMeta(dir);
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        metadata: { graph_fingerprint_sha256: "g1" },
        validators: [{ replay_fingerprint_sha256: "r1" }],
      }),
      "utf8",
    );

    const gm = createGovernanceRuntimeManifest("run-x", "report");
    saveGovernanceRuntimeManifest(dir, gm);
    const gr = JSON.parse(fs.readFileSync(path.join(dir, "governance-runtime.json"), "utf8"));

    const packFp = gr.governance_continuity_fingerprint;

    const ap = buildGovernanceApprovalManifest({
      run_id: "run-x",
      approval_id: "ga1",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:x",
      governance_continuity_fingerprint: packFp,
      continuity_inputs: [],
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.APPROVED;
    saveGovernanceApprovalManifest(dir, ap);

    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        metadata: { graph_fingerprint_sha256: "g2" },
        validators: [{ replay_fingerprint_sha256: "r1" }],
      }),
      "utf8",
    );
    saveGovernanceRuntimeManifest(dir, gr);

    const sink = { lines: [], appendNdjson(rec) { this.lines.push(rec); } };
    const g = evaluateGovernanceResumeReplayGate(dir, "replay", { sink });
    assert.equal(g.ok, false);
    assert.ok(sink.lines.some((x) => x.kind === "governance.continuity.mismatch"));
    assert.ok(sink.lines.some((x) => x.kind === "governance.replay.blocked"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("enforceGovernanceReplayGate — lança GovernanceEnforcementError", () => {
  const dir = tmpDir();
  try {
    writeMeta(dir);
    const ap = buildGovernanceApprovalManifest({
      run_id: "r",
      approval_id: "st",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:x",
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.INVALIDATED;
    saveGovernanceApprovalManifest(dir, ap);

    assert.throws(() => enforceGovernanceReplayGate(dir), GovernanceEnforcementError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
