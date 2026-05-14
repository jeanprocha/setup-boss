"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const {
  SEMANTIC_MUTATION_GRAPH_FILENAME,
  PROPAGATION_MANIFEST_FILENAME,
  MutationReasonCodes,
} = require("../../semantic-dependency-runtime/overlay/constants");

const {
  buildSemanticContinuitySlice,
  diffSemanticInputsByKind,
} = require("./governance-semantic-continuity");

const {
  buildGovernanceContinuityPack,
} = require("./governance-continuity-fingerprint");

const {
  syncGovernanceContinuityAndStaleApproval,
} = require("./governance-continuity");

const {
  createGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
  loadGovernanceRuntimeManifest,
} = require("./governance-runtime-manifest");

const {
  buildGovernanceApprovalManifest,
  saveGovernanceApprovalManifest,
  loadGovernanceApprovalManifest,
} = require("./governance-approval-manifest");

const {
  evaluateGovernanceResumeReplayGate,
} = require("./governance-state-validator");

const { GovernanceEnforcementError } = require("./governance-enforcement-error");
const { enforceReplayGovernanceContinuity } = require("./governance-continuity");
const { assessResume } = require("../replay/resume-engine");

const { GOVERNANCE_APPROVAL_STATUS } = require("./governance-runtime-constants");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-sem-"));
}

function writeJson(d, rel, obj) {
  fs.writeFileSync(path.join(d, rel), JSON.stringify(obj, null, 2), "utf8");
}

function fp64(ch) {
  return String(ch).repeat(64).slice(0, 64);
}

/** @returns {string} */
function writeSemanticArtifacts(dir, mutFpHex, projFpHex) {
  writeJson(dir, SEMANTIC_MUTATION_GRAPH_FILENAME, {
    schema_version: "semantic-mutation-graph/1",
    overlay_id: "ov-sem-test",
    graph_id: "g-sem-test",
    graph_fingerprint_ref: "ref",
    roots: [{ path: "a.ts", reason_codes: [MutationReasonCodes.DIRECT_CHANGE] }],
    propagation_fingerprint_sha256: mutFpHex,
    propagation_summary: { impacted_nodes_count: 1 },
    impacted_nodes: [
      {
        node_id: "n1",
        path: "a.ts",
        reason_codes: [MutationReasonCodes.DIRECT_CHANGE],
        distance_from_root: 0,
        discovered_from: "a.ts",
      },
    ],
    impacted_edges: [],
    limits_snapshot: {},
    limits_execution: {},
  });
  writeJson(dir, PROPAGATION_MANIFEST_FILENAME, {
    schema_version: "propagation-manifest/1",
    impacted_paths: ["a.ts"],
    propagation_fingerprint_sha256: projFpHex,
  });
}

test("semantic continuity slice — fingerprints determinísticos", () => {
  const dir = tmpDir();
  try {
    writeJson(dir, VALIDATION_RESULTS_FILENAME, {
      metadata: { graph_fingerprint_sha256: "abc" },
      validators: [{ replay_fingerprint_sha256: "z" }],
    });
    writeSemanticArtifacts(dir, fp64("m"), fp64("p"));
    const a = buildSemanticContinuitySlice(dir);
    const b = buildSemanticContinuitySlice(dir);
    assert.equal(a.semantic_continuity_fingerprint, b.semantic_continuity_fingerprint);

    writeSemanticArtifacts(dir, fp64("m"), fp64("q"));
    const c = buildSemanticContinuitySlice(dir);
    assert.notEqual(a.semantic_continuity_fingerprint, c.semantic_continuity_fingerprint);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("governance agregador estável quando só artifacts semânticos mudam", () => {
  const dir = tmpDir();
  try {
    writeJson(dir, VALIDATION_RESULTS_FILENAME, {
      metadata: { graph_fingerprint_sha256: "ggg" },
      validators: [{ replay_fingerprint_sha256: "bbb" }],
    });
    writeSemanticArtifacts(dir, fp64("1"), fp64("2"));
    const gm = createGovernanceRuntimeManifest("r-sem", "report");
    saveGovernanceRuntimeManifest(dir, gm);

    const p1 = buildGovernanceContinuityPack(dir, [], []);
    writeSemanticArtifacts(dir, fp64("9"), fp64("2"));
    const p2 = buildGovernanceContinuityPack(dir, [], []);
    assert.equal(p1.governance_continuity_fingerprint, p2.governance_continuity_fingerprint);
    assert.notEqual(p1.semantic_continuity_fingerprint, p2.semantic_continuity_fingerprint);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sync marca STALE só por drift semântico + lineage semantics", () => {
  const dir = tmpDir();
  try {
    writeJson(dir, VALIDATION_RESULTS_FILENAME, {
      metadata: { graph_fingerprint_sha256: "u" },
      validators: [],
    });
    writeSemanticArtifacts(dir, fp64("x"), fp64("y"));

    const gm = createGovernanceRuntimeManifest("r-sem2", "report");
    saveGovernanceRuntimeManifest(dir, gm);
    const gr = loadGovernanceRuntimeManifest(dir);
    const pack0 = buildGovernanceContinuityPack(dir, gr.evaluations, gr.blockers);

    const ap = buildGovernanceApprovalManifest({
      run_id: "r-sem2",
      approval_id: "ga-sem",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:s",
      governance_continuity_fingerprint: pack0.governance_continuity_fingerprint,
      continuity_inputs: pack0.continuity_inputs,
      semantic_continuity_fingerprint: pack0.semantic_continuity_fingerprint,
      semantic_continuity_inputs: pack0.semantic_continuity_inputs,
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.APPROVED;
    saveGovernanceApprovalManifest(dir, ap);

    writeSemanticArtifacts(dir, fp64("z"), fp64("y"));

    const sink = { lines: [], appendNdjson(r) {
      this.lines.push(r); } };

    const r = syncGovernanceContinuityAndStaleApproval(dir, { sink });
    assert.equal(r.approval_stale_written, true);

    const ap2 = loadGovernanceApprovalManifest(dir);
    assert.equal(ap2.status, GOVERNANCE_APPROVAL_STATUS.STALE);
    assert.equal(ap2.lineage.semantic_invalidated_by, "semantic:continuity_fingerprint_divergence");
    assert.ok(ap2.lineage.previous_semantic_fingerprint);
    assert.ok(sink.lines.some((x) => x.kind === "semantic.continuity.stale"));
    assert.ok(sink.lines.some((x) => x.kind === "semantic.approval.invalidated"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("replay/resume gates bloqueados + telemetry quando semantic diverge", () => {
  const dir = tmpDir();
  try {
    writeJson(dir, "metadata.json", {
      taskArg: "t",
      projectArg: "p",
      projectRoot: path.join(dir, "proj"),
    });
    fs.mkdirSync(path.join(dir, "proj"), { recursive: true });

    writeJson(dir, VALIDATION_RESULTS_FILENAME, {
      metadata: { graph_fingerprint_sha256: "s" },
      validators: [],
    });
    writeSemanticArtifacts(dir, fp64("a"), fp64("b"));

    const gm = createGovernanceRuntimeManifest("r-rep", "report");
    saveGovernanceRuntimeManifest(dir, gm);
    const gr = loadGovernanceRuntimeManifest(dir);
    const packBind = buildGovernanceContinuityPack(dir, gr.evaluations, gr.blockers);

    const ap = buildGovernanceApprovalManifest({
      run_id: "r-rep",
      approval_id: "ga-rep-sem",
      governance_phase: "post_validation",
      blocker_codes: [],
      requested_by_runtime: "test",
      scope_fingerprint: "sha256:s",
      governance_continuity_fingerprint: packBind.governance_continuity_fingerprint,
      continuity_inputs: packBind.continuity_inputs,
      semantic_continuity_fingerprint: packBind.semantic_continuity_fingerprint,
      semantic_continuity_inputs: packBind.semantic_continuity_inputs,
    });
    ap.status = GOVERNANCE_APPROVAL_STATUS.APPROVED;
    saveGovernanceApprovalManifest(dir, ap);

    writeSemanticArtifacts(dir, fp64("c"), fp64("b"));

    const sinkReplay = {
      rows: [], appendNdjson(rec) {
        this.rows.push(rec); },
    };
    const gReplay = evaluateGovernanceResumeReplayGate(dir, "replay", {
      sink: sinkReplay,
      telemetry: null,
    });
    assert.equal(gReplay.ok, false);
    assert.ok(sinkReplay.rows.some((x) => x.kind === "semantic.replay.blocked"));

    const sinkRs = {
      rows: [], appendNdjson(rec) {
        this.rows.push(rec); },
    };
    const gResume = evaluateGovernanceResumeReplayGate(dir, "resume", {
      sink: sinkRs,
      telemetry: null,
    });
    assert.equal(gResume.ok, false);
    assert.ok(sinkRs.rows.some((x) => x.kind === "semantic.resume.blocked"));

    assert.throws(
      () =>
        enforceReplayGovernanceContinuity(dir, {
          telemetry: null,
          sink: { appendNdjson() {} },
        }),
      GovernanceEnforcementError,
    );

    const telPath = path.join(dir, "governance-runtime-telemetry.ndjson");
    try {
      if (fs.existsSync(telPath)) fs.unlinkSync(telPath);
    } catch (_) {
      /* */
    }

    const rs = assessResume(dir);
    assert.equal(rs.ok, false);
    assert.equal(rs.governance_resume_blocked_stale, true);
    const telRaw = fs.existsSync(telPath) ? fs.readFileSync(telPath, "utf8") : "";
    assert.match(telRaw, /governance.resume.blocked/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("diffSemanticInputsByKind — union simétrica", () => {
  const bound = [{ kind: "k1", ref: "r", value: "a" }];
  const cur = [{ kind: "k1", ref: "r", value: "b" }];
  const d = diffSemanticInputsByKind(bound, cur);
  assert.ok(d.reasons_sorted.length >= 1);
});
