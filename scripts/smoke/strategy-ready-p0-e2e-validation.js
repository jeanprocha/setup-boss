#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const { httpJson, poll } = require("./lib/e2e-http");
const { resolveOutputDir } = require("../../core/run-resolver");
const { REQUIRED_SEED_FILES } = require("../../core/validate-project-knowledge-base");
const { REQUIRED_INDEX_FILES } = require("../../core/validate-ia-governance-structure");
const {
  seedSkipLlmIntakeArtifacts,
  seedSkipLlmQuestions,
  seedClarificationRequiredContext,
  LONG_TASK,
} = require("./lib/mvp-lifecycle-fixtures");

const PORT = Number(process.env.SETUP_BOSS_RUNTIME_API_PORT || 3210);
const LEGACY =
  "20260516-163856-na-tela-de-integracao-criar-componente-de-chat-botao-de-abri";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const INDEX_MD = "Version: 1.0\n# .IA\n";

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "p0-e2e@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "P0 E2E"], { cwd: root, stdio: "pipe" });
}

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "p0-e2e"], { cwd: root, stdio: "pipe" });
}

function createCompliantDemoProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-p0-e2e-"));
  initGitRepo(root);
  for (const rel of REQUIRED_SEED_FILES) {
    gitTrack(root, rel, rel === "docs/.IA/index.md" ? INDEX_MD : undefined);
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
  return root;
}

async function apiGet(runId, segment) {
  return httpJson(PORT, { path: `/runs/${encodeURIComponent(runId)}/${segment}` });
}

function diskCheck(runId) {
  const out = resolveOutputDir(runId, { warnLegacy: false });
  const rc = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf8"));
  return {
    phase3: rc.phase3?.status ?? null,
    readiness: fs.existsSync(path.join(out, "strategy/strategy-readiness.json")),
    handoff: fs.existsSync(path.join(out, "strategy/execution-ready-handoff.json")),
  };
}

function eventsForRun(runId) {
  const fp = path.join(REPO_ROOT, ".setup-boss", "daemon", "events.jsonl");
  if (!fs.existsSync(fp)) return [];
  return fs
    .readFileSync(fp, "utf8")
    .split(/\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.runId === runId);
}

function assertP0(label, clarPhase, sum) {
  assert.notStrictEqual(clarPhase, "strategy_pending", `${label}: clarification`);
  const p3 = String(sum?.phase3Status || "");
  const rd = sum?.operationalReadiness;
  assert.ok(p3 === "strategy_ready" || rd === "ready", `${label}: strategy ${p3}/${rd}`);
}

async function validateLegacy() {
  console.log("--- legacy ---");
  const disk = diskCheck(LEGACY);
  const c = await apiGet(LEGACY, "clarification");
  const s = await apiGet(LEGACY, "strategy");
  const clar = c.json?.data?.session?.runtimePhase;
  const sum = s.json?.data?.summary;
  console.log({ disk, clar, strategy: sum });
  assertP0("legacy", clar, sum);
  const ev = eventsForRun(LEGACY);
  console.log("legacy historical waiting events:", ev.filter((e) => e.type === "strategy_waiting_user_action").length);
}

async function validateNewRunHttp() {
  console.log("--- new run (HTTP approve) ---");
  const demoRoot = createCompliantDemoProject();
  const reg = await httpJson(PORT, {
    path: "/projects/register",
    method: "POST",
    body: { projectRoot: demoRoot },
  });
  assert.strictEqual(reg.status, 200);
  const projectId = reg.json?.data?.projectId;
  assert.ok(projectId);

  const created = await httpJson(PORT, {
    path: "/runs",
    method: "POST",
    body: { projectId, task: LONG_TASK, metadata: { skipLlm: true, source: "p0-e2e" } },
  });
  assert.ok([200, 201].includes(created.status));
  const runId = created.json?.data?.runId;
  assert.ok(runId);

  const outputDir = resolveOutputDir(runId, { warnLegacy: false });
  seedSkipLlmIntakeArtifacts(outputDir);
  seedSkipLlmQuestions(outputDir);
  seedClarificationRequiredContext(outputDir);

  const clar0 = await apiGet(runId, "clarification");
  const questions = clar0.json?.data?.questions ?? [];
  const answers = questions.map((q) => ({
    question_id: q.id,
    value: q.kind === "confirm" ? "yes" : `p0-${q.id}`,
  }));
  await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/clarification/answers`,
    method: "POST",
    body: { answers, skipLlm: true },
  });
  await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/clarification/refine`,
    method: "POST",
    body: { skipLlm: true },
  });

  const eventsBefore = eventsForRun(runId).length;
  const approve = await httpJson(PORT, {
    path: `/runs/${encodeURIComponent(runId)}/clarification/approve`,
    method: "POST",
    body: { skipLlm: true },
  });
  assert.strictEqual(approve.status, 200);
  console.log("approve response runtimePhase", approve.json?.data?.runtimePhase ?? approve.json?.runtimePhase);

  let clarPhase = "strategy_pending";
  let sum = null;
  await poll(async () => {
    const c = await apiGet(runId, "clarification");
    const s = await apiGet(runId, "strategy");
    clarPhase = c.json?.data?.session?.runtimePhase;
    sum = s.json?.data?.summary;
    return clarPhase !== "strategy_pending" && (sum?.operationalReadiness === "ready" || sum?.phase3Status === "strategy_ready");
  }, 30000, 400);

  const disk = diskCheck(runId);
  console.log({ disk, clarPhase, strategy: sum });
  assert.strictEqual(disk.phase3, "strategy_ready");
  assertP0("new-run", clarPhase, sum);

  const runEvents = eventsForRun(runId).slice(eventsBefore);
  const types = [...new Set(runEvents.map((e) => e.type))];
  console.log("events after approve", types.join(", "));
  assert.ok(runEvents.some((e) => e.type === "strategy_started"));
  assert.ok(runEvents.some((e) => e.type === "strategy_completed"));
  assert.ok(!runEvents.some((e) => e.type === "strategy_waiting_user_action"));

  return runId;
}

async function main() {
  const health = await httpJson(PORT, { path: "/health" });
  assert.strictEqual(health.status, 200);
  await validateLegacy();
  const runId = await validateNewRunHttp();
  console.log("PASS", runId);
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
