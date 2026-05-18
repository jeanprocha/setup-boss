"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFileSync } = require("child_process");

const { REQUIRED_SEED_FILES } = require("../../../../core/validate-project-knowledge-base");
const { REQUIRED_INDEX_FILES } = require("../../../../core/validate-ia-governance-structure");

const { createRunFromTask } = require("../../../daemon/lib/run-intake-api");
const {
  runClarificationMutation,
} = require("../../../daemon/lib/run-clarification");
const { resolveOutputDir } = require("../../../../core/run-resolver");
const { runStrategyRuntimeBase } = require("../../../runtime/strategy-runtime/run-strategy-runtime");
const {
  loadBasePlanPresentation,
} = require("../../../../core/load-base-plan-presentation.js");
const {
  writePlanPresentationBaseSnapshot,
} = require("../../../../core/plan-presentation-base-snapshot.js");
const { httpJson, poll, sleep } = require("../e2e-http");
const {
  CHAT_TASK,
  seedChatPlanArtifacts,
  writeChatPlanRefined,
} = require("./fixtures");

function assertClarificationOk(clar) {
  if (clar.status !== 200) {
    throw new Error(`clarification GET ${clar.status}: ${clar.raw}`);
  }
}

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DAEMON_SCRIPT = path.join(REPO_ROOT, "scripts", "daemon", "setup-bossd.js");

function mkDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-e2e-"));
}

const INDEX_MD = "Version: 1.0\n# .IA\n";

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "plan-e2e@setup-boss.local"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "Plan E2E"], { cwd: root, stdio: "pipe" });
}

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "plan-e2e"], { cwd: root, stdio: "pipe" });
}

function createCompliantDemoProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-e2e-proj-"));
  initGitRepo(root);
  for (const rel of REQUIRED_SEED_FILES) {
    gitTrack(root, rel, rel === "docs/.IA/index.md" ? INDEX_MD : undefined);
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
  return root;
}

function pidFile(dataDir) {
  return path.join(dataDir, "daemon", "pid");
}

function startDaemon(dataDir, port) {
  const env = {
    ...process.env,
    SETUP_BOSS_CLI_ROOT: REPO_ROOT,
    SETUP_BOSS_DATA_DIR: dataDir,
    SETUP_BOSS_RUNTIME_API_PORT: String(port),
    SETUP_BOSS_MAX_WORKERS: "2",
  };
  return spawn(process.execPath, [DAEMON_SCRIPT], {
    cwd: REPO_ROOT,
    env,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function stopDaemon(dataDir) {
  const { isPidAlive } = require("../../../daemon/lib/pid-file");
  try {
    const raw = fs.readFileSync(pidFile(dataDir), "utf8").trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || !isPidAlive(pid)) return;
    process.kill(pid, "SIGTERM");
    await poll(() => !isPidAlive(pid), 12000, 200).catch(() => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* */
      }
    });
  } catch {
    /* */
  }
}

async function startDaemonAndWait(dataDir, port) {
  startDaemon(dataDir, port);
  await poll(async () => fs.existsSync(pidFile(dataDir)), 15000);
  await poll(async () => {
    try {
      const r = await httpJson(port, { path: "/health" });
      return r.status === 200 && r.json?.ok === true;
    } catch {
      return false;
    }
  }, 25000);
}

/**
 * Cria run pronta para aprovação + strategy (skip LLM).
 *
 * @param {{ port?: number, dataDir?: string, projectRoot?: string }} [opts]
 */
async function bootstrapChatApprovalRun(opts = {}) {
  const dataDir = opts.dataDir || mkDataDir();
  const projectRoot = opts.projectRoot || createCompliantDemoProject();
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, ".setup-boss"), { recursive: true });

  const port = opts.port ?? 32300 + Math.floor(Math.random() * 500);
  const startedDaemon = !opts.port;

  if (startedDaemon) {
    await startDaemonAndWait(dataDir, port);
  }

  const created = await createRunFromTask({
    repoRoot: dataDir,
    projectId: projectRoot,
    task: CHAT_TASK,
    metadata: { skipLlm: true, source: "plan-approval-e2e" },
  });
  if (!created.ok) {
    throw new Error(created.error?.message || "intake failed");
  }

  const runId = created.data.runId;
  const outputDir = resolveOutputDir(runId, { warnLegacy: false });
  seedChatPlanArtifacts(outputDir);

  const { collectClarificationBundle } = require("../../../daemon/lib/run-clarification");
  const bundle0 = collectClarificationBundle(outputDir, runId);
  if (!bundle0.ok) throw new Error(bundle0.error?.message || "clarification bundle");
  const answerPairs = bundle0.data.questions.map((q) => ({
    question_id: q.id,
    value:
      q.kind === "confirm"
        ? "yes"
        : /escopo|scope/i.test(String(q.prompt || ""))
          ? "componente visual de chat reutilizável, responsivo, tema claro/escuro, apenas visual"
          : /fora|excluir/i.test(String(q.prompt || ""))
            ? "backend, mensagens reais, persistência, integrações externas"
            : /crit[eé]rio|aceite|conclus/i.test(String(q.prompt || ""))
              ? "chat integrado na tela de integrações, reutilizável, responsivo, tema claro e escuro"
              : `resposta-${q.id}`,
  }));

  const submitted = await runClarificationMutation(runId, {
    answerPairs,
    skipLlm: true,
    cwd: dataDir,
  });
  if (!submitted.ok) throw new Error(submitted.message || "submit answers failed");

  const refined = await runClarificationMutation(runId, {
    refine: true,
    skipLlm: true,
    overwrite: true,
    cwd: dataDir,
  });
  if (!refined.ok) throw new Error(refined.message || "refine failed");

  writeChatPlanRefined(outputDir);

  const approved = await runClarificationMutation(runId, {
    approve: true,
    skipLlm: true,
    cwd: dataDir,
  });
  if (!approved.ok) throw new Error(approved.message || "approve failed");

  const sr = runStrategyRuntimeBase({
    outputDirAbs: outputDir,
    runId,
    force: true,
  });
  if (!sr.ok) {
    throw new Error(JSON.stringify(sr));
  }

  const basePresentation = loadBasePlanPresentation(outputDir);
  if (!basePresentation?.hasContent) {
    throw new Error("base presentation vazia após bootstrap");
  }
  writePlanPresentationBaseSnapshot(outputDir, basePresentation, {
    source: "e2e-bootstrap",
  });

  return {
    runId,
    outputDir,
    projectRoot,
    dataDir,
    port,
    startedDaemon,
    basePresentation,
  };
}

function assertClarificationOk(clar) {
  if (clar.status !== 200) {
    throw new Error(`clarification GET ${clar.status}: ${clar.raw}`);
  }
}

/**
 * @param {number} port
 * @param {string} runId
 */
async function apiGetPlanComments(port, runId) {
  return httpJson(port, {
    path: `/runs/${encodeURIComponent(runId)}/plan-comments`,
  });
}

/**
 * @param {number} port
 * @param {string} runId
 * @param {{ commentId: string, text: string, createdAt?: string }} body
 */
async function apiPostPlanComment(port, runId, body) {
  return httpJson(port, {
    path: `/runs/${encodeURIComponent(runId)}/plan-comments`,
    method: "POST",
    body: {
      commentId: body.commentId,
      text: body.text,
      createdAt: body.createdAt || new Date().toISOString(),
      skipLlm: true,
    },
  });
}

/**
 * @param {number} port
 * @param {string} runId
 * @param {object} presentation
 */
async function apiPutPlanPresentationBase(port, runId, presentation) {
  return httpJson(port, {
    path: `/runs/${encodeURIComponent(runId)}/plan-presentation-base`,
    method: "PUT",
    body: { presentation },
  });
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 */
function readUpdatedPlanFromDisk(outputDir, commentId) {
  const { readUpdatedPlan } = require("../../../runtime/plan-comment/plan-comment-store");
  return readUpdatedPlan(outputDir, commentId);
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 * @param {object} doc
 */
function writeStaleUpdatedPlanOnDisk(outputDir, commentId, doc) {
  const dir = path.join(outputDir, "plan-comments", commentId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "updated-plan.json"),
    JSON.stringify(doc, null, 2),
    "utf-8",
  );
}

module.exports = {
  REPO_ROOT,
  mkDataDir,
  startDaemonAndWait,
  stopDaemon,
  bootstrapChatApprovalRun,
  apiGetPlanComments,
  apiPostPlanComment,
  apiPutPlanPresentationBase,
  readUpdatedPlanFromDisk,
  writeStaleUpdatedPlanOnDisk,
  sleep,
};
