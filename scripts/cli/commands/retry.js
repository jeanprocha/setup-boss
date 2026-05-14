"use strict";

const { getCliPaths } = require("../lib/paths");

function repoRootFromEnv() {
  const raw = process.env.SETUP_BOSS_CLI_ROOT;
  if (!raw || !String(raw).trim()) return null;
  return String(raw).trim();
}

/**
 * @param {string[]} argv
 */
async function runRetry(argv) {
  const pos = argv.filter((x) => !x.startsWith("--"));
  const jobId = pos[0];
  const json = argv.includes("--json");

  if (!jobId || !String(jobId).trim()) {
    console.error("Uso: setup-boss retry <jobId> [--json]");
    process.exitCode = 1;
    return;
  }

  const { CLI_ROOT } = getCliPaths(repoRootFromEnv());
  const prev = process.env.SETUP_BOSS_CLI_ROOT;
  process.env.SETUP_BOSS_CLI_ROOT = CLI_ROOT;

  try {
    const { requestJobRetry } = require("../../daemon/lib/queue-store");
    const { emitRuntimeEvent } = require("../../daemon/lib/runtime-events");

    const jid = String(jobId).trim();
    const r = requestJobRetry(jid);

    if (!r.ok && r.code === "not_found") {
      if (json) console.log(JSON.stringify({ ok: false, code: "not_found" }));
      else console.error("Job não encontrado.");
      process.exitCode = 1;
      return;
    }

    if (!r.ok) {
      try {
        emitRuntimeEvent({
          type: "job_retry_rejected",
          jobId: jid,
          runId: r.job && r.job.runId ? r.job.runId : null,
          data: { code: r.code, reason: r.reason || null },
        });
      } catch (_) {
        /* */
      }

      if (json) console.log(JSON.stringify({ ok: false, code: r.code }));
      else console.error("Retry rejeitado:", r.code);
      process.exitCode = 1;
      return;
    }

    try {
      emitRuntimeEvent({
        type: "job_retry_requested",
        jobId: jid,
        runId: r.job.runId ?? null,
        data: { lastAttemptAt: r.job.lastAttemptAt ?? null },
      });
      emitRuntimeEvent({
        type: "job_requeued",
        jobId: jid,
        runId: null,
        data: { lastAttemptAt: r.job.lastAttemptAt ?? null },
      });
    } catch (_) {
      /* */
    }

    if (json)
      console.log(
        JSON.stringify({
          ok: true,
          jobId: r.job.id,
          status: r.job.status,
          lastAttemptAt: r.job.lastAttemptAt ?? null,
        }),
      );
    else
      console.log(
        `Retry aceite: ${r.job.id} → pending (lastAttemptAt=${r.job.lastAttemptAt || ""})`,
      );
  } finally {
    if (prev == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prev;
  }
}

module.exports = { runRetry };
