"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const {
  buildGovernanceContinuityPack,
  stableStringify,
} = require("./governance-continuity-fingerprint");
const {
  syncGovernanceContinuityAndStaleApproval,
  enforceReplayGovernanceContinuity,
} = require("./governance-continuity");
const {
  createGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
} = require("./governance-runtime-manifest");
const {
  buildGovernanceApprovalManifest,
  saveGovernanceApprovalManifest,
  loadGovernanceApprovalManifest,
} = require("./governance-approval-manifest");
const { requestGovernanceApproval, resolveGovernanceApproval } = require("./governance-approval-runtime");
const { assessResume } = require("../replay/resume-engine");
const { GOVERNANCE_APPROVAL_STATUS } = require("./governance-runtime-constants");
const { GovernanceEnforcementError } = require("./governance-enforcement-error");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-cont-"));
}

function writeJson(d, name, obj) {
  fs.writeFileSync(path.join(d, name), JSON.stringify(obj, null, 2), "utf8");
}

test("fingerprint determinístico para os mesmos artefactos", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        metadata: { graph_fingerprint_sha256: "abc" },
        validators: [{ replay_fingerprint_sha256: "z" }],
      }),
      "utf8",
    );
    const a = buildGovernanceContinuityPack(dir, [], []);
    const b = buildGovernanceContinuityPack(dir, [], []);
    assert.equal(a.governance_continuity_fingerprint, b.governance_continuity_fingerprint);
    assert.ok(Array.isArray(a.continuity_inputs));
    assert.ok(stableStringify(a.continuity_inputs).length > 10);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sync marca APPROVED como STALE quando manifestos mudam", () => {
  const dir = tmpDir();
  try {
    const valPath = path.join(dir, VALIDATION_RESULTS_FILENAME);
    fs.writeFileSync(
      valPath,
      JSON.stringify({
        metadata: { graph_fingerprint_sha256: "g1" },
        validators: [{ replay_fingerprint_sha256: "r1" }],
      }),
      "utf8",
    );

    const gm = createGovernanceRuntimeManifest("run-x", "report");
    saveGovernanceRuntimeManifest(dir, gm);

    const pack = buildGovernanceContinuityPack(dir, [], []);

    const ap = buildGovernanceApprovalManifest({
      run_id: "run-x",
      approval_id: "ga-fixed",
      governance_phase: "post_validation",
      blocker_codes: ["X"],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:x",
      governance_continuity_fingerprint: pack.governance_continuity_fingerprint,
      continuity_inputs: pack.continuity_inputs,
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.APPROVED;
    saveGovernanceApprovalManifest(dir, ap);

    fs.writeFileSync(
      valPath,
      JSON.stringify({
        metadata: { graph_fingerprint_sha256: "g2" },
        validators: [{ replay_fingerprint_sha256: "r1" }],
      }),
      "utf8",
    );

    const sink = {
      lines: [],
      appendNdjson(rec) {
        this.lines.push(rec);
      },
    };
    const r = syncGovernanceContinuityAndStaleApproval(dir, { sink });
    assert.equal(r.approval_stale_written, true);

    const ap2 = loadGovernanceApprovalManifest(dir);
    assert.equal(ap2.status, GOVERNANCE_APPROVAL_STATUS.STALE);
    assert.equal(ap2.lineage.continuity_reason, "continuity_fingerprint_divergence");
    assert.ok(sink.lines.some((x) => x.kind === "governance.continuity.stale"));
    assert.ok(sink.lines.some((x) => x.kind === "governance.approval.invalidated"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resume bloqueado com approval STALE + telemetry governance.resume.blocked", () => {
  const dir = tmpDir();
  try {
    writeJson(dir, "metadata.json", {
      taskArg: "t",
      projectArg: "p",
      projectRoot: path.join(dir, "proj"),
    });

    const ap = buildGovernanceApprovalManifest({
      run_id: "r",
      approval_id: "ga-stale",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:x",
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.STALE;
    saveGovernanceApprovalManifest(dir, ap);

    const ar = assessResume(dir);
    assert.equal(ar.ok, false);
    assert.equal(ar.governance_resume_blocked_stale, true);
    assert.ok(String(ar.reason || "").includes("GOVERNANCE_RESUME_BLOCKED"));

    const tel = fs.readFileSync(path.join(dir, "governance-runtime-telemetry.ndjson"), "utf8");
    assert.ok(tel.includes("governance.resume.blocked"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveGovernanceApproval bloqueia APPROVED se fingerprint mudou desde o pedido", () => {
  const dir = tmpDir();
  try {
    writeJson(dir, "metadata.json", { taskArg: "t", projectArg: "p", projectRoot: dir });

    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        metadata: { graph_fingerprint_sha256: "old" },
        validators: [],
      }),
      "utf8",
    );

    const gm = createGovernanceRuntimeManifest("r", "report");
    saveGovernanceRuntimeManifest(dir, gm);
    const pack = buildGovernanceContinuityPack(dir, [], []);

    const doc = buildGovernanceApprovalManifest({
      run_id: "r",
      approval_id: "ga-p",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:y",
      governance_continuity_fingerprint: pack.governance_continuity_fingerprint,
      continuity_inputs: pack.continuity_inputs,
    });
    saveGovernanceApprovalManifest(dir, doc);

    fs.writeFileSync(
      path.join(dir, VALIDATION_RESULTS_FILENAME),
      JSON.stringify({
        metadata: { graph_fingerprint_sha256: "new" },
        validators: [],
      }),
      "utf8",
    );
    saveGovernanceRuntimeManifest(dir, gm);

    const out = resolveGovernanceApproval({
      outputDir: dir,
      status: "APPROVED",
      actor: "t",
      channel: "filesystem",
      note: "n",
      telemetry: null,
      sink: { appendNdjson() {} },
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "governance_continuity_mismatch_at_resolve");

    const still = loadGovernanceApprovalManifest(dir);
    assert.equal(still.status, GOVERNANCE_APPROVAL_STATUS.PENDING);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("requestGovernanceApproval persiste lineage ao substituir approval anterior", () => {
  const dir = tmpDir();
  try {
    const gm = createGovernanceRuntimeManifest("r2", "report");
    saveGovernanceRuntimeManifest(dir, gm);

    const prev = buildGovernanceApprovalManifest({
      run_id: "r2",
      approval_id: "ga-prev",
      governance_phase: "post_validation",
      blocker_codes: ["a"],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:p",
      governance_continuity_fingerprint: "fp-prev",
      continuity_inputs: [],
    });
    prev.status = GOVERNANCE_APPROVAL_STATUS.REJECTED;
    saveGovernanceApprovalManifest(dir, prev);

    requestGovernanceApproval({
      outputDir: dir,
      runId: "r2",
      governancePhase: "post_validation",
      blockerCodes: ["b"],
      telemetry: null,
      sink: { appendNdjson() {} },
    });

    const next = loadGovernanceApprovalManifest(dir);
    assert.equal(next.status, GOVERNANCE_APPROVAL_STATUS.PENDING);
    assert.equal(next.lineage.previous_approval_id, "ga-prev");
    assert.equal(next.lineage.previous_fingerprint, "fp-prev");
    assert.ok(next.governance_continuity_fingerprint.length > 16);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("enforceReplayGovernanceContinuity falha com approval STALE", () => {
  const dir = tmpDir();
  try {
    const gm = createGovernanceRuntimeManifest("r3", "report");
    saveGovernanceRuntimeManifest(dir, gm);

    const ap = buildGovernanceApprovalManifest({
      run_id: "r3",
      approval_id: "ga-r",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:z",
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.STALE;
    saveGovernanceApprovalManifest(dir, ap);

    assert.throws(() => enforceReplayGovernanceContinuity(dir), GovernanceEnforcementError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
