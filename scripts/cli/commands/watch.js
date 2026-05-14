"use strict";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function phaseLabel(type, data, runId) {
  const phase =
    data && typeof data.phase === "string" && String(data.phase).trim()
      ? String(data.phase).trim()
      : "";
  const t = String(type);
  if (t === "phase_started" || t === "phase_completed" || t === "phase_failed") {
    return phase ? "[" + t + "] " + phase : "[" + t + "]";
  }
  if (t === "runtime_finished" || t === "runtime_started") {
    return runId ? "[" + t + "] runId=" + runId : "[" + t + "]";
  }
  if (
    t === "job_scheduled" ||
    t === "job_available" ||
    t === "job_delayed" ||
    t === "retry_scheduled" ||
    t === "retry_available" ||
    t === "recurring_job_created" ||
    t === "recurring_job_scheduled" ||
    t === "recurring_job_skipped" ||
    t === "scheduler_tick" ||
    t === "scheduler_recovered" ||
    t === "delayed_job_recovered"
  ) {
    const at =
      data && typeof (/** @type {any} */ (data).availableAt) === "string"
        ? String((/** @type {any} */ (data)).availableAt)
        : "";
    const dm =
      data && (/** @type {any} */ (data).delayMs) != null
        ? String((/** @type {any} */ (data)).delayMs)
        : "";

    const bits = [];
    if (at) bits.push("availableAt=" + at);
    if (dm) bits.push("delayMs=" + dm);

    return bits.length ? "[" + t + "] " + bits.join(" ") : "[" + t + "]";
  }
  return "[" + t + "]";
}

async function runWatch(argv) {
  const jobId = argv.filter((x) => !x.startsWith("--"))[0];
  const pollMs = Number(process.env.SETUP_BOSS_WATCH_POLL_MS || 900);
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limitStr = limitArg ? String(limitArg).slice("--limit=".length).trim() : "";
  const parsedLimit =
    Number.isFinite(Number(limitStr)) && Number(limitStr) > 0
      ? Math.floor(Number(limitStr))
      : 100;

  if (!jobId || !String(jobId).trim()) {
    console.error("Uso: setup-boss watch <jobId> [--limit=N]");
    process.exitCode = 1;
    return;
  }

  const { isRuntimeApiAvailable, getEventsViaApi } = require("../lib/runtime-api-client");

  let after = "";
  let shuttingDown = false;

  process.on("SIGINT", () => {
    shuttingDown = true;
    console.log("\n[w] watch terminado (job continua).\n");
  });

  console.log(
    "[watch] jobId=" +
      String(jobId).trim() +
      " (polling " +
      String(Math.max(200, pollMs)) +
      "ms; Ctrl+C para sair)",
  );

  try {
    while (!shuttingDown) {
      await sleep(Math.max(200, pollMs));
      if (shuttingDown) break;

      try {
        if (!(await isRuntimeApiAvailable(Number(process.env.SETUP_BOSS_WATCH_HEALTH_MS || 1200))))
          continue;

        const r = await getEventsViaApi({
          jobId: String(jobId).trim(),
          after,
          limit: parsedLimit,
        });

        if (!(r.status === 200 && r.json && r.json.ok && Array.isArray(r.json.data))) continue;

        const rows = r.json.data;

        if (rows.length > 0) {
          after = rows[rows.length - 1].id;
          for (const ev of rows) {
            process.stdout.write(phaseLabel(String(ev.type), ev.data || {}, ev.runId) + "\n");
          }
        }
      } catch (_) {
        /* próximo ciclo */
      }
    }
  } catch (_) {
    console.error("[watch] Erro ao observar.");
    process.exitCode = 1;
  }
}

module.exports = { runWatch };
