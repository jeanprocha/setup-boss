"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  createPreExecutionSnapshot,
  tryAutoRollbackAfterFailure,
  initRollbackStateFile,
  rollbackStatePath,
  snapshotFilePath,
  assertRollbackPathSafe,
  ensureRollbackContractMvp,
} = require("./manage-execution-rollback");

function tmpd(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("snapshot cria backup e snapshot.json (idempotente sem --force)", () => {
  const root = tmpd("rb-snap-");
  try {
    const execDir = path.join(root, "execution");
    fs.mkdirSync(path.join(execDir, "subtasks"), { recursive: true });
    fs.writeFileSync(
      path.join(execDir, "subtasks", "001-execution.json"),
      JSON.stringify(
        {
          version: 1,
          phase: "4.5",
          subtask_id: "001",
          status: "handoff_ready",
          execution_state: "handoff_ready",
          position: 1,
          depends_on: [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    const rel = "src/x.txt";
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "ORIGINAL", "utf-8");
    const events = [];
    const iso = () => new Date().toISOString();
    const r1 = createPreExecutionSnapshot({
      outputDirAbs: root,
      execDir,
      subtaskId: "001",
      allowed_files: [rel],
      force: false,
      events,
      iso,
    });
    assert.strictEqual(r1.skipped, false);
    assert.ok(r1.tracked_files.includes(rel));
    const r2 = createPreExecutionSnapshot({
      outputDirAbs: root,
      execDir,
      subtaskId: "001",
      allowed_files: [rel],
      force: false,
      events,
      iso,
    });
    assert.strictEqual(r2.skipped, true);
    fs.writeFileSync(abs, "MODIFIED", "utf-8");
    const rb = tryAutoRollbackAfterFailure({
      outputDirAbs: root,
      execDir,
      subtaskId: "001",
      trigger: "execution_failed",
      modified_files: [rel],
      allowed_files: [rel],
      events,
      iso,
    });
    assert.strictEqual(rb.ok, true);
    assert.strictEqual(fs.readFileSync(abs, "utf-8"), "ORIGINAL");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("assertRollbackPathSafe bloqueia wildcard e traversal", () => {
  const allow = new Set(["ok/file.txt"]);
  assert.ok(assertRollbackPathSafe("ok/file.txt", allow) == null);
  assert.ok(assertRollbackPathSafe("bad/../x", allow));
  assert.ok(assertRollbackPathSafe("*.js", allow));
});

test("--force em snapshot recria backups", () => {
  const root = tmpd("rb-force-");
  try {
    const execDir = path.join(root, "execution");
    fs.mkdirSync(path.join(execDir, "subtasks"), { recursive: true });
    fs.writeFileSync(
      path.join(execDir, "subtasks", "001-execution.json"),
      JSON.stringify(
        {
          version: 1,
          phase: "4.5",
          subtask_id: "001",
          status: "handoff_ready",
          execution_state: "handoff_ready",
          position: 1,
          depends_on: [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    const rel = "src/y.txt";
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "V1", "utf-8");
    const events = [];
    const iso = () => new Date().toISOString();
    createPreExecutionSnapshot({
      outputDirAbs: root,
      execDir,
      subtaskId: "001",
      allowed_files: [rel],
      force: false,
      events,
      iso,
    });
    createPreExecutionSnapshot({
      outputDirAbs: root,
      execDir,
      subtaskId: "001",
      allowed_files: [rel],
      force: true,
      events,
      iso,
    });
    const snap = JSON.parse(fs.readFileSync(snapshotFilePath(execDir, "001"), "utf-8"));
    assert.strictEqual(snap.version, 1);
    assert.strictEqual(snap.subtask_id, "001");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ensureRollbackContractMvp cria rollback-state mínimo", () => {
  const root = tmpd("rb-ens-");
  try {
    const execDir = path.join(root, "execution");
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(
      path.join(execDir, "execution-session.json"),
      JSON.stringify(
        {
          version: 1,
          phase: "4.8",
          subtask_count: 0,
          rollback_enabled: true,
          rollback_operations: 0,
          rollback_failures: 0,
          snapshots_created: 0,
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(execDir, "execution-diagnostics.json"),
      JSON.stringify({ version: 1, run_id: "x", events: [], summary: { total_subtasks: 0 } }, null, 2),
      "utf-8",
    );
    ensureRollbackContractMvp(root);
    assert.ok(fs.existsSync(rollbackStatePath(execDir)));
    const s = JSON.parse(fs.readFileSync(path.join(execDir, "execution-session.json"), "utf-8"));
    assert.strictEqual(s.phase, "4.11");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("initRollbackStateFile cria documento inicial", () => {
  const root = tmpd("rb-init-");
  try {
    const execDir = path.join(root, "execution");
    const doc = initRollbackStateFile(execDir, false);
    assert.strictEqual(Number(doc.version), 1);
    assert.strictEqual(String(doc.phase), "4.11");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
