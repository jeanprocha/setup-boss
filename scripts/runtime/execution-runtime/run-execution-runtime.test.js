"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { runExecutionRuntimeBase } = require("./run-execution-runtime");
const { validateExecutionRuntimeResult, validateExecutionRuntime } = require("./validate-execution-runtime");
const { seedOutputWithStrategy } = require("../../smoke/fixtures/seed-execution-mvp-strategy-output");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const EXECUTE_JS = path.join(REPO_ROOT, "scripts", "execute.js");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("runExecutionRuntimeBase inicializa e gera artefactos", () => {
  const root = tmp("sb-exec41-");
  try {
    const runId = "test-exec-41";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 2 });

    const r = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, true);
    assert.ok(Array.isArray(r.artifacts));

    const execDir = path.join(out, "execution");
    assert.ok(fs.existsSync(execDir));
    assert.ok(fs.existsSync(path.join(execDir, "execution-session.json")));
    assert.ok(fs.existsSync(path.join(execDir, "execution-diagnostics.json")));
    assert.ok(fs.existsSync(path.join(execDir, "execution-observability.json")));

    const session = JSON.parse(fs.readFileSync(path.join(execDir, "execution-session.json"), "utf-8"));
    assert.strictEqual(session.version, 1);
    assert.strictEqual(session.phase, "4.11");
    assert.strictEqual(session.status, "executor_mvp_step_succeeded");
    assert.strictEqual(session.execution_mode, "linear_mvp");
    assert.strictEqual(session.subtask_count, 2);
    assert.strictEqual(session.total_subtasks, 2);
    assert.strictEqual(session.completed_subtasks, 1);
    assert.strictEqual(session.failed_subtasks, 0);
    assert.strictEqual(session.current_subtask, "002");
    assert.strictEqual(session.prepared_subtasks, 2);
    assert.strictEqual(session.handoff_ready_subtasks, 1);
    assert.strictEqual(session.running_subtasks, 0);
    assert.strictEqual(session.execution_completed_subtasks, 1);
    assert.strictEqual(session.validated_subtasks, 1);
    assert.strictEqual(session.patch_validation_failed_subtasks, 0);
    assert.strictEqual(session.reviewed_subtasks, 1);
    assert.strictEqual(session.approved_subtasks, 1);
    assert.strictEqual(session.rejected_subtasks, 0);
    assert.strictEqual(session.blocked_subtasks, 0);
    assert.strictEqual(session.execution_failed_subtasks, 0);
    assert.strictEqual(session.last_completed_subtask, "001");
    assert.deepStrictEqual(session.subtask_states, {
      pending: 0,
      ready: 1,
      completed: 1,
      failed: 0,
    });
    assert.strictEqual(session.execution_state, "pending");

    assert.ok(fs.existsSync(path.join(execDir, "subtasks", "001-execution.json")));
    assert.ok(fs.existsSync(path.join(execDir, "subtasks", "002-execution.json")));
    assert.ok(fs.existsSync(path.join(execDir, "handoffs", "001-architect-handoff.json")));
    assert.ok(fs.existsSync(path.join(execDir, "handoffs", "002-architect-handoff.json")));
    assert.ok(fs.existsSync(path.join(execDir, "results", "001-execution-result.json")));
    assert.ok(fs.existsSync(path.join(execDir, "results", "001-patch-validation.json")));
    assert.ok(fs.existsSync(path.join(execDir, "results", "001-execution-review.json")));
    assert.ok(fs.existsSync(path.join(execDir, "results", "001-correction-loop.json")));
    assert.ok(fs.existsSync(path.join(execDir, "results", "002-correction-loop.json")));

    const ex001 = JSON.parse(fs.readFileSync(path.join(execDir, "subtasks", "001-execution.json"), "utf-8"));
    assert.strictEqual(ex001.execution_state, "review_completed");
    assert.strictEqual(ex001.status, "review_completed");
    assert.strictEqual(ex001.review_state, "approved");
    assert.strictEqual(ex001.validation_state, "passed");
    assert.ok(typeof ex001.validation_completed_at === "string" && ex001.validation_completed_at.length > 0);

    const ex002 = JSON.parse(fs.readFileSync(path.join(execDir, "subtasks", "002-execution.json"), "utf-8"));
    assert.strictEqual(ex002.execution_state, "handoff_ready");
    assert.strictEqual(ex002.status, "handoff_ready");

    const res001 = JSON.parse(fs.readFileSync(path.join(execDir, "results", "001-execution-result.json"), "utf-8"));
    assert.strictEqual(res001.phase, "4.4");
    assert.strictEqual(res001.status, "completed");
    assert.ok(Array.isArray(res001.modified_files) && res001.modified_files.includes("src/a.js"));

    const markerPath = path.join(out, "src", "a.js");
    assert.ok(fs.existsSync(markerPath));
    assert.ok(fs.readFileSync(markerPath, "utf-8").includes("setup-boss:executor-mvp-marker"));

    const ho001 = JSON.parse(fs.readFileSync(path.join(execDir, "handoffs", "001-architect-handoff.json"), "utf-8"));
    assert.strictEqual(ho001.phase, "4.3");
    assert.deepStrictEqual(ho001.allowed_files, ["src/a.js", "docs/readme.md"]);
    assert.ok(ho001.architect_context && ho001.architect_context.summary);
    assert.strictEqual(ho001.architect_context.ai_strategy.recommended_mode, "standard");

    const diag = JSON.parse(fs.readFileSync(path.join(execDir, "execution-diagnostics.json"), "utf-8"));
    assert.strictEqual(diag.version, 1);
    const types = diag.events.map((e) => e.type);
    assert.ok(types.includes("execution_runtime_started"));
    assert.ok(types.includes("subtask_execution_initialized"));
    assert.ok(types.includes("subtask_execution_state_created"));
    assert.ok(types.includes("architect_handoff_completed"));
    assert.ok(types.includes("subtask_execution_started"));
    assert.ok(types.includes("subtask_execution_completed"));
    assert.ok(types.includes("patch_validation_started"));
    assert.ok(types.includes("patch_validation_completed"));
    assert.ok(types.includes("execution_review_started"));
    assert.ok(types.includes("execution_review_completed"));
    assert.strictEqual(diag.summary.total_subtasks, 2);
    assert.strictEqual(diag.summary.pending_subtasks, 0);
    assert.strictEqual(diag.summary.subtask_count, 2);
    assert.strictEqual(diag.summary.prepared_subtasks, 2);
    assert.strictEqual(diag.summary.handoff_ready_subtasks, 1);
    assert.strictEqual(diag.summary.execution_completed_subtasks, 1);
    assert.strictEqual(diag.summary.validated_subtasks, 1);
    assert.strictEqual(diag.summary.failed_validations, 0);
    assert.strictEqual(diag.summary.warnings_total, 0);
    assert.strictEqual(diag.summary.errors_total, 0);
    assert.strictEqual(diag.summary.approved_subtasks, 1);
    assert.strictEqual(diag.summary.rejected_subtasks, 0);
    assert.strictEqual(diag.summary.blocked_subtasks, 0);
    assert.strictEqual(diag.summary.review_failures, 0);
    assert.strictEqual(diag.summary.modified_files_total, 1);
    assert.strictEqual(diag.summary.execution_mode, "linear_mvp");
    assert.strictEqual(diag.summary.correction_attempts_total, 0);
    assert.strictEqual(diag.summary.corrected_subtasks, 0);
    assert.strictEqual(diag.summary.correction_failures, 0);
    assert.strictEqual(diag.summary.retry_exhausted, 0);
    assert.strictEqual(session.correction_attempts_total, 0);
    assert.strictEqual(session.corrected_subtasks, 0);
    assert.strictEqual(session.correction_failed_subtasks, 0);
    assert.strictEqual(session.retry_exhausted_subtasks, 0);

    const rc = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
    assert.ok(rc.phase4);
    assert.strictEqual(rc.phase4.status, "executor_mvp_step_succeeded");

    const v = validateExecutionRuntimeResult(out);
    assert.strictEqual(v.ok, true, v.errors.join("; "));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("handoff inválido falha", () => {
  const root = tmp("sb-exec41-bad-");
  try {
    const runId = "test-exec-bad";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1, badHandoffStatus: true });

    const r = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error && r.error.code);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validation detecta execution-order incoerente", () => {
  const root = tmp("sb-exec41-mis-");
  try {
    const runId = "test-exec-mis";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 2, orderMismatch: true });

    const r = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reexecução sem --force é idempotente (skip)", () => {
  const root = tmp("sb-exec41-idem-");
  try {
    const runId = "test-exec-idem";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });

    const r1 = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r1.ok, true);
    const sessionPath = path.join(out, "execution", "execution-session.json");
    const firstCreated = JSON.parse(fs.readFileSync(sessionPath, "utf-8")).created_at;

    const r2 = runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.skipped, true);
    const secondCreated = JSON.parse(fs.readFileSync(sessionPath, "utf-8")).created_at;
    assert.strictEqual(secondCreated, firstCreated);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI execute com --run resolve pasta e valida", () => {
  const root = tmp("sb-exec41-cli-");
  try {
    const runId = "test-exec-cli";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });

    const pr = spawnSync(process.execPath, [EXECUTE_JS, "--run", out, "--json"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    assert.strictEqual(pr.status, 0, pr.stderr || pr.stdout);
    const j = JSON.parse(pr.stdout);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.skipped, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI execute com --force re-inicializa (não skip)", () => {
  const root = tmp("sb-exec41-force-");
  try {
    const runId = "test-exec-force";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });

    const pr1 = spawnSync(process.execPath, [EXECUTE_JS, "--run", out, "--json"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    assert.strictEqual(pr1.status, 0, pr1.stderr || pr1.stdout);
    const first = JSON.parse(pr1.stdout);
    assert.strictEqual(first.skipped, false);

    const pr2 = spawnSync(process.execPath, [EXECUTE_JS, "--run", out, "--json"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    assert.strictEqual(pr2.status, 0, pr2.stderr || pr2.stdout);
    const second = JSON.parse(pr2.stdout);
    assert.strictEqual(second.skipped, true);

    const pr3 = spawnSync(process.execPath, [EXECUTE_JS, "--run", out, "--force", "--json"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    assert.strictEqual(pr3.status, 0, pr3.stderr || pr3.stdout);
    const third = JSON.parse(pr3.stdout);
    assert.strictEqual(third.skipped, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("depends_on propagado para NNN-execution.json", () => {
  const root = tmp("sb-exec42-dep-");
  try {
    const runId = "test-exec-deps";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 2, chainDeps: true });

    const r = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r.ok, true);
    const p002 = path.join(out, "execution", "subtasks", "002-execution.json");
    const d = JSON.parse(fs.readFileSync(p002, "utf-8"));
    assert.deepStrictEqual(d.depends_on, ["001"]);
    assert.strictEqual(d.position, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validation falha sem execution/subtasks completo", () => {
  const root = tmp("sb-exec42-val-");
  try {
    const runId = "test-exec-valsub";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 2 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    fs.rmSync(path.join(out, "execution", "subtasks"), { recursive: true, force: true });
    const v = validateExecutionRuntimeResult(out);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("subtasks")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validation falha com position inválida", () => {
  const root = tmp("sb-exec42-pos-");
  try {
    const runId = "test-exec-pos";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const p = path.join(out, "execution", "subtasks", "001-execution.json");
    const d = JSON.parse(fs.readFileSync(p, "utf-8"));
    d.position = 9;
    fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
    const errs = validateExecutionRuntime(out);
    assert.ok(errs.some((e) => e.includes("position")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("idempotência sem --force preserva ficheiros de subtask", () => {
  const root = tmp("sb-exec42-pres-");
  try {
    const runId = "test-exec-pres";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const p = path.join(out, "execution", "subtasks", "001-execution.json");
    const before = fs.readFileSync(p, "utf-8");
    const r2 = runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false });
    assert.strictEqual(r2.skipped, true);
    const after = fs.readFileSync(p, "utf-8");
    assert.strictEqual(before, after);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("--force recria subtasks-execution", () => {
  const root = tmp("sb-exec42-frec-");
  try {
    const runId = "test-exec-frec";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const p = path.join(out, "execution", "subtasks", "001-execution.json");
    const c1 = JSON.parse(fs.readFileSync(p, "utf-8")).created_at;
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId, force: true }).ok, true);
    const c2 = JSON.parse(fs.readFileSync(p, "utf-8")).created_at;
    assert.notStrictEqual(c2, c1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validation falha sem architect-handoff", () => {
  const root = tmp("sb-exec43-noho-");
  try {
    const runId = "test-exec-noho";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    fs.rmSync(path.join(out, "execution", "handoffs", "001-architect-handoff.json"));
    const v = validateExecutionRuntimeResult(out);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("architect-handoff") || e.includes("handoffs")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validation falha com wildcard em allowed_files", () => {
  const root = tmp("sb-exec43-wc-");
  try {
    const runId = "test-exec-wc";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const hp = path.join(out, "execution", "handoffs", "001-architect-handoff.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf-8"));
    h.allowed_files = ["src/*.js"];
    fs.writeFileSync(hp, JSON.stringify(h, null, 2), "utf-8");
    const v = validateExecutionRuntimeResult(out);
    assert.strictEqual(v.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("idempotência preserva architect-handoff (session reparada)", () => {
  const root = tmp("sb-exec43-idh-");
  try {
    const runId = "test-exec-idh";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const hp = path.join(out, "execution", "handoffs", "001-architect-handoff.json");
    const createdBefore = JSON.parse(fs.readFileSync(hp, "utf-8")).created_at;
    const sessionPath = path.join(out, "execution", "execution-session.json");
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    session.prepared_subtasks = 0;
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), "utf-8");
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false }).ok, true);
    const createdAfter = JSON.parse(fs.readFileSync(hp, "utf-8")).created_at;
    assert.strictEqual(createdAfter, createdBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("--force recria architect-handoff (created_at novo)", () => {
  const root = tmp("sb-exec43-fho-");
  try {
    const runId = "test-exec-fho";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const hp = path.join(out, "execution", "handoffs", "001-architect-handoff.json");
    const c1 = JSON.parse(fs.readFileSync(hp, "utf-8")).created_at;
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId, force: true }).ok, true);
    const c2 = JSON.parse(fs.readFileSync(hp, "utf-8")).created_at;
    assert.notStrictEqual(c2, c1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("segunda execução processa 002 quando 001 já completou", () => {
  const root = tmp("sb-exec44-2nd-");
  try {
    const runId = "test-exec-44-2nd";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 2 });
    const r1 = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r1.ok, true, r1.error && r1.error.message);
    const r2 = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.skipped, false);
    const s = JSON.parse(fs.readFileSync(path.join(out, "execution", "execution-session.json"), "utf-8"));
    assert.strictEqual(s.execution_completed_subtasks, 2);
    assert.strictEqual(s.validated_subtasks, 2);
    assert.strictEqual(s.reviewed_subtasks, 2);
    assert.strictEqual(s.approved_subtasks, 2);
    assert.strictEqual(s.patch_validation_failed_subtasks, 0);
    assert.strictEqual(s.handoff_ready_subtasks, 0);
    assert.strictEqual(validateExecutionRuntimeResult(out).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validation falha quando modified_files fora de allowed_files", () => {
  const root = tmp("sb-exec44-scope-");
  try {
    const runId = "test-exec-scope";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const rp = path.join(out, "execution", "results", "001-execution-result.json");
    const res = JSON.parse(fs.readFileSync(rp, "utf-8"));
    res.modified_files = ["outside/forbidden.js"];
    res.validation = { allowed_scope_respected: true, unexpected_files: [] };
    fs.writeFileSync(rp, JSON.stringify(res, null, 2), "utf-8");
    const v = validateExecutionRuntimeResult(out);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("allowed_files") || e.includes("modified_files")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("terceira execução com tudo completo faz skip", () => {
  const root = tmp("sb-exec44-skip3-");
  try {
    const runId = "test-exec-skip3";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 2 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);
    const r3 = runExecutionRuntimeBase({ outputDirAbs: out, runId });
    assert.strictEqual(r3.ok, true);
    assert.strictEqual(r3.skipped, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Fase 4.8: correction retry após rejected aprova na segunda execução", () => {
  const root = tmp("sb-exec47-retry-");
  try {
    const runId = "test-exec47-retry";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);

    const execDir = path.join(out, "execution");
    const subPath = path.join(execDir, "subtasks", "001-execution.json");
    const sub = JSON.parse(fs.readFileSync(subPath, "utf-8"));
    sub.status = "review_failed";
    sub.execution_state = "review_failed";
    sub.review_state = "rejected";
    sub.review_decision = { result: "rejected", requires_correction: false, blocking: false };
    fs.writeFileSync(subPath, JSON.stringify(sub, null, 2), "utf-8");

    const r2 = runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.skipped, false);

    const session = JSON.parse(fs.readFileSync(path.join(execDir, "execution-session.json"), "utf-8"));
    assert.strictEqual(session.phase, "4.11");
    assert.strictEqual(session.correction_attempts_total, 1);
    assert.strictEqual(session.corrected_subtasks, 1);
    assert.strictEqual(session.approved_subtasks, 1);
    assert.strictEqual(session.rejected_subtasks, 0);

    const loop = JSON.parse(fs.readFileSync(path.join(execDir, "results", "001-correction-loop.json"), "utf-8"));
    assert.strictEqual(loop.status, "correction_completed");
    assert.strictEqual(loop.correction_state, "retry_completed");
    assert.strictEqual(loop.attempt, 1);

    const sub2 = JSON.parse(fs.readFileSync(subPath, "utf-8"));
    assert.strictEqual(sub2.execution_state, "review_completed");
    assert.strictEqual(sub2.correction_attempts, 1);
    assert.ok(sub2.correction_completed_at);

    const diag = JSON.parse(fs.readFileSync(path.join(execDir, "execution-diagnostics.json"), "utf-8"));
    const types = diag.events.map((e) => e.type);
    assert.ok(types.includes("correction_started"));
    assert.ok(types.includes("correction_retry_started"));
    assert.ok(types.includes("correction_completed"));
    assert.strictEqual(diag.summary.correction_attempts_total, 1);
    assert.strictEqual(diag.summary.corrected_subtasks, 1);

    assert.strictEqual(validateExecutionRuntimeResult(out).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Fase 4.8: blocked não entra em correction", () => {
  const root = tmp("sb-exec47-blocked-");
  try {
    const runId = "test-exec47-blocked";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);

    const execDir = path.join(out, "execution");
    const subPath = path.join(execDir, "subtasks", "001-execution.json");
    const sub = JSON.parse(fs.readFileSync(subPath, "utf-8"));
    sub.status = "review_failed";
    sub.execution_state = "review_failed";
    sub.review_state = "blocked";
    sub.review_decision = { result: "blocked", requires_correction: false, blocking: true };
    fs.writeFileSync(subPath, JSON.stringify(sub, null, 2), "utf-8");

    const rvPath = path.join(execDir, "results", "001-execution-review.json");
    const rv = JSON.parse(fs.readFileSync(rvPath, "utf-8"));
    rv.status = "review_failed";
    rv.review_state = "blocked";
    rv.decision = { result: "blocked", requires_correction: false, blocking: true };
    fs.writeFileSync(rvPath, JSON.stringify(rv, null, 2), "utf-8");

    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false }).ok, true);
    const loop = JSON.parse(fs.readFileSync(path.join(execDir, "results", "001-correction-loop.json"), "utf-8"));
    assert.strictEqual(loop.status, "idle");
    const session = JSON.parse(fs.readFileSync(path.join(execDir, "execution-session.json"), "utf-8"));
    assert.strictEqual(session.correction_attempts_total, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Fase 4.8: retry_exhausted quando correction_attempts já esgotou", () => {
  const root = tmp("sb-exec47-ex-");
  try {
    const runId = "test-exec47-ex";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);

    const execDir = path.join(out, "execution");
    const subPath = path.join(execDir, "subtasks", "001-execution.json");
    const sub = JSON.parse(fs.readFileSync(subPath, "utf-8"));
    sub.status = "review_failed";
    sub.execution_state = "review_failed";
    sub.review_state = "rejected";
    sub.review_decision = { result: "rejected", requires_correction: false, blocking: false };
    sub.correction_attempts = 2;
    fs.writeFileSync(subPath, JSON.stringify(sub, null, 2), "utf-8");

    const rvPath = path.join(execDir, "results", "001-execution-review.json");
    const rv = JSON.parse(fs.readFileSync(rvPath, "utf-8"));
    rv.status = "review_failed";
    rv.review_state = "rejected";
    rv.decision = { result: "rejected", requires_correction: false, blocking: false };
    fs.writeFileSync(rvPath, JSON.stringify(rv, null, 2), "utf-8");

    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false }).ok, true);

    const sub2 = JSON.parse(fs.readFileSync(subPath, "utf-8"));
    assert.strictEqual(sub2.correction_attempts, 2);
    assert.strictEqual(sub2.execution_state, "review_failed");

    const loop = JSON.parse(fs.readFileSync(path.join(execDir, "results", "001-correction-loop.json"), "utf-8"));
    assert.strictEqual(loop.status, "retry_exhausted");
    assert.strictEqual(loop.retry_allowed, false);

    const session = JSON.parse(fs.readFileSync(path.join(execDir, "execution-session.json"), "utf-8"));
    assert.strictEqual(session.retry_exhausted_subtasks, 1);
    const diag = JSON.parse(fs.readFileSync(path.join(execDir, "execution-diagnostics.json"), "utf-8"));
    assert.ok(diag.events.some((e) => e.type === "correction_retry_exhausted"));

    assert.strictEqual(validateExecutionRuntimeResult(out).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Fase 4.8: idempotência correction_completed sem --force não reexecuta", () => {
  const root = tmp("sb-exec47-idem-");
  try {
    const runId = "test-exec47-idem";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);

    const execDir = path.join(out, "execution");
    const subPath = path.join(execDir, "subtasks", "001-execution.json");
    const sub = JSON.parse(fs.readFileSync(subPath, "utf-8"));
    sub.status = "review_failed";
    sub.execution_state = "review_failed";
    sub.review_state = "rejected";
    sub.review_decision = { result: "rejected", requires_correction: false, blocking: false };
    fs.writeFileSync(subPath, JSON.stringify(sub, null, 2), "utf-8");

    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false }).ok, true);
    const att1 = JSON.parse(fs.readFileSync(subPath, "utf-8")).correction_attempts;

    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId, force: false }).ok, true);
    const att2 = JSON.parse(fs.readFileSync(subPath, "utf-8")).correction_attempts;
    assert.strictEqual(att1, att2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Fase 4.8: hasCorrectionWorkPending ignora loop completed salvo com --force", () => {
  const root = tmp("sb-exec47-hcwp-");
  try {
    const runId = "test-exec47-hcwp";
    const out = path.join(root, "docs", ".IA", "outputs", runId);
    fs.mkdirSync(out, { recursive: true });
    seedOutputWithStrategy(out, { n: 1 });
    assert.strictEqual(runExecutionRuntimeBase({ outputDirAbs: out, runId }).ok, true);

    const execDir = path.join(out, "execution");
    const subPath = path.join(execDir, "subtasks", "001-execution.json");
    const sub = JSON.parse(fs.readFileSync(subPath, "utf-8"));
    sub.status = "review_failed";
    sub.execution_state = "review_failed";
    sub.review_state = "rejected";
    sub.review_decision = { result: "rejected", requires_correction: false, blocking: false };
    sub.correction_attempts = 0;
    fs.writeFileSync(subPath, JSON.stringify(sub, null, 2), "utf-8");

    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(execDir, "results", "001-correction-loop.json"),
      JSON.stringify(
        {
          version: 1,
          phase: "4.7",
          subtask_id: "001",
          status: "correction_completed",
          correction_state: "retry_completed",
          attempt: 1,
          max_attempts: 2,
          requires_retry: false,
          retry_allowed: true,
          started_at: now,
          completed_at: now,
          source_review_state: "rejected",
          resulting_review_state: "approved",
          correction_summary: "test",
          warnings: [],
          errors: [],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { loadHandoffAndOrderForExecution } = require("./build-execution-session");
    const { hasCorrectionWorkPending } = require("./run-correction-runtime");
    const loaded = loadHandoffAndOrderForExecution(out);
    assert.strictEqual(loaded.ok, true);
    assert.strictEqual(hasCorrectionWorkPending(out, loaded, false), false);
    assert.strictEqual(hasCorrectionWorkPending(out, loaded, true), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
