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
async function runMaintenance(argv) {
  const sub = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json") || argv.includes("--json");
  const dryRun = rest.includes("--dry-run") || argv.includes("--dry-run");

  if (sub !== "prune") {
    console.error(
      "Uso: setup-boss maintenance prune [--all] [--events] [--dry-run] [--json] [--force-events]",
    );
    process.exitCode = 1;
    return;
  }

  const all = rest.includes("--all");
  const eventsOnly = rest.includes("--events");
  const wantQueue = !eventsOnly || all;
  const wantEvents = all || eventsOnly;

  const { CLI_ROOT } = getCliPaths(repoRootFromEnv());
  const prev = process.env.SETUP_BOSS_CLI_ROOT;
  process.env.SETUP_BOSS_CLI_ROOT = CLI_ROOT;

  try {
    /** @type {Record<string, unknown>} */
    const out = {};

    if (wantQueue) {
      const { pruneQueueTerminalJobs } = require("../../daemon/lib/queue-store");
      out.queue = pruneQueueTerminalJobs({ dryRun });
    }

    if (wantEvents) {
      const { pruneRuntimeEventsFile } = require("../../daemon/lib/runtime-events");
      const force = rest.includes("--force-events") || argv.includes("--force-events");
      out.events = pruneRuntimeEventsFile({ force });
    }

    if (json) console.log(JSON.stringify({ ok: true, data: out }, null, 2));
    else {
      console.log("Manutenção concluída.");
      if (out.queue) console.log("  queue:", JSON.stringify(out.queue));
      if (out.events) console.log("  events:", JSON.stringify(out.events));
    }
  } finally {
    if (prev == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prev;
  }
}

module.exports = { runMaintenance };
