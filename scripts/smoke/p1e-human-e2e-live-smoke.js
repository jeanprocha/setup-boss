#!/usr/bin/env node
/**
 * P1e — Smoke E2E contra dev:stack já activo (não arranca daemon).
 * Valida fluxo API: register → intake → clarificação → estratégia → execução.
 *
 * Uso: node scripts/smoke/p1e-human-e2e-live-smoke.js
 *      SETUP_BOSS_RUNTIME_API_PORT=3210 node scripts/smoke/p1e-human-e2e-live-smoke.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const { REQUIRED_SEED_FILES } = require("../../core/validate-project-knowledge-base");
const { REQUIRED_INDEX_FILES } = require("../../core/validate-ia-governance-structure");
const PORT = Number(process.env.SETUP_BOSS_RUNTIME_API_PORT || 3210);
const { httpJson, readSseSample, poll, sleep } = require("./lib/e2e-http");
const {
  seedSkipLlmIntakeArtifacts,
  seedSkipLlmQuestions,
  seedClarificationRequiredContext,
  LONG_TASK,
} = require("./lib/mvp-lifecycle-fixtures");
const { resolveOutputDir } = require("../../core/run-resolver");
const { runStrategyRuntimeBase } = require("../runtime/strategy-runtime/run-strategy-runtime");

function strategyIsReady(summary) {
  if (!summary) return false;
  const p3 = String(summary.phase3Status || "").toLowerCase();
  if (p3 === "strategy_ready" || p3 === "ready_for_execution") return true;
  return (
    summary.operationalReadiness === "ready" && (summary.subtaskCount ?? 0) > 0
  );
}

/** @type {{ step: string, ok: boolean, detail?: string }[]} */
const log = [];

function record(step, ok, detail) {
  log.push({ step, ok, detail: detail || undefined });
  const mark = ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ""}`);
}

const INDEX_MD_WITH_VERSION = "Version: 1.0\n# .IA\n";

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "p1e@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "P1e Smoke"], {
    cwd: root,
    stdio: "pipe",
  });
}

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "p1e"], { cwd: root, stdio: "pipe" });
}

/** Projeto-alvo válido (git + docs/.IA tracked) — não o root do Setup-Boss. */
function createCompliantDemoProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-p1e-demo-"));
  initGitRepo(root);
  for (const rel of REQUIRED_SEED_FILES) {
    if (rel === "docs/.IA/index.md") {
      gitTrack(root, rel, INDEX_MD_WITH_VERSION);
    } else {
      gitTrack(root, rel);
    }
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
  return root;
}

async function main() {
  console.log(`P1e live smoke → http://127.0.0.1:${PORT}`);
  console.log(`Repo: ${REPO_ROOT}`);

  const iaIndex = path.join(REPO_ROOT, "docs", ".IA", "index.md");
  record(
    "preparação docs/.IA",
    fs.existsSync(iaIndex),
    fs.existsSync(iaIndex) ? iaIndex : "missing",
  );

  let health;
  try {
    health = await httpJson(PORT, { path: "/health" });
    record("health", health.status === 200 && health.json?.ok === true, `status=${health.status}`);
  } catch (e) {
    record("health", false, e.message);
    printSummary();
    process.exit(1);
  }

  const demoRoot = createCompliantDemoProject();
  record("preparação projeto demo git+.IA", true, demoRoot);

  const reg = await httpJson(PORT, {
    path: "/projects/register",
    method: "POST",
    body: { projectRoot: demoRoot },
  });
  const projectId = reg.json?.data?.projectId;
  record(
    "register projeto",
    reg.status === 200 && Boolean(projectId),
    projectId || reg.raw?.slice(0, 120),
  );
  if (!projectId) {
    printSummary();
    process.exit(1);
  }

  const gov = await httpJson(PORT, {
    path: `/projects/${encodeURIComponent(projectId)}/governance`,
  });
  record(
    "governance (sem 400)",
    gov.status === 200 && gov.json?.ok !== false,
    `status=${gov.status} readiness=${gov.json?.data?.readiness ?? gov.json?.readiness ?? "?"}`,
  );

  const task =
    LONG_TASK ||
    "Smoke P1e humano: validar fluxo Mission Control intake clarificação estratégia execução observabilidade.";
  const created = await httpJson(PORT, {
    path: "/runs",
    method: "POST",
    body: {
      projectId,
      task,
      metadata: { skipLlm: true, source: "p1e-human-e2e" },
    },
  });
  const runId = created.json?.data?.runId;
  record(
    "POST /runs intake",
    [200, 201].includes(created.status) && Boolean(runId),
    `status=${created.status} runId=${runId || "?"}`,
  );
  if (!runId) {
    printSummary();
    process.exit(1);
  }

  const outputDir = resolveOutputDir(runId, { warnLegacy: false });
  seedSkipLlmIntakeArtifacts(outputDir);
  seedSkipLlmQuestions(outputDir);
  seedClarificationRequiredContext(outputDir);

  const projDetail = await httpJson(PORT, {
    path: `/projects/${encodeURIComponent(projectId)}`,
  });
  const recentJobs = projDetail.json?.data?.recentJobs ?? [];
  const jobRow = recentJobs.find((j) => String(j.runId) === runId);
  const meta = jobRow?.metadata && typeof jobRow.metadata === "object" ? jobRow.metadata : {};
  const initialState = String(meta.initialState || "");
  const uiState = String(meta.uiState || "");
  const jobStatus = String(jobRow?.status || "");
  record(
    "status honesto pós-intake (metadata)",
    jobStatus === "completed" &&
      initialState.includes("clarification") &&
      uiState !== "success",
    `job=${jobStatus} initialState=${initialState} uiState=${uiState}`,
  );

  const clar0 = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/clarification`,
  });
  const questions = clar0.json?.data?.questions ?? [];
  record(
    "clarificação perguntas",
    clar0.status === 200 && questions.length > 0,
    `count=${questions.length}`,
  );

  const answers = questions.map((q) => ({
    question_id: q.id,
    value: q.kind === "confirm" ? "yes" : `p1e-${q.id}`,
  }));
  const ansPost = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/clarification/answers`,
    method: "POST",
    body: { answers, skipLlm: true },
  });
  record("clarificação respostas", ansPost.status === 200, `status=${ansPost.status}`);

  const refinePost = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/clarification/refine`,
    method: "POST",
    body: { skipLlm: true },
  });
  record("clarificação refine", refinePost.status === 200, `status=${refinePost.status}`);

  const approvePost = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/clarification/approve`,
    method: "POST",
    body: { skipLlm: true },
  });
  record("clarificação approve", approvePost.status === 200, `status=${approvePost.status}`);

  let stratReady = false;
  try {
    await poll(async () => {
      const stratGet = await httpJson(PORT, {
        path: `/runs/${encodeURIComponent(runId)}/strategy`,
      });
      if (stratGet.status !== 200) return false;
      stratReady = strategyIsReady(stratGet.json.data?.summary);
      return stratReady;
    }, 12000);
  } catch (_) {
    stratReady = false;
  }
  if (!stratReady) {
    const sr = runStrategyRuntimeBase({
      outputDirAbs: outputDir,
      runId,
      force: true,
    });
    record("estratégia generate (fallback)", sr.ok === true, sr.ok ? "forced" : JSON.stringify(sr));
  }
  const stratGet = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/strategy`,
  });
  stratReady = strategyIsReady(stratGet.json?.data?.summary);
  record(
    "estratégia ready",
    stratGet.status === 200 && stratReady,
    JSON.stringify(stratGet.json?.data?.summary?.runtimePhase || stratGet.json?.data?.summary?.phase3Status),
  );

  const execPost = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/execute`,
    method: "POST",
    body: {},
  });
  record(
    "execução trigger",
    [200, 202].includes(execPost.status),
    `status=${execPost.status}`,
  );

  let execPhase = "";
  try {
    await poll(async () => {
      const ex = await httpJson(PORT, {
        path: `/runs/${encodeURIComponent(runId)}/execution`,
      });
      if (ex.status !== 200 || !ex.json?.data?.summary) return false;
      execPhase = String(ex.json.data.summary.lifecycle?.phase || "");
      return (
        execPhase === "execution_completed" ||
        execPhase === "execution_failed" ||
        execPhase === "execution_running"
      );
    }, 45000, 500);
  } catch (e) {
    record("execução lifecycle", false, e.message);
  }
  record(
    "execução lifecycle",
    execPhase === "execution_completed" || execPhase === "execution_running",
    execPhase || "timeout",
  );

  const events = await httpJson(PORT, {
    path: `/events?projectId=${encodeURIComponent(projectId)}&limit=20`,
  });
  const evCount = Array.isArray(events.json?.data) ? events.json.data.length : 0;
  record("observabilidade events", events.status === 200 && evCount > 0, `count=${evCount}`);

  try {
    const sse = await readSseSample(PORT, projectId, 6000);
    record("SSE sample", Boolean(sse && sse.length > 0), `${sse.length} bytes`);
  } catch (e) {
    record("SSE sample", false, e.message);
  }

  const obs = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/runtime-observability`,
  });
  record(
    "observability bundle",
    obs.status === 200,
    `status=${obs.status} daemonLog=${(obs.json?.data?.daemonLogEntries || []).length}`,
  );

  printSummary();
  const failed = log.filter((x) => !x.ok);
  process.exit(failed.length ? 1 : 0);
}

function printSummary() {
  console.log("\n--- resumo P1e ---");
  for (const row of log) {
    console.log(`${row.ok ? "✓" : "✗"} ${row.step}`);
  }
  const failed = log.filter((x) => !x.ok);
  console.log(`\n${log.length - failed.length}/${log.length} pass`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
