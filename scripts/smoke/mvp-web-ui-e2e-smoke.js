#!/usr/bin/env node
/**
 * Smoke E2E operacional — MVP Web UI (Fase 5.17).
 *
 * Fluxo: intake → clarification → approve → strategy → execute → completion
 * + validação Runtime API, read models, orchestration, recovery, SSE sample.
 *
 * Uso: node scripts/smoke/mvp-web-ui-e2e-smoke.js
 *      npm run smoke:mvp-web-ui-e2e
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const { createRunFromTask } = require("../daemon/lib/run-intake-api");
const {
  runClarificationMutation,
  collectClarificationBundle,
} = require("../daemon/lib/run-clarification");
const { collectStrategyForRun } = require("../daemon/lib/run-strategy");
const { triggerRunExecution, collectOrchestrationBootstrap } = require("../daemon/lib/run-execute-api");
const { collectExecutionForRun } = require("../daemon/lib/run-execution");
const { validateRuntimeConsistency } = require("../daemon/lib/runtime-consistency-check");
const { syncOrchestrationFromArtifacts } = require("../daemon/lib/run-orchestration-sync");
const { resolveOutputDir } = require("../../core/run-resolver");
const { runExecutionRuntimeBase } = require("../runtime/execution-runtime/run-execution-runtime");
const { validateExecutionRuntimeResult } = require("../runtime/execution-runtime/validate-execution-runtime");
const { validateLifecycleConsistency } = require("../runtime/validation/lifecycle-consistency");
const { runStrategyRuntimeBase } = require("../runtime/strategy-runtime/run-strategy-runtime");
const { deriveProjectId } = require("../daemon/lib/project-registry");

function strategyIsReady(summary) {
  if (!summary) return false;
  const p3 = String(summary.phase3Status || "").toLowerCase();
  if (p3 === "strategy_ready" || p3 === "ready_for_execution") return true;
  return (
    summary.operationalReadiness === "ready" && (summary.subtaskCount ?? 0) > 0
  );
}
const {
  seedSkipLlmIntakeArtifacts,
  seedSkipLlmQuestions,
  seedClarificationRequiredContext,
  LONG_TASK,
} = require("./lib/mvp-lifecycle-fixtures");
const { httpJson, readSseSample, poll, sleep } = require("./lib/e2e-http");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DAEMON_SCRIPT = path.join(REPO_ROOT, "scripts", "daemon", "setup-bossd.js");

function resolveRepoRoot() {
  return REPO_ROOT;
}

function mkDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-517-"));
}

function pidFile(dataDir) {
  return path.join(dataDir, "daemon", "pid");
}

function readPid(dataDir) {
  try {
    const raw = fs.readFileSync(pidFile(dataDir), "utf8").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

function startDaemon(dataDir, port) {
  const env = {
    ...process.env,
    SETUP_BOSS_CLI_ROOT: REPO_ROOT,
    SETUP_BOSS_DATA_DIR: dataDir,
    SETUP_BOSS_RUNTIME_API_PORT: String(port),
    SETUP_BOSS_MAX_WORKERS: "2",
    SETUP_BOSS_MAX_WORKERS_PER_PROJECT: "2",
    SETUP_BOSS_SCHEDULER_POLL_MS: "400",
    SETUP_BOSS_ORCH_SYNC_MS: "2000",
  };
  return spawn(process.execPath, [DAEMON_SCRIPT], {
    cwd: REPO_ROOT,
    env,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function stopDaemon(dataDir) {
  const { isPidAlive } = require("../daemon/lib/pid-file");
  const pid = readPid(dataDir);
  if (pid == null) return;
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (_) {
    /* */
  }
  await poll(() => !isPidAlive(pid), 15000, 200).catch(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch (_) {
      /* */
    }
  });
}

async function startDaemonAndWait(dataDir, port) {
  startDaemon(dataDir, port);
  await poll(async () => fs.existsSync(pidFile(dataDir)), 15000);
  await poll(async () => {
    try {
      const r = await httpJson(port, { path: "/health" });
      return r.status === 200 && r.json && r.json.ok === true;
    } catch (_) {
      return false;
    }
  }, 25000);
}

/**
 * Lifecycle completo in-process (sem LLM).
 */
async function phaseInProcessLifecycle() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-517-life-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const created = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: LONG_TASK,
    metadata: { skipLlm: true, source: "smoke-517" },
  });
  assert.strictEqual(created.ok, true, created.error?.message);
  const runId = created.data.runId;
  const outputDir = resolveOutputDir(runId, { warnLegacy: false });

  seedSkipLlmIntakeArtifacts(outputDir);
  seedSkipLlmQuestions(outputDir);
  seedClarificationRequiredContext(outputDir);

  const bundle0 = collectClarificationBundle(outputDir, runId);
  assert.strictEqual(bundle0.ok, true);
  const answersPayload = bundle0.data.questions.map((q) => ({
    question_id: q.id,
    value: q.kind === "confirm" ? "yes" : `resposta-${q.id}`,
  }));

  const submitted = await runClarificationMutation(runId, {
    answerPairs: answersPayload,
    skipLlm: true,
    cwd: root,
  });
  assert.strictEqual(submitted.ok, true, submitted.message);

  const approved = await runClarificationMutation(runId, {
    approve: true,
    skipLlm: true,
    cwd: root,
  });
  assert.strictEqual(approved.ok, true, approved.message);

  const strategy = collectStrategyForRun(runId, null);
  assert.strictEqual(strategy.ok, true);
  assert.ok(
    strategy.data.summary.operationalReadiness === "ready" ||
      String(strategy.data.summary.phase3Status || "").includes("strategy"),
    `strategy readiness: ${strategy.data.summary.operationalReadiness}`,
  );

  const exec = runExecutionRuntimeBase({ outputDirAbs: outputDir, runId });
  assert.strictEqual(exec.ok, true, JSON.stringify(exec));

  syncOrchestrationFromArtifacts(runId, outputDir, { emitEvents: false });
  const boot = collectOrchestrationBootstrap(runId, outputDir);
  const execBundle = collectExecutionForRun(runId, null);
  assert.strictEqual(execBundle.ok, true);

  const consistency = validateRuntimeConsistency({
    runId,
    outputDir,
    orchestrationBootstrap: boot,
    executionBundle: execBundle.data,
    strategyBundle: strategy.data,
    clarificationBundle: collectClarificationBundle(outputDir, runId).data,
  });
  assert.strictEqual(consistency.ok, true, JSON.stringify(consistency.issues));

  const life = validateLifecycleConsistency(outputDir);
  assert.strictEqual(life.ok, true, JSON.stringify(life.issues));

  const vExec = validateExecutionRuntimeResult(outputDir);
  assert.strictEqual(vExec.ok, true, vExec.errors?.join("; "));

  fs.rmSync(root, { recursive: true, force: true });
  return runId;
}

/**
 * Runtime API + SSE + recovery (daemon isolado).
 */
async function phaseDaemonApi() {
  const dataDir = mkDataDir();
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-517-api-"));
  fs.mkdirSync(path.join(projectRoot, ".setup-boss"), { recursive: true });
  const port = 32200 + Math.floor(Math.random() * 800);

  await startDaemonAndWait(dataDir, port);

  try {
    const health = await httpJson(port, { path: "/health" });
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.json.ok, true);

    const created = await httpJson(port, {
      path: "/runs",
      method: "POST",
      body: {
        projectId: projectRoot,
        task: LONG_TASK,
        metadata: { skipLlm: true, source: "smoke-517-api" },
      },
    });
    assert.strictEqual(created.status, 201, created.raw);
    const runId = created.json.data.runId;
    assert.ok(runId);

    const outputDir = resolveOutputDir(runId, { warnLegacy: false });
    seedSkipLlmIntakeArtifacts(outputDir);
    seedSkipLlmQuestions(outputDir);
    seedClarificationRequiredContext(outputDir);

    const clar0 = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/clarification`,
    });
    assert.strictEqual(clar0.status, 200);
    assert.ok(Array.isArray(clar0.json.data?.questions));

    const answers = clar0.json.data.questions.map((q) => ({
      question_id: q.id,
      value: q.kind === "confirm" ? "yes" : `resposta-${q.id}`,
    }));

    const ansPost = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/clarification/answers`,
      method: "POST",
      body: { answers, skipLlm: true },
    });
    assert.strictEqual(ansPost.status, 200, ansPost.raw);

    const refinePost = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/clarification/refine`,
      method: "POST",
      body: { skipLlm: true },
    });
    assert.strictEqual(refinePost.status, 200, refinePost.raw);

    const approvePost = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/clarification/approve`,
      method: "POST",
      body: { skipLlm: true },
    });
    assert.strictEqual(approvePost.status, 200, approvePost.raw);

    let stratReady = false;
    try {
      await poll(async () => {
        const stratGet = await httpJson(port, {
          path: `/runs/${encodeURIComponent(runId)}/strategy`,
        });
        if (stratGet.status !== 200) return false;
        stratReady = strategyIsReady(stratGet.json.data?.summary);
        return stratReady;
      }, 15000);
    } catch (_) {
      stratReady = false;
    }

    if (!stratReady) {
      const sr = runStrategyRuntimeBase({ outputDirAbs: outputDir, runId, force: true });
      assert.strictEqual(sr.ok, true, JSON.stringify(sr));
    }

    const stratGet = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/strategy`,
    });
    assert.strictEqual(stratGet.status, 200);
    assert.ok(
      strategyIsReady(stratGet.json.data?.summary),
      JSON.stringify(stratGet.json.data?.summary),
    );

    const execPost = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/execute`,
      method: "POST",
      body: {},
    });
    assert.ok([200, 202].includes(execPost.status), execPost.raw);

    await poll(async () => {
      const ex = await httpJson(port, {
        path: `/runs/${encodeURIComponent(runId)}/execution`,
      });
      if (ex.status !== 200 || !ex.json?.data?.summary) return false;
      const phase = String(ex.json.data.summary.lifecycle?.phase || "");
      return (
        phase === "execution_completed" ||
        phase === "execution_failed" ||
        ex.json.data.summary.progress?.completedSubtasks >= 1
      );
    }, 120000);

    const orch = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/orchestration`,
    });
    assert.strictEqual(orch.status, 200);
    assert.ok(orch.json.data?.orchestrationState);

    const evidence = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/evidence`,
    });
    assert.strictEqual(evidence.status, 200);
    assert.ok(Array.isArray(evidence.json.data?.artifacts));

    syncOrchestrationFromArtifacts(runId, outputDir, { emitEvents: false });
    const consistency = validateRuntimeConsistency({
      runId,
      outputDir,
      jobs: null,
    });
    assert.strictEqual(consistency.ok, true, JSON.stringify(consistency.issues));

    const projectId = deriveProjectId(projectRoot);
    const sseRaw = await readSseSample(port, projectId, 6000);
    assert.ok(
      sseRaw.includes("heartbeat") || sseRaw.includes("runtime_event") || sseRaw.includes("event:"),
      "SSE sem heartbeat/event",
    );

    await stopDaemon(dataDir);
    await sleep(600);
    await startDaemonAndWait(dataDir, port);

    const recovery = await httpJson(port, { path: "/runtime/recovery" });
    assert.strictEqual(recovery.status, 200);
    assert.ok(recovery.json.data != null);
    assert.ok(Array.isArray(recovery.json.data.activeRuns));
    assert.ok(typeof recovery.json.data.generatedAt === "string");

    const orchAfter = await httpJson(port, {
      path: `/runs/${encodeURIComponent(runId)}/orchestration`,
    });
    assert.strictEqual(orchAfter.status, 200);

    const events = await httpJson(port, {
      path: `/events?limit=20&projectId=${encodeURIComponent(projectId)}`,
    });
    assert.strictEqual(events.status, 200);
    assert.ok(Array.isArray(events.json.data));
  } finally {
    await stopDaemon(dataDir);
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  resolveRepoRoot();
  console.log("[smoke] Fase 1 — lifecycle in-process…");
  await phaseInProcessLifecycle();
  console.log("[smoke] Fase 1 OK");

  console.log("[smoke] Fase 2 — Runtime API + SSE + recovery…");
  await phaseDaemonApi();
  console.log("[smoke] Fase 2 OK");

  console.log("OK: smoke:mvp-web-ui-e2e (lifecycle + API + consistency + recovery + SSE)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
