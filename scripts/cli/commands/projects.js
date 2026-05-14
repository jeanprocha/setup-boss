"use strict";

const { getSetupBossRepoRoot } = require("../../daemon/lib/repo-root");
const { buildProjectsOverview } = require("../../daemon/lib/project-registry");

async function runProjects(argv) {
  const json = argv.includes("--json");

  try {
    const { isRuntimeApiAvailable, httpReqJson } = require("../lib/runtime-api-client");

    if (await isRuntimeApiAvailable()) {
      const r = await httpReqJson({
        path: "/projects",
        method: "GET",
        timeoutMs: Number(process.env.SETUP_BOSS_CLI_API_TIMEOUT_MS || 8000),
      });

      if (r.status === 200 && r.json && r.json.ok && Array.isArray(r.json.data)) {
        if (json) {
          console.log(JSON.stringify(r.json.data, null, 2));
          return;
        }

        console.log("(Projetos conhecidos — use --json para lista completa)");

        for (const row of r.json.data) {
          console.log(
            `${row.projectId}\t${row.displayName || ""}\t${row.projectRoot || ""}`,
          );
        }

        return;
      }
    }
  } catch (_) {
    /* filesystem */
  }

  const prev = process.env.SETUP_BOSS_CLI_ROOT;

  const repo = getSetupBossRepoRoot();

  process.env.SETUP_BOSS_CLI_ROOT = repo;

  try {
    const { loadQueueUnsafe } = require("../../daemon/lib/queue-store");

    const rows = buildProjectsOverview(loadQueueUnsafe().jobs);

    if (json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    console.log("(Projetos — filesystem; use --json)");

    for (const row of rows) {
      console.log(
        `${row.projectId}\t${row.displayName || ""}\t${row.projectRoot || ""}`,
      );
    }
  } finally {
    if (prev == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prev;
  }
}

module.exports = { runProjects };
