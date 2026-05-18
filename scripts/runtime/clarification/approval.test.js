"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  computeFileSha256,
  buildApprovalState,
  validateApprovalState,
  loadApprovalState,
} = require("./approval");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("computeFileSha256 muda quando o conteúdo do ficheiro muda", () => {
  const dir = tmp("sb-sha-");
  try {
    const a = path.join(dir, "a.txt");
    const b = path.join(dir, "b.txt");
    fs.writeFileSync(a, "um", "utf-8");
    fs.writeFileSync(b, "dois", "utf-8");
    const ha = computeFileSha256(a);
    const hb = computeFileSha256(b);
    assert.strictEqual(ha.length, 64);
    assert.strictEqual(hb.length, 64);
    assert.notStrictEqual(ha, hb);
    fs.writeFileSync(a, "alterado", "utf-8");
    const ha2 = computeFileSha256(a);
    assert.notStrictEqual(ha, ha2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validateApprovalState exige campos mínimos", () => {
  const bad = buildApprovalState({
    decision: "approved",
    planRef: "task-plan-refined.md",
    planSha256: "not-a-hash",
    notes: "",
  });
  const v1 = validateApprovalState(bad);
  assert.strictEqual(v1.ok, false);

  const good = buildApprovalState({
    decision: "approved",
    planRef: "task-plan-refined.md",
    planSha256: "a".repeat(64),
    notes: "ok",
  });
  const v2 = validateApprovalState(good);
  assert.strictEqual(v2.ok, true);
});

test("loadApprovalState lê approval-state.json", () => {
  const dir = tmp("sb-appr-load-");
  try {
    const doc = buildApprovalState({
      decision: "rejected",
      planRef: "task-plan-refined.md",
      planSha256: "b".repeat(64),
      notes: "não",
    });
    fs.writeFileSync(
      path.join(dir, "approval-state.json"),
      JSON.stringify(doc, null, 2),
      "utf-8",
    );
    const L = loadApprovalState(dir);
    assert.strictEqual(L.ok, true);
    assert.strictEqual(L.doc.status, "rejected");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
