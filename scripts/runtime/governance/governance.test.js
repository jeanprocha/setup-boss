/**
 * Smoke tests da camada de governança / apply físico.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { evaluateApplyGovernance, appendResumeGovernanceAudit } = require("./policy-engine");

function mkProj(profile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "setup-boss-gov-"));
  fs.mkdirSync(path.join(tmp, ".setup-boss"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".setup-boss", "policy.json"),
    JSON.stringify({ profile }),
    "utf8",
  );
  return tmp;
}

function teardown(tmp) {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {
    /* best-effort */
  }
}

{
  const tmp = mkProj("STRICT");
  try {
    const agBlock = evaluateApplyGovernance({
      projectRootAbs: tmp,
      changes: [{ path: "src/orchestration.js", operation: "patch" }],
      forcePolicyBypass: false,
      policyProfileCli: null,
      disableGovernance: false,
    });
    assert.strictEqual(
      agBlock.ok,
      false,
      "STRICT deve bloquear apply físico com path protegido (orchestration.js)",
    );
    assert.strictEqual(Boolean(agBlock.message), true);

    const agBypass = evaluateApplyGovernance({
      projectRootAbs: tmp,
      changes: [{ path: "src/orchestration.js", operation: "patch" }],
      forcePolicyBypass: true,
      policyProfileCli: null,
      disableGovernance: false,
    });
    assert.strictEqual(
      agBypass.ok,
      true,
      "com bypass explícito o apply físico deve ser permitido mesmo com paths sensíveis",
    );

    const agSafe = evaluateApplyGovernance({
      projectRootAbs: tmp,
      changes: [{ path: "src/ui/Button.tsx", operation: "patch" }],
      forcePolicyBypass: false,
      policyProfileCli: null,
      disableGovernance: false,
    });
    assert.strictEqual(
      agSafe.ok,
      true,
      "path não protegido deve passar sem bypass",
    );
  } finally {
    teardown(tmp);
  }
}

{
  const tmp = mkProj("FAST");
  try {
    const ag = evaluateApplyGovernance({
      projectRootAbs: tmp,
      changes: [{ path: "src/orchestration.js", operation: "patch" }],
      forcePolicyBypass: false,
      policyProfileCli: null,
      disableGovernance: false,
    });
    assert.strictEqual(
      ag.ok,
      true,
      "FAST (block_physical_apply_when_protected_match=false) permite apply com path protegido",
    );
    const hasWarn =
      Array.isArray(ag.decisions) &&
      ag.decisions.some((d) => String(d.severity || "") === "WARN");
    assert.strictEqual(hasWarn, true, "FAST deve registar WARN para path protegido");
  } finally {
    teardown(tmp);
  }
}

{
  const proj = mkProj("NORMAL");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "setup-boss-gov-out-"));
  try {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, "governance-decisions.json"),
      JSON.stringify({ governance_schema: "2.7-governance-decisions", decisions: [] }),
      "utf8",
    );
    appendResumeGovernanceAudit(out, {
      projectRootAbs: proj,
      nextPhase: "executor",
      policyProfileCli: "STRICT",
      forcePolicyBypass: true,
      disableGovernance: false,
    });
    const merged = JSON.parse(
      fs.readFileSync(path.join(out, "governance-decisions.json"), "utf8"),
    );
    assert.strictEqual(merged.governance_schema, "2.7-governance-decisions");
    assert(merged.resume_cli_audit && typeof merged.resume_cli_audit === "object");
    assert.strictEqual(merged.resume_cli_audit.policy_profile_cli, "STRICT");
    assert.strictEqual(merged.resume_cli_audit.force_policy_bypass, true);
    assert.strictEqual(merged.resume_cli_audit.next_phase, "executor");
  } finally {
    teardown(proj);
    teardown(out);
  }
}

console.log("✅ governance.test.js OK");
