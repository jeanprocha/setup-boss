const fs = require("fs");
const path = require("path");
const { getDaemonDirs } = require("./daemon-paths");
const {
  loadQueueUnsafe,
  countsByStatus,
} = require("./queue-store");

/** Evita spam no tick quando o disco bloqueia (Defender, sync, indexação). */
let lastStatusWriteFailLogMs = 0;

function sleepBusyWaitSync(ms) {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    /* spin — curto, só entre retries de status */
  }
}

/**
 * Escreve ficheiro de forma tolerante a bloqueios breves no Windows (UNKNOWN, EPERM).
 * 1) ficheiro temporário no mesmo directório; 2) rename atómico; 3) retries com backoff.
 *
 * @param {string} destPath
 * @param {string} utf8Content
 */
function writeFileReplaceWithRetrySync(destPath, utf8Content) {
  const dir = path.dirname(destPath);
  const base = path.basename(destPath);
  const maxAttempts = 8;
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tmpPath = path.join(dir, `.${base}.${process.pid}.${attempt}.tmp`);
    try {
      fs.writeFileSync(tmpPath, utf8Content, "utf8");
      try {
        if (fs.existsSync(destPath)) {
          try {
            fs.unlinkSync(destPath);
          } catch (_) {
            /* destino pode estar momentaneamente bloqueado */
          }
        }
        fs.renameSync(tmpPath, destPath);
        return;
      } catch (e) {
        lastErr = e;
        try {
          fs.unlinkSync(tmpPath);
        } catch (_) {
          /* */
        }
      }
    } catch (e) {
      lastErr = e;
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (_) {
        /* */
      }
    }

    sleepBusyWaitSync(15 * (attempt + 1));
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(destPath, utf8Content, "utf8");
      return;
    } catch (e) {
      lastErr = e;
      sleepBusyWaitSync(40 * (attempt + 1));
    }
  }

  throw lastErr || new Error("writeFileReplaceWithRetrySync: falha desconhecida");
}

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

  const payload = JSON.stringify(base, null, 2);
  try {
    writeFileReplaceWithRetrySync(statusPath, payload);
  } catch (e) {
    const now = Date.now();
    if (now - lastStatusWriteFailLogMs > 30_000) {
      lastStatusWriteFailLogMs = now;
      const msg = e && e.message ? String(e.message) : String(e);
      const code = e && e.code ? String(e.code) : "";
      console.error(
        `[setup-bossd] writeDaemonStatus: não foi possível gravar status.json (${code || "?"}) — ${msg}. O daemon continua; verifique permissões, antivirus ou sync sobre .setup-boss/daemon/.`,
      );
    }
  }
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

