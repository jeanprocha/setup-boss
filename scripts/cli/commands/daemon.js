const path = require("path");
const { spawn } = require("child_process");
const { getSetupBossRepoRoot } = require("../../daemon/lib/repo-root");
const {
  readDaemonPidRaw,
  deletePidFile,
  isPidAlive,
} = require("../../daemon/lib/pid-file");
const { appendDaemonLog } = require("../../daemon/lib/daemon-log");
const { readDaemonStatus } = require("../../daemon/lib/daemon-status");

/** @returns {Promise<void>} */
async function gracefulKillDaemon(pid, waitMs = 8000) {
  try {
    process.kill(pid, "SIGTERM");

  } catch (_) {
    return;

  }



  const t0 = Date.now();

  await new Promise((resolve) => {
    const iv = setInterval(() => {
      if (!isPidAlive(pid)) {
        clearInterval(iv);


        resolve();

      } else if (Date.now() - t0 > waitMs) {
        clearInterval(iv);


        try {
          process.kill(pid, "SIGKILL");

        } catch (_) {
          /* */
        }



        resolve();

      }

    }, 350);

  });

}

/** @param {string[]} argv */
function runDaemonStart(argv) {


  const repoRoot = getSetupBossRepoRoot();


  const existing = readDaemonPidRaw();


  if (existing != null && isPidAlive(existing)) {
    console.log(`Daemon já está a correr (PID ${existing}).`);


    return;

  }



  try {
    appendDaemonLog(


      `fork_prepare stale_pid_was=${existing} stale_alive=${


        existing != null ? isPidAlive(existing) : "n/a"


      }`,


    );


  } catch (_) {
    /* */
  }



  const scriptPath = path.join(repoRoot, "scripts", "daemon", "setup-bossd.js");


  const fg = argv.includes("--foreground");


  const child = spawn(process.execPath, [scriptPath, ...(fg ? ["--foreground"] : [])], {


    cwd: repoRoot,

    detached: true,

    stdio: fg ? "inherit" : "ignore",

    windowsHide: !fg,

  });


  child.unref();


  console.log(


    fg


      ? "Daemon iniciado em primeiro plano (stdio herdado)."
      : `Pedido feito ao SO para iniciar setup-bossd (detached); verifique PID em .setup-boss/daemon/pid.`,
  );


}



/** @returns {Promise<void>} */
async function runDaemonStop() {
  const pid = readDaemonPidRaw();


  if (pid == null || !Number.isFinite(pid)) {


    console.log("Nenhum PID registado (.setup-boss/daemon/pid).");


    deletePidFile();


    return;

  }



  if (!isPidAlive(pid)) {


    console.log(`PID ${pid} já não está vivo; a limpar estado local.`);


    deletePidFile();


    try {


      const { writeDaemonStatus } = require("../../daemon/lib/daemon-status");


      const { countsByStatus, loadQueueUnsafe } = require("../../daemon/lib/queue-store");


      writeDaemonStatus({


        running: false,

        pid: null,

        startedAt: null,

        currentJobId: null,

        worker: { busy: false, currentJobId: null },

        queue: countsByStatus(loadQueueUnsafe()),

        stoppedAt: new Date().toISOString(),


      });


    } catch (_) {
      /* */
    }



    return;

  }



  console.log(`A enviar SIGTERM ao daemon PID ${pid}…`);


  await gracefulKillDaemon(pid);


  deletePidFile();


  try {


    const { writeDaemonStatus } = require("../../daemon/lib/daemon-status");


    const { countsByStatus, loadQueueUnsafe } = require("../../daemon/lib/queue-store");


    writeDaemonStatus({


      running: false,

      pid: null,

      startedAt: null,

      currentJobId: null,

      worker: { busy: false, currentJobId: null },

      queue: countsByStatus(loadQueueUnsafe()),

      stoppedAt: new Date().toISOString(),


    });


  } catch (_) {
    /* */
  }



  console.log("Daemon parado.");

}

function fmtUptime(ms) {


  if (ms == null || !Number.isFinite(ms)) return "—";


  const s = Math.round(ms / 1000);


  if (s < 60) return `${s}s`;


  const m = Math.floor(s / 60);


  const rest = s % 60;


  return `${m}m ${rest}s`;

}

async function runDaemonStatus() {
  const pid = readDaemonPidRaw();
  const alive = pid != null && isPidAlive(pid);
  const st = readDaemonStatus();

  console.log("— Setup Boss daemon —");
  console.log(`pid(ficheiro): ${pid ?? "(nenhum)"}`);
  console.log(`processo vivo: ${alive ? "sim" : "não"}`);

  if (st) {
    console.log(
      `status.json.running: ${st.running} | job atual: ${st.currentJobId ?? "—"}`,
    );
    console.log(
      `uptime(~): ${fmtUptime(st.uptimeMsApprox)} | atualizado: ${st.updatedAt || "—"}`,
    );
    if (st.queue) {
      console.log(`fila(contagens): ${JSON.stringify(st.queue)}`);
    }
  }

  if (alive) {
    try {
      const {
        isRuntimeApiAvailable,
        getStatusViaApi,
        runtimeApiBaseUrl,
      } = require("../lib/runtime-api-client");
      if (await isRuntimeApiAvailable()) {
        console.log("");
        console.log("Runtime API (GET /status):");
        console.log(`  base: ${runtimeApiBaseUrl()}`);
        const r = await getStatusViaApi();
        if (r.status === 200 && r.json && r.json.ok === true && r.json.data) {
          console.log(`  dados: ${JSON.stringify(r.json.data)}`);
        } else {
          console.log(`  indisponível (HTTP ${r.status})`);
        }
      }
    } catch (_) { /* opcional */ }
  }
}


/** @param {string[]} argv */
async function runDaemonCmd(argv) {


  const sub = argv[0];


  if (sub === "start") {


    runDaemonStart(argv.slice(1));


    return;


  }



  if (sub === "stop") {


    await runDaemonStop();


    return;


  }



  if (sub === "status") {


    await runDaemonStatus();


    return;


  }



  console.error("Uso: setup-boss daemon start [--foreground] | stop | status");


  process.exitCode = 1;

}

module.exports = {
  runDaemonCmd,

};
