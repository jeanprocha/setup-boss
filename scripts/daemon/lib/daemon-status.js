const fs = require("fs");
const path = require("path");
const { getDaemonDirs } = require("./daemon-paths");
const {
  loadQueueUnsafe,
  countsByStatus,
} = require("./queue-store");

function readRepoSemanticVersion(repoRoot) {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf8");
    const j = JSON.parse(raw);
    return typeof j.version === "string" ? j.version : null;
  } catch (_) {
    return null;
  }
}

function writeDaemonStatus(patch) {
  const { daemonDir, statusPath, repoRoot } = getDaemonDirs();

  fs.mkdirSync(daemonDir, { recursive: true });

  let prev = {};

  try {
    if (fs.existsSync(statusPath))
      prev = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  } catch (_) {
    /* */
  }

  const queue = loadQueueUnsafe();

  const defaultWorker = {
    busy: false,

    currentJobId: null,

    currentPhase: null,

    lastPipelineEventAt: null,
  };

  const prevWorker =
    prev.worker && typeof prev.worker === "object" ? prev.worker : defaultWorker;

  /** Campos preservados quando o patch é parcial (ex.: só `scheduler`). */
  const STATUS_MERGE_KEYS = [
    "daemonVersion",
    "processedJobs",
    "scheduler",
    "workerList",
    "workers",
    "concurrency",
  ];

  const carried = {};

  for (const k of STATUS_MERGE_KEYS) {
    if (!(k in patch) && Object.prototype.hasOwnProperty.call(prev, k))
      carried[k] = prev[k];
  }

  const base = {
    running: typeof prev.running === "boolean" ? prev.running : false,

    pid: typeof prev.pid === "number" ? prev.pid : null,

    startedAt: typeof prev.startedAt === "string" ? prev.startedAt : null,

    currentJobId: prev.currentJobId ?? null,

    worker: {
      busy: Boolean(prevWorker.busy),

      currentJobId:
        prevWorker.currentJobId == null ? null : String(prevWorker.currentJobId),

      currentPhase:
        prevWorker.currentPhase == null ||
        typeof prevWorker.currentPhase !== "string" ||
        !String(prevWorker.currentPhase).trim()
          ? null
          : String(prevWorker.currentPhase).trim(),

      lastPipelineEventAt:
        prevWorker.lastPipelineEventAt == null ||
        typeof prevWorker.lastPipelineEventAt !== "string"
          ? null
          : String(prevWorker.lastPipelineEventAt),
    },

    queue: countsByStatus(queue),

    updatedAt: new Date().toISOString(),
    ...carried,
    ...patch,
  };

  if (!base.worker || typeof base.worker !== "object") {
    base.worker = { ...defaultWorker };
  } else {
    base.worker = {
      busy: Boolean(base.worker.busy),

      currentJobId:
        base.worker.currentJobId == null
          ? null
          : String(base.worker.currentJobId),

      currentPhase:
        base.worker.currentPhase == null ||
        typeof base.worker.currentPhase !== "string" ||
        !String(base.worker.currentPhase).trim()
          ? null
          : String(base.worker.currentPhase).trim(),

      lastPipelineEventAt:
        base.worker.lastPipelineEventAt == null ||
        typeof base.worker.lastPipelineEventAt !== "string"
          ? null
          : String(base.worker.lastPipelineEventAt),
    };
  }

  if (!(typeof base.runtimeVersion === "string" && base.runtimeVersion.trim())) {
    base.runtimeVersion = readRepoSemanticVersion(repoRoot);
  }

  const wl = Array.isArray(base.workerList) ? base.workerList : [];
  base.runningJobsCount = wl.filter(
    (w) => w && (w.status === "busy" || w.status === "stopping"),
  ).length;

  const mergedFf =
    typeof base.featureFlags === "object" &&
    base.featureFlags !== null &&
    !Array.isArray(base.featureFlags)
      ? base.featureFlags
      : {};

  base.featureFlags = {
    isolatedDataDir: Boolean(
      process.env.SETUP_BOSS_DATA_DIR && String(process.env.SETUP_BOSS_DATA_DIR).trim(),
    ),
    e2eNoopWorker: process.env.SETUP_BOSS_E2E_WORKER_NOOP === "1",
    ...mergedFf,
  };

  delete base.uptimeMsApprox;


  if (
    typeof base.startedAt === "string" &&
    Number.isFinite(Date.parse(base.startedAt))


  )


    base.uptimeMsApprox = Math.max(
      0,

      Date.now() - Date.parse(base.startedAt),
    );


  else base.uptimeMsApprox = null;


  fs.writeFileSync(statusPath, JSON.stringify(base, null, 2), "utf-8");


}

function readDaemonStatus() {
  const { statusPath } = getDaemonDirs();

  if (!fs.existsSync(statusPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  } catch (_) {
    return null;
  }


}

module.exports = {
  writeDaemonStatus,

  readDaemonStatus,

};

