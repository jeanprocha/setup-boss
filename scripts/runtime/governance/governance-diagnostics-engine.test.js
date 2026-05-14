"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const {
  buildGovernanceDiagnosticsReport,
  summarizeGovernanceTelemetryNdjson,
} = require("./governance-diagnostics-engine");
const { stableStringify } = require("./governance-continuity-fingerprint");
const {
  GOVERNANCE_DIAGNOSTICS_FILENAME,
  GOVERNANCE_RUNTIME_TELEMETRY_FILENAME,
  GOVERNANCE_APPROVAL_STATUS,
} = require("./governance-runtime-constants");
const {
  createGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
} = require("./governance-runtime-manifest");
const {
  buildGovernanceApprovalManifest,
  saveGovernanceApprovalManifest,
} = require("./governance-approval-manifest");
const { formatHumanReport } = require("../../cli/commands/governance-inspect");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-diag-"));
}

function stripGeneratedAt(obj) {
  const o = JSON.parse(JSON.stringify(obj));
  delete o.generated_at;
  return o;
}

test("buildGovernanceDiagnosticsReport — determinístico (sem generated_at)", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "metadata.json"),
      JSON.stringify({ taskArg: "t", projectArg: "p", projectRoot: dir }, null, 2),
      "utf8",
    );
    const a = stripGeneratedAt(buildGovernanceDiagnosticsReport(dir, { persist: false }));
    const b = stripGeneratedAt(buildGovernanceDiagnosticsReport(dir, { persist: false }));
    assert.equal(stableStringify(a), stableStringify(b));
    assert.equal(fs.existsSync(path.join(dir, GOVERNANCE_DIAGNOSTICS_FILENAME)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildGovernanceDiagnosticsReport — persiste governance-diagnostics.json", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "metadata.json"),
      JSON.stringify({ taskArg: "t", projectArg: "p", projectRoot: dir }, null, 2),
      "utf8",
    );
    buildGovernanceDiagnosticsReport(dir, { persist: true });
    assert.ok(fs.existsSync(path.join(dir, GOVERNANCE_DIAGNOSTICS_FILENAME)));
    const doc = JSON.parse(fs.readFileSync(path.join(dir, GOVERNANCE_DIAGNOSTICS_FILENAME), "utf8"));
    assert.equal(doc.schema_version, 1);
    assert.ok(doc.manifests.governance_runtime.present === false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("stale detectado no relatório + explainability", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "metadata.json"),
      JSON.stringify({ taskArg: "t", projectArg: "p", projectRoot: dir }, null, 2),
      "utf8",
    );

    const ap = buildGovernanceApprovalManifest({
      run_id: "r",
      approval_id: "ga-stale",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:x",
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.STALE;
    ap.lineage = { continuity_reason: "continuity_fingerprint_divergence" };
    saveGovernanceApprovalManifest(dir, ap);

    const r = buildGovernanceDiagnosticsReport(dir, { persist: false });
    assert.equal(r.governance_approval_summary.status, "STALE");
    assert.ok(String(r.explanations.stale_why || "").includes("continuity_fingerprint_divergence"));
    assert.equal(r.eligibility.replay_eligible_governance, false);
    assert.equal(r.eligibility.resume_eligible_governance, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("telemetry summary — contagens por kind", () => {
  const dir = tmpDir();
  try {
    const telPath = path.join(dir, GOVERNANCE_RUNTIME_TELEMETRY_FILENAME);
    fs.writeFileSync(
      telPath,
      [
        JSON.stringify({ kind: "governance.replay.blocked", ts: "t1" }),
        JSON.stringify({ kind: "governance.resume.blocked", ts: "t2" }),
        JSON.stringify({ kind: "governance.continuity.stale", ts: "t3" }),
        JSON.stringify({ kind: "governance.approval.invalidated", ts: "t4" }),
      ].join("\n") + "\n",
      "utf8",
    );
    const s = summarizeGovernanceTelemetryNdjson(dir);
    assert.equal(s.events_total, 4);
    assert.equal(s.replay_blocks, 1);
    assert.equal(s.resume_blocks, 1);
    assert.equal(s.stale_events, 1);
    assert.equal(s.invalidation_events, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orphan blocker codes na consistency", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "metadata.json"),
      JSON.stringify({ taskArg: "t", projectArg: "p", projectRoot: dir }, null, 2),
      "utf8",
    );

    const ts = new Date().toISOString();
    fs.writeFileSync(
      path.join(dir, "governance-runtime.json"),
      JSON.stringify({
        schema_version: 1,
        run_id: "r",
        lifecycle_state: "PASSED",
        mode: "report",
        evaluations: [],
        blockers: [{ code: "KEEP", phase: "post_validation", source_runtime: "v", message: "m" }],
        warnings: [],
        telemetry_digest: "sha256:00",
        governance_continuity_fingerprint: "",
        continuity_inputs: [],
        created_at: ts,
        updated_at: ts,
        extensions: { v1: { hooks_completed: [], preflight_ingested: false } },
      }),
      "utf8",
    );

    const doc = buildGovernanceApprovalManifest({
      run_id: "r",
      approval_id: "p1",
      governance_phase: "post_validation",
      blocker_codes: ["KEEP", "MISSING"],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:p",
    });
    saveGovernanceApprovalManifest(dir, doc);

    const r = buildGovernanceDiagnosticsReport(dir, { persist: false });
    assert.deepEqual(r.consistency.orphan_blocker_codes, ["MISSING"]);
    assert.ok(r.consistency.issues.some((i) => i.code === "ORPHAN_BLOCKER_CODES"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("formatHumanReport — inclui mensagem --no-write quando não persistido", () => {
  const r = {
    output_dir_basename: "run-x",
    governance_runtime_summary: null,
    governance_approval_summary: null,
    continuity_readonly: { status: "skipped", reason: null, skipped_legacy_no_bound_fingerprint: false },
    would_sync_mark_stale: {
      would_mark_stale: false,
      bound_fingerprint_prefix: "",
      current_fingerprint_prefix: "",
    },
    eligibility: {
      replay_eligible_governance: true,
      resume_eligible_governance: true,
      resume_eligible_pipeline: false,
      replay_governance: { ok: true },
      resume_governance: { ok: true },
      resume_pipeline: {
        ok: false,
        reason: "RUN_NOT_RESUMABLE: x",
        next_phase: null,
        governance_resume_blocked: false,
        governance_approval_pending: false,
      },
    },
    telemetry_summary: {
      events_total: 0,
      kinds: {},
      replay_blocks: 0,
      resume_blocks: 0,
      stale_events: 0,
      invalidation_events: 0,
      hitl_required_events: 0,
    },
    consistency: { issues: [], orphan_blocker_codes: [], blocker_lineage_ok: true },
    explanations: {
      replay_blocked: null,
      resume_governance_blocked: null,
      stale_why: null,
      fingerprint_divergence: null,
      enforcement_blocker_codes: [],
    },
  };
  const text = formatHumanReport(r, { persisted: false });
  assert.ok(text.includes("Persistência omitida"));
});

test("continuity mismatch reflected no relatório", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "metadata.json"),
      JSON.stringify({ taskArg: "t", projectArg: "p", projectRoot: dir }, null, 2),
      "utf8",
    );

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

    const r = buildGovernanceDiagnosticsReport(dir, { persist: false });
    assert.equal(r.continuity_readonly.status, "mismatch");
    assert.ok(r.explanations.fingerprint_divergence);
    assert.equal(r.eligibility.replay_eligible_governance, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
